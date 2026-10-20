import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "../../contexts/UserContext";
import {
  ClubExperienceScope,
  getOrganizerCelebrateTagline,
} from "../../club-experience";
import {
  JUGADOR_CATEGORIA_LABELS,
} from "../../lib/rivieraJugadores/constants";
import { getJugadorPerfilMeta } from "../../lib/rivieraJugadores/jugadorPerfilDisplay";
import {
  isRankingPointsBreakdownPending,
  resolveCareerTotalAllClubsDisplay,
} from "../../lib/rivieraJugadores/jugadorPuntosBreakdown";
import {
  computePublicProfileStats,
} from "../../lib/rivieraJugadores/historialDisplay";
import { getPublicPlayerProfileData } from "../../lib/rivieraJugadores/getPublicPlayerProfileData";
import { withTimeout } from "../../lib/async/withTimeout";
import { errorLogPayload, errorMessage } from "../../lib/errors/normalizeError";
import { prefetchOrganizerDisplayNames } from "../../lib/rivieraJugadores/grantedRankingDisplay";
import {
  rankingLabelForPublicFicha,
  resolveRegistrationOrganizadorIdForPublicFicha,
} from "../../lib/rivieraJugadores/publicFichaRanking";
import { clearPublicFichaHandoff, takePublicFichaHandoff } from "../../lib/rivieraJugadores/publicFichaHandoff";
import { getOrganizerDisplayNameSync } from "../../lib/organizer/organizerDisplayName";
import { getRedesPublicas } from "../../lib/rivieraJugadores/jugadorRedes";
import { normalizeRivieraGenero } from "../../lib/rivieraJugadores/genero";
import {
  PUBLIC_ORGANIZER_RPC_FALLBACK,
  getPublicOrganizadorIdWithoutUser,
} from "../../lib/rivieraJugadores/publicOrganizador";
import type {
  RatingHistorialEntry,
  RivieraJugadorWithStats,
} from "../../lib/rivieraJugadores/types";
import type { JugadorParticipacion } from "../../lib/rivieraJugadores/types";
import type { ResolvedPlayerIdentity } from "../../lib/rivieraJugadores/playerIdentityService";
import { TablerIcon } from "../ui/TablerIcon";
import { PublicModeShell } from "../platform/PublicModeShell";
import { JugadorAvatarHero } from "./JugadorAvatarHero";
import { JugadorPaisBadge } from "./JugadorPaisBadge";
import { isValidRivieraId } from "../../lib/rivieraJugadores/rivieraIdDisplay";
import { RivieraIdBadge } from "./RivieraIdBadge";
import { JugadorPuntosBreakdown } from "./JugadorPuntosBreakdown";
import { JugadorOfficialRomcPuntos } from "./JugadorOfficialRomcPuntos";
import { JugadorPublicHistorial } from "./JugadorPublicHistorial";
import { JugadorRewardsPanel, isValidClubDisplayName } from "./JugadorRewardsPanel";
import { RatingNivel } from "./RatingNivel";
import { JugadorPublicFichaAside } from "./JugadorPublicFichaAside";
import { JugadorRedesPublicas } from "./JugadorRedesPublicas";
import { JugadoresPublicShell } from "./JugadoresPublicShell";
import { buildMarketingOfficialRankingsUrl } from "../../lib/rivieraOfficialSite";
import { buildPublicRankingUrl, navigatePublicJugadores } from "./jugadoresPublicNav";
import { fetchStudentCoachingOverview } from "../../lib/coaching/coachingApi";
import "./riviera-jugadores-public-ficha.css";

interface JugadorPublicFichaProps {
  slug?: string;
  playerId?: string;
  /** @deprecated El contexto de club viene de ?org= o /ranking/o/ en la URL. */
  internalClub?: boolean;
}

function FichaTopbar({ rankingUrl }: { rankingUrl: string }) {
  return (
    <nav className="rjp-ficha-topbar" aria-label="Navegación del perfil">
      <button
        type="button"
        className="rjp-ficha-topbar__back"
        onClick={() => navigatePublicJugadores(rankingUrl)}
      >
        <TablerIcon name="arrow-left" size={18} />
        Ranking
      </button>
    </nav>
  );
}

function FichaSkeleton() {
  return (
    <div className="rjp-ficha-skel" aria-busy="true" aria-label="Cargando jugador">
      <p className="rjp-ficha-skel__label">Cargando jugador…</p>
      <div className="rjp-ficha-skel__block rjp-ficha-skel__hero" />
      <div className="rjp-ficha-skel__block rjp-ficha-skel__row" />
      <div className="rjp-ficha-skel__block rjp-ficha-skel__chart" />
      <div className="rjp-ficha-skel__block rjp-ficha-skel__list" />
    </div>
  );
}

const LOAD_TIMEOUT_MS = 20_000;

function useLatestGuard() {
  const tokenRef = useRef(0);
  const next = useCallback(() => {
    tokenRef.current += 1;
    const token = tokenRef.current;
    return () => token === tokenRef.current;
  }, []);
  return next;
}

function handoffToJugador(
  handoff: NonNullable<ReturnType<typeof takePublicFichaHandoff>>
): RivieraJugadorWithStats {
  return {
    id: handoff.jugadorId,
    nombre: handoff.nombre,
    slug: handoff.jugadorId,
    foto_url: handoff.fotoUrl,
    categoria: handoff.categoria as RivieraJugadorWithStats["categoria"],
    genero: (handoff.genero as RivieraJugadorWithStats["genero"]) ?? "M",
    organizador_id: handoff.organizadorId,
    estado: "activo",
    visible_publico: true,
    riviera_id: handoff.rivieraId,
    rating: null,
    rating_partidos: 0,
    rating_fiabilidad: null,
    stats:
      handoff.puntosClub != null
        ? {
            jugador_id: handoff.jugadorId,
            total_partidos: 0,
            victorias: 0,
            derrotas: 0,
            empates: 0,
            participaciones_solo: 0,
            pct_victorias: 0,
            total_retas: 0,
            total_torneos_express: 0,
            total_ligas: 0,
            total_americanos: 0,
            sets_favor_total: 0,
            sets_contra_total: 0,
            racha_actual: "",
            ultima_actividad: null,
            puntos_totales: handoff.puntosClub,
            updated_at: new Date().toISOString(),
          }
        : undefined,
  } as unknown as RivieraJugadorWithStats;
}

export const JugadorPublicFicha: React.FC<JugadorPublicFichaProps> = ({
  slug,
  playerId,
}) => {
  const { user } = useUser();
  const viewingOrgId = getPublicOrganizadorIdWithoutUser(
    typeof window !== "undefined" ? window.location.pathname : undefined
  );
  const [jugador, setJugador] = useState<RivieraJugadorWithStats | null>(null);
  const [historial, setHistorial] = useState<JugadorParticipacion[]>([]);
  const [historialOtrosClubes, setHistorialOtrosClubes] = useState<JugadorParticipacion[]>([]);
  const [hasOrgContext, setHasOrgContext] = useState(Boolean(viewingOrgId?.trim()));
  const [rankingPos, setRankingPos] = useState<number | null>(null);
  const [historialRating, setHistorialRating] = useState<RatingHistorialEntry[]>([]);
  const [identity, setIdentity] = useState<ResolvedPlayerIdentity | null>(null);
  /** Hero aún no tiene fila base (ni handoff). */
  const [heroLoading, setHeroLoading] = useState(true);
  /** Carrera / rating / historial aún en vuelo. */
  const [detailLoading, setDetailLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Sube tras prefetch de nombres de club para refrescar labels (Hackpadel ≠ Riviera Open). */
  const [clubLabelsEpoch, setClubLabelsEpoch] = useState(0);
  const [coachingBannerInfo, setCoachingBannerInfo] = useState<{
    active: boolean;
    coachName?: string;
    clubName?: string;
    balance?: number;
  } | null>(null);
  const nextLoadToken = useLatestGuard();

  const load = useCallback(async () => {
    const isCurrent = nextLoadToken();
    setLoadError(null);
    setDetailLoading(true);

    const handoff = takePublicFichaHandoff(viewingOrgId, playerId);
    if (handoff && isCurrent()) {
      setJugador(handoffToJugador(handoff));
      // # provisional del handoff; la verdad final siempre es la RPC 1-jugador.
      setRankingPos(handoff.posicion);
      setHasOrgContext(true);
      setHeroLoading(false);
    } else {
      setHeroLoading(true);
      setJugador(null);
      setIdentity(null);
      setRankingPos(null);
      setHistorial([]);
      setHistorialOtrosClubes([]);
      setHistorialRating([]);
    }

    try {
      const profile = await withTimeout(
        getPublicPlayerProfileData({
          playerId,
          slug,
          viewingOrgId,
          ratingRpc: viewingOrgId ? PUBLIC_ORGANIZER_RPC_FALLBACK : undefined,
          onHeroReady: (heroJugador) => {
            if (!isCurrent()) return;
            setJugador((prev) => {
              if (!prev) return heroJugador;
              return {
                ...heroJugador,
                stats: heroJugador.stats ?? prev.stats,
                riviera_id: heroJugador.riviera_id ?? prev.riviera_id,
                foto_url: heroJugador.foto_url ?? prev.foto_url,
              };
            });
            setHeroLoading(false);
          },
          onRankingPosReady: (pos) => {
            if (!isCurrent()) return;
            if (pos != null && pos > 0) setRankingPos(pos);
          },
        }),
        { timeoutMs: LOAD_TIMEOUT_MS, label: "El perfil del jugador" }
      );
      if (!isCurrent()) return;

      if (!profile) {
        if (!handoff) {
          setJugador(null);
          setIdentity(null);
          setRankingPos(null);
        }
        setHistorial([]);
        setHistorialOtrosClubes([]);
        setHistorialRating([]);
        setHeroLoading(false);
        setDetailLoading(false);
        return;
      }

      setJugador(profile.jugador);
      setIdentity(profile.identity);
      setHasOrgContext(profile.hasOrgContext);
      setHistorial(profile.historialMain);
      setHistorialOtrosClubes(profile.historialOtrosClubes);
      setHistorialRating(profile.historialRating);
      // Conservar # del handoff si la RPC aún no devolvió posición.
      setRankingPos((prev) =>
        profile.localRankingPos != null ? profile.localRankingPos : prev
      );
      setHeroLoading(false);
      setDetailLoading(false);
      clearPublicFichaHandoff(viewingOrgId, playerId);

      void prefetchOrganizerDisplayNames([
        profile.viewingOrgId,
        profile.identity.homeOrganizadorId,
        profile.jugador.grantedAccess?.ownerOrganizadorId,
        resolveRegistrationOrganizadorIdForPublicFicha(profile.jugador),
        ...(profile.jugador.careerPuntosByClub?.map((g) => g.organizadorId) ?? []),
        ...(profile.jugador.multiclubGranteePuntos?.map((g) => g.organizadorId) ?? []),
        ...(profile.jugador.pointsBreakdown?.pointsByClub.map(
          (c) => c.organizador_id
        ) ?? []),
      ])
        .then(() => {
          if (isCurrent()) setClubLabelsEpoch((n) => n + 1);
        })
        .catch((e) => {
          console.warn(
            "[JugadorPublicFicha] prefetchOrganizerDisplayNames:",
            errorLogPayload(e)
          );
        });
    } catch (e) {
      if (!isCurrent()) return;
      console.warn("[JugadorPublicFicha] load:", errorLogPayload(e));
      setLoadError(`No se pudo cargar el perfil. ${errorMessage(e)}`);
      if (!handoff) {
        setJugador(null);
        setRankingPos(null);
      }
      setHistorial([]);
      setHistorialOtrosClubes([]);
      setHistorialRating([]);
      setHeroLoading(false);
      setDetailLoading(false);
    }
  }, [slug, viewingOrgId, playerId, nextLoadToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let isCancelled = false;
    if (!user || !jugador) {
      setCoachingBannerInfo(null);
      return;
    }

    const checkCoaching = async () => {
      try {
        const overview = await fetchStudentCoachingOverview();
        if (isCancelled) return;
        if (
          !overview.ok ||
          !overview.linked ||
          !overview.relationships ||
          overview.relationships.length === 0
        ) {
          setCoachingBannerInfo(null);
          return;
        }

        // Titularidad comprobada: solo se muestra si el usuario autenticado es el titular de la ficha
        const isTitular =
          (Boolean(overview.rivieraId) && Boolean(jugador.riviera_id) && overview.rivieraId === jugador.riviera_id) ||
          overview.relationships.some(
            (r) =>
              r.player.id === jugador.id ||
              (Boolean(r.player.rivieraId) && Boolean(jugador.riviera_id) && r.player.rivieraId === jugador.riviera_id)
          ) ||
          (Boolean(identity?.rivieraId) && overview.rivieraId === identity?.rivieraId) ||
          (identity?.linkedJugadorIds?.some((lid) =>
            overview.relationships.some((r) => r.player.id === lid)
          ) ?? false);

        if (!isTitular) {
          setCoachingBannerInfo(null);
          return;
        }

        const primaryRel =
          overview.relationships.find((r) => r.isPrimary) ||
          overview.relationships[0];

        setCoachingBannerInfo({
          active: true,
          coachName: primaryRel?.coach.nombre,
          clubName: primaryRel?.club.nombre,
          balance: primaryRel?.balance.balanceClasses,
        });
      } catch {
        if (!isCancelled) {
          setCoachingBannerInfo(null);
        }
      }
    };

    void checkCoaching();
    return () => {
      isCancelled = true;
    };
  }, [user, jugador, identity]);

  const rankingUrl = hasOrgContext
    ? buildPublicRankingUrl(
        viewingOrgId,
        normalizeRivieraGenero(jugador?.genero) ?? "M"
      )
    : playerId
    ? buildMarketingOfficialRankingsUrl(
        jugador?.organizador_id,
        normalizeRivieraGenero(jugador?.genero) ?? "M"
      )
    : buildPublicRankingUrl(
        viewingOrgId,
        normalizeRivieraGenero(jugador?.genero) ?? "M"
      );

  const historialCompleto = useMemo(
    () => [...historial, ...historialOtrosClubes],
    [historial, historialOtrosClubes]
  );

  const profileStats = useMemo(() => {
    try {
      const fromHist = computePublicProfileStats(historialCompleto);
      const tieneHistorial = historialCompleto.length > 0;
      const victorias = tieneHistorial
        ? fromHist.partidosGanados
        : jugador?.stats?.victorias ?? 0;
      const perdidas = tieneHistorial
        ? fromHist.partidosPerdidos
        : jugador?.stats?.derrotas ?? 0;
      const winRate =
        victorias + perdidas > 0
          ? Math.round((victorias / (victorias + perdidas)) * 100)
          : null;

      return {
        torneosExpress: tieneHistorial
          ? fromHist.torneosExpress
          : jugador?.stats?.total_torneos_express ?? 0,
        eventosJugados: tieneHistorial
          ? fromHist.eventosJugados
          : jugador?.stats?.total_partidos ?? 0,
        victorias,
        partidosPerdidos: perdidas,
        winRate,
      };
    } catch (e) {
      console.warn("[JugadorPublicFicha] profileStats:", errorLogPayload(e));
      return {
        torneosExpress: 0,
        eventosJugados: 0,
        victorias: 0,
        partidosPerdidos: 0,
        winRate: null as number | null,
      };
    }
  }, [historialCompleto, jugador?.stats]);

  const participatingClubIds = useMemo(() => {
    const ids = new Set<string>();
    if (viewingOrgId) ids.add(viewingOrgId);
    if (jugador) {
      const regOrg =
        jugador.grantedAccess?.ownerOrganizadorId?.trim() ??
        resolveRegistrationOrganizadorIdForPublicFicha(jugador);
      if (regOrg) ids.add(regOrg);
      jugador.careerPuntosByClub?.forEach((c) => {
        if (c.organizadorId) ids.add(c.organizadorId);
      });
      jugador.multiclubGranteePuntos?.forEach((c) => {
        if (c.organizadorId) ids.add(c.organizadorId);
      });
      jugador.pointsBreakdown?.pointsByClub?.forEach((c) => {
        if (c.organizador_id) ids.add(c.organizador_id);
      });
    }
    if (identity?.homeOrganizadorId) ids.add(identity.homeOrganizadorId);
    identity?.linkedProfiles?.forEach((p) => {
      if (p.organizadorId) ids.add(p.organizadorId);
    });
    return Array.from(ids);
  }, [viewingOrgId, identity, jugador]);

  if (heroLoading && !jugador) {
    return (
      <ClubExperienceScope
        organizadorId={viewingOrgId}
        pendingUntilOrganizador
      >
        <JugadoresPublicShell variant="ficha">
          <PublicModeShell className="rjp-ficha-shell">
            <div className="rjp-ficha">
              <FichaTopbar rankingUrl={rankingUrl} />
              <FichaSkeleton />
            </div>
          </PublicModeShell>
        </JugadoresPublicShell>
      </ClubExperienceScope>
    );
  }

  if (!jugador) {
    return (
      <ClubExperienceScope
        organizadorId={viewingOrgId}
        pendingUntilOrganizador={!viewingOrgId}
      >
        <JugadoresPublicShell variant="ficha">
          <FichaTopbar rankingUrl={rankingUrl} />
          {loadError ? (
            <div className="rjp-ficha-empty" role="alert">
              <p>{loadError}</p>
              <button type="button" className="riviera-btn-secondary" onClick={() => void load()}>
                Reintentar
              </button>
            </div>
          ) : (
            <p className="rjp-ficha-empty">
              {viewingOrgId
                ? "Jugador no encontrado en este club."
                : "Jugador no encontrado o no está visible al público."}
            </p>
          )}
        </JugadoresPublicShell>
      </ClubExperienceScope>
    );
  }

  const registrationOrgId =
    jugador.grantedAccess?.ownerOrganizadorId?.trim() ??
    resolveRegistrationOrganizadorIdForPublicFicha(jugador);
  const registrationClubName = registrationOrgId
    ? getOrganizerDisplayNameSync(registrationOrgId)
    : null;
  const viewingClubName = viewingOrgId
    ? getOrganizerDisplayNameSync(viewingOrgId)
    : null;
  const redes = getRedesPublicas(jugador);
  const rankingVal = rankingPos != null ? `#${rankingPos}` : "—";
  const rankingLabel = rankingLabelForPublicFicha(jugador, hasOrgContext);
  const showRivieraId = isValidRivieraId(jugador.riviera_id);
  const perfilMeta = getJugadorPerfilMeta(jugador);
  const hasPhoto = Boolean(jugador.foto_url?.trim());

  const identityMetaLine = perfilMeta.map((item) => item.value).join(" · ");
  const ratingDisplay = (jugador.rating ?? 3).toFixed(2);
  const careerTotalPts = resolveCareerTotalAllClubsDisplay(
    jugador,
    false,
    viewingOrgId
  );
  const careerTotalPending = isRankingPointsBreakdownPending(jugador, {
    hasOrgContext,
  });

  return (
    <ClubExperienceScope
      organizadorId={viewingOrgId ?? jugador.organizador_id}
      pendingUntilOrganizador
    >
    <JugadoresPublicShell variant="ficha">
      <PublicModeShell className="rjp-ficha-shell">
      <div className="rjp-ficha">
        <FichaTopbar rankingUrl={rankingUrl} />

        <div className="rjp-ficha__layout">
          <div className="rjp-ficha__col rjp-ficha__col--profile">
            <section className="rjp-ficha-player-card" aria-label="Player card">
              <div
                className={`rjp-ficha-hero rjp-ficha-hero--editorial${
                  hasPhoto ? " rjp-ficha-hero--photo" : ""
                }`}
              >
                {hasPhoto && jugador.foto_url ? (
                  <div className="rjp-ficha-hero__media">
                    <img
                      className="rjp-ficha-hero__photo"
                      src={jugador.foto_url}
                      alt={`Foto de ${jugador.nombre}`}
                      width={800}
                      height={1067}
                      decoding="async"
                      loading="lazy"
                    />
                    <div className="rjp-ficha-hero__media-gradient" aria-hidden />
                    {rankingPos != null ? (
                      <div className="rjp-ficha-hero__rank-seal" aria-label={`${rankingLabel} ${rankingVal}`}>
                        <span className="rjp-ficha-hero__rank-seal-label">{rankingLabel}</span>
                        <span className="rjp-ficha-hero__rank-seal-val">{rankingVal}</span>
                      </div>
                    ) : detailLoading ? (
                      <div className="rjp-ficha-hero__rank-seal rjp-ficha-hero__rank-seal--pending" aria-busy="true">
                        <span className="rjp-ficha-hero__rank-seal-label">{rankingLabel}</span>
                        <span className="rjp-ficha-hero__rank-seal-val">…</span>
                      </div>
                    ) : null}
                    <div className="rjp-ficha-hero__media-footer">
                      {showRivieraId ? (
                        <RivieraIdBadge
                          rivieraId={jugador.riviera_id!}
                          size="md"
                          embedded
                          className="rjp-ficha-hero__riviera-id-pill"
                        />
                      ) : null}
                      <div
                        className="rjp-ficha-hero__rating-pill"
                        aria-label={`Nivel ${ratingDisplay}`}
                      >
                        <span className="rjp-ficha-hero__rating-pill-label">Nivel</span>
                        <span className="rjp-ficha-hero__rating-pill-val">{ratingDisplay}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rjp-ficha-hero__avatar-wrap">
                    <JugadorAvatarHero
                      fotoUrl={null}
                      nombre={jugador.nombre}
                      categoria={jugador.categoria}
                    />
                  </div>
                )}

                <div className="rjp-ficha-hero__identity-block">
                  <div className="rjp-ficha-hero__title-row">
                    <h1 className="rjp-ficha-hero__name">{jugador.nombre}</h1>
                    {!hasPhoto && rankingPos != null ? (
                      <span className="rjp-ficha-hero__status-badge">
                        {rankingLabel} #{rankingPos}
                      </span>
                    ) : !hasPhoto && detailLoading ? (
                      <span className="rjp-ficha-hero__status-badge rjp-ficha-hero__status-badge--pending">
                        {rankingLabel} …
                      </span>
                    ) : null}
                  </div>

                  <div className="rjp-ficha-hero__identity-meta">
                    <JugadorPaisBadge
                      codigo={jugador.pais_codigo}
                      size="sm"
                      className="rjp-ficha-hero__pais-inline"
                    />
                    {identityMetaLine ? (
                      <span className="rjp-ficha-hero__meta-line">{identityMetaLine}</span>
                    ) : null}
                  </div>

                  <p className="rjp-ficha-hero__cat-pill">
                    {JUGADOR_CATEGORIA_LABELS[jugador.categoria]}
                  </p>

                  {registrationClubName && isValidClubDisplayName(registrationClubName) ? (
                    <p className="rjp-ficha-hero__home-club" aria-label={`Club: ${registrationClubName}`}>
                      <TablerIcon name="building-community" size={13} className="rjp-ficha-hero__home-club-icon" />
                      <span>Club: <strong>{registrationClubName}</strong></span>
                    </p>
                  ) : null}

                  {hasOrgContext &&
                  viewingClubName &&
                  registrationOrgId !== viewingOrgId ? (
                    <p className="rjp-ficha-hero__viewing">
                      Viendo desde {viewingClubName}
                    </p>
                  ) : null}

                  {!hasPhoto && showRivieraId ? (
                    <div className="rjp-ficha-hero__riviera-id">
                      <span className="rjp-ficha-hero__riviera-id-label">
                        Riviera ID
                      </span>
                      <RivieraIdBadge
                        rivieraId={jugador.riviera_id!}
                        size="md"
                        className="rjp-ficha-hero__riviera-id-badge"
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rjp-ficha-player-card__competitive" aria-label="Puntaje y ranking">
                <div className="rjp-ficha-player-card__score">
                  <p className="rjp-ficha-player-card__eyebrow">Puntaje Riviera</p>
                  <div className="rjp-ficha-player-card__score-val">
                    {careerTotalPending ? (
                      <span
                        className="rjp-ficha-stat__val rjp-pts--na"
                        aria-busy="true"
                      >
                        Cargando carrera…
                      </span>
                    ) : (
                      <span className="rjp-ficha-stat__val">
                        {careerTotalPts.toLocaleString("es-MX")} pts
                      </span>
                    )}
                  </div>
                </div>
                <div className="rjp-ficha-player-card__clubs">
                  <p className="rjp-ficha-player-card__eyebrow">Puntos por club</p>
                  <JugadorPuntosBreakdown
                    key={`pts-fold-${clubLabelsEpoch}`}
                    jugador={jugador}
                    clubOrganizadorId={viewingOrgId}
                    hasOrgContext={hasOrgContext}
                    profileCard
                    registrationOrganizerId={registrationOrgId}
                    className="rjp-ficha-player-card__breakdown"
                  />
                </div>
              </div>

              <JugadorRedesPublicas redes={redes} />
            </section>
          </div>

          <section
            className="rjp-ficha-position rjp-ficha-surface rjp-ficha-position--desktop"
            aria-label="Posición actual"
          >
            <p className="rjp-ficha-section__eyebrow">Posición actual</p>
            <div className="rjp-ficha-position__headline">
              <span
                className={`rjp-ficha-position__rank${
                  rankingPos == null ? " rjp-ficha-position__rank--empty" : ""
                }`}
              >
                {rankingVal}
              </span>
              <span className="rjp-ficha-position__rank-label">{rankingLabel}</span>
            </div>
            {(!hasOrgContext || jugador.visible_publico) && (
              <div className="rjp-ficha-position__official">
                <JugadorOfficialRomcPuntos jugador={jugador} />
              </div>
            )}
            <div className="rjp-ficha-position__breakdown">
              <JugadorPuntosBreakdown
                key={`pts-breakdown-${clubLabelsEpoch}`}
                jugador={jugador}
                clubOrganizadorId={viewingOrgId}
                hasOrgContext={hasOrgContext}
                profileCard
                registrationOrganizerId={registrationOrgId}
              />
            </div>
          </section>

          {/* BANNER PRIVADO Y VERIFICADO: RIVIERA COACHING */}
          {coachingBannerInfo && (
            <section
              className="rjp-ficha-coaching-banner"
              aria-label="Acceso privado a Riviera Coaching"
              style={{
                margin: "1.25rem 0",
                background: "linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.98) 100%)",
                border: "1px solid rgba(56, 189, 248, 0.4)",
                borderRadius: "12px",
                padding: "1.25rem 1.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "1rem",
                boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", minWidth: "260px", flex: 1 }}>
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "10px",
                    background: "linear-gradient(135deg, rgba(56, 189, 248, 0.2) 0%, rgba(14, 165, 233, 0.35) 100%)",
                    border: "1px solid rgba(56, 189, 248, 0.45)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#38bdf8",
                    flexShrink: 0,
                  }}
                >
                  <TablerIcon name="certificate" size={26} />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "#38bdf8",
                      }}
                    >
                      RIVIERA COACHING • VER MI COACHING
                    </span>
                    {coachingBannerInfo.balance != null && (
                      <span
                        style={{
                          fontSize: "0.72rem",
                          padding: "0.15rem 0.55rem",
                          borderRadius: "12px",
                          background: coachingBannerInfo.balance > 0 ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)",
                          color: coachingBannerInfo.balance > 0 ? "#34d399" : "#fbbf24",
                          fontWeight: 700,
                        }}
                      >
                        {coachingBannerInfo.balance} {coachingBannerInfo.balance === 1 ? "clase disponible" : "clases disponibles"}
                      </span>
                    )}
                  </div>
                  <h3
                    style={{
                      margin: "0.25rem 0 0.15rem",
                      fontSize: "1.05rem",
                      fontWeight: 700,
                      color: "#ffffff",
                    }}
                  >
                    {coachingBannerInfo.coachName
                      ? `Entrenador: ${coachingBannerInfo.coachName}${coachingBannerInfo.clubName ? ` • ${coachingBannerInfo.clubName}` : ""}`
                      : "Tu seguimiento deportivo oficial"}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.85rem",
                      color: "var(--ro-text-secondary, #94a3b8)",
                    }}
                  >
                    Consulta tus clases asignadas, historial de sesiones impartidas y notas de seguimiento.
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="coaching-btn coaching-btn--primary"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.65rem 1.35rem",
                  fontSize: "0.9rem",
                  fontWeight: 700,
                  borderRadius: "8px",
                  background: "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)",
                  color: "#ffffff",
                  border: "none",
                  cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(14, 165, 233, 0.35)",
                }}
                onClick={() => {
                  window.location.href = "/coaching/mi-coaching";
                }}
              >
                <TablerIcon name="arrow-right" size={16} />
                Ver Mi Coaching
              </button>
            </section>
          )}

          {jugador && (
            <JugadorRewardsPanel
              key={`rewards-${clubLabelsEpoch}`}
              mode="player"
              jugadorId={jugador.id}
              organizadorId={viewingOrgId || registrationOrgId}
              clubName={getOrganizerDisplayNameSync(viewingOrgId || registrationOrgId)}
              className="rjp-ficha-rewards"
              participaciones={historialCompleto}
              currentUser={user}
              linkedProfiles={identity?.linkedProfiles}
              linkedJugadorIds={identity?.linkedJugadorIds}
              rivieraId={identity?.rivieraId}
              participatingClubIds={participatingClubIds}
            />
          )}

          <div className="rjp-ficha__col rjp-ficha__col--summary">
            <JugadorPublicFichaAside
              retas={profileStats.eventosJugados}
              torneosExpress={profileStats.torneosExpress}
              victorias={profileStats.victorias}
              partidosPerdidos={profileStats.partidosPerdidos}
              winRate={profileStats.winRate}
            />
            <section className="rjp-ficha-rating rjp-ficha-surface">
              {detailLoading && historialRating.length === 0 ? (
                <div className="rjp-ficha-skel rjp-ficha-skel--secondary" aria-busy="true">
                  <div className="rjp-ficha-skel__block rjp-ficha-skel__chart" />
                </div>
              ) : (
                <RatingNivel
                  layout="standalone"
                  density="compact"
                  rating={jugador.rating ?? 3}
                  fiabilidad={jugador.rating_fiabilidad ?? 0.2}
                  partidosJugados={jugador.rating_partidos ?? 0}
                  historial={historialRating}
                />
              )}
            </section>
          </div>

          <div className="rjp-ficha__col rjp-ficha__col--historial">
            {detailLoading && historial.length === 0 ? (
              <div className="rjp-ficha-skel rjp-ficha-skel--secondary" aria-busy="true">
                <div className="rjp-ficha-skel__block rjp-ficha-skel__list" />
              </div>
            ) : (
              <JugadorPublicHistorial
                participaciones={historial}
                otrosClubesParticipaciones={historialOtrosClubes}
                categoriaFallback={jugador.categoria}
              />
            )}
          </div>
        </div>

        <footer className="rjp-ficha-footer">
          <span className="rjp-ficha-footer__line" aria-hidden />
          {getOrganizerCelebrateTagline(
            getOrganizerDisplayNameSync(registrationOrgId)
          )}
        </footer>
      </div>
      </PublicModeShell>
    </JugadoresPublicShell>
    </ClubExperienceScope>
  );
};
