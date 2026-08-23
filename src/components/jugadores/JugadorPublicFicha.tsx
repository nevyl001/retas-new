import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ClubExperienceScope,
  getOrganizerCelebrateTagline,
} from "../../club-experience";
import {
  JUGADOR_CATEGORIA_AVATAR_BADGE,
  JUGADOR_CATEGORIA_LABELS,
} from "../../lib/rivieraJugadores/constants";
import { getJugadorPerfilMeta } from "../../lib/rivieraJugadores/jugadorPerfilDisplay";
import {
  computePublicProfileStats,
  filterParticipacionesHistorialVisible,
  participacionToHistorialItem,
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
import { TablerIcon } from "../ui/TablerIcon";
import { PublicModeShell } from "../platform/PublicModeShell";
import { JugadorAvatarHero } from "./JugadorAvatarHero";
import { JugadorPaisBadge } from "./JugadorPaisBadge";
import { isValidRivieraId } from "../../lib/rivieraJugadores/rivieraIdDisplay";
import { RivieraIdBadge } from "./RivieraIdBadge";
import { JugadorPuntosBreakdown } from "./JugadorPuntosBreakdown";
import { JugadorOfficialRomcPuntos } from "./JugadorOfficialRomcPuntos";
import { JugadorPublicHistorial } from "./JugadorPublicHistorial";
import { RatingNivel } from "./RatingNivel";
import { JugadorPublicFichaAside, JugadorPublicRecentResults } from "./JugadorPublicFichaAside";
import { JugadorRedesPublicas } from "./JugadorRedesPublicas";
import { JugadoresPublicShell } from "./JugadoresPublicShell";
import { buildMarketingOfficialRankingsUrl } from "../../lib/rivieraOfficialSite";
import { buildPublicRankingUrl, navigatePublicJugadores } from "./jugadoresPublicNav";
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
  const viewingOrgId = getPublicOrganizadorIdWithoutUser(
    typeof window !== "undefined" ? window.location.pathname : undefined
  );
  const [jugador, setJugador] = useState<RivieraJugadorWithStats | null>(null);
  const [historial, setHistorial] = useState<JugadorParticipacion[]>([]);
  const [historialOtrosClubes, setHistorialOtrosClubes] = useState<JugadorParticipacion[]>([]);
  const [hasOrgContext, setHasOrgContext] = useState(Boolean(viewingOrgId?.trim()));
  const [rankingPos, setRankingPos] = useState<number | null>(null);
  const [historialRating, setHistorialRating] = useState<RatingHistorialEntry[]>([]);
  /** Hero aún no tiene fila base (ni handoff). */
  const [heroLoading, setHeroLoading] = useState(true);
  /** Carrera / rating / historial aún en vuelo. */
  const [detailLoading, setDetailLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Sube tras prefetch de nombres de club para refrescar labels (Hackpadel ≠ Riviera Open). */
  const [clubLabelsEpoch, setClubLabelsEpoch] = useState(0);
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

  const historialItems = useMemo(() => {
    try {
      return filterParticipacionesHistorialVisible(historialCompleto)
        .map((row) =>
          participacionToHistorialItem(row, {
            categoriaFallback: jugador?.categoria,
          })
        )
        .sort((a, b) => b.fecha.localeCompare(a.fecha));
    } catch (e) {
      console.warn("[JugadorPublicFicha] historialItems:", errorLogPayload(e));
      return [];
    }
  }, [historialCompleto, jugador?.categoria]);

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

  const recentActivity = useMemo(() => historialItems.slice(0, 3), [historialItems]);

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
  const viewingClubName = viewingOrgId
    ? getOrganizerDisplayNameSync(viewingOrgId)
    : null;
  const redes = getRedesPublicas(jugador);
  const rankingVal = rankingPos != null ? `#${rankingPos}` : "—";
  const rankingLabel = rankingLabelForPublicFicha(jugador, hasOrgContext);
  const showRivieraId = isValidRivieraId(jugador.riviera_id);
  const perfilMeta = getJugadorPerfilMeta(jugador);
  const hasPhoto = Boolean(jugador.foto_url?.trim());
  const catBadge = JUGADOR_CATEGORIA_AVATAR_BADGE[jugador.categoria];

  const metaIcon = (label: string) => {
    if (label === "Edad") return "user";
    if (label === "Mano dominante") return "hand-finger";
    return "arrows-left-right";
  };

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
            <section
              className={`rjp-ficha-card rjp-ficha-hero${
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
                    height={600}
                    decoding="async"
                    loading="lazy"
                  />
                  <div className="rjp-ficha-hero__media-overlay" aria-hidden />
                  <span className="rjp-ficha-hero__cat-badge">{catBadge}</span>
                  <JugadorPaisBadge
                    codigo={jugador.pais_codigo}
                    size="md"
                    className="rjp-ficha-hero__pais rjp-ficha-hero__pais--photo"
                  />
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

              <div className="rjp-ficha-hero__body">
                <div className="rjp-ficha-hero__main">
                  <div className="rjp-ficha-hero__identity">
                    <div className="rjp-ficha-hero__identity-head">
                      <h1 className="rjp-ficha-hero__name">{jugador.nombre}</h1>
                      {rankingPos != null ? (
                        <span className="rjp-ficha-hero__rank-badge">
                          {rankingLabel} #{rankingPos}
                        </span>
                      ) : detailLoading ? (
                        <span className="rjp-ficha-hero__rank-badge rjp-ficha-hero__rank-badge--pending">
                          {rankingLabel} …
                        </span>
                      ) : null}
                    </div>

                    <div className="rjp-ficha-hero__meta">
                      {registrationOrgId ? (
                        <span className="rjp-ficha-hero__meta-club">
                          Club origen: {getOrganizerDisplayNameSync(registrationOrgId)}
                        </span>
                      ) : null}
                      {hasOrgContext && viewingClubName && registrationOrgId !== viewingOrgId ? (
                        <span className="rjp-ficha-hero__meta-club">
                          Viendo desde: {viewingClubName}
                        </span>
                      ) : null}
                      <span className="rjp-ficha-hero__meta-cat">
                        {JUGADOR_CATEGORIA_LABELS[jugador.categoria]}
                      </span>
                    </div>

                    {showRivieraId ? (
                      <div className="rjp-ficha-hero__riviera">
                        <span className="rjp-ficha-hero__riviera-lbl">Riviera ID</span>
                        <RivieraIdBadge rivieraId={jugador.riviera_id!} size="md" />
                      </div>
                    ) : null}

                    {!hasPhoto ? (
                      <div className="rjp-ficha-hero__pais-row">
                        <JugadorPaisBadge
                          codigo={jugador.pais_codigo}
                          size="md"
                          className="rjp-ficha-hero__pais"
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="rjp-ficha-hero__pills">
                    {perfilMeta.map((item) => (
                      <span key={item.label} className="rjp-ficha-pill rjp-ficha-pill--compact">
                        <TablerIcon
                          name={metaIcon(item.label)}
                          size={14}
                          className="rjp-ficha-pill__icon"
                        />
                        <span className="rjp-ficha-pill__val">{item.value}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rjp-ficha-hero__stats">
                  <div className="rjp-ficha-stat">
                    <span className="rjp-ficha-stat__lbl">{rankingLabel}</span>
                    <span
                      className={`rjp-ficha-stat__val${
                        rankingPos == null ? " rjp-ficha-stat__val--empty" : ""
                      }`}
                    >
                      {rankingVal}
                    </span>
                  </div>
                  <div className="rjp-ficha-stat">
                    <span className="rjp-ficha-stat__lbl">
                      {hasOrgContext ? "Puntos en este club" : "Total carrera"}
                    </span>
                    <JugadorPuntosBreakdown
                      key={`pts-breakdown-${clubLabelsEpoch}`}
                      jugador={jugador}
                      clubOrganizadorId={viewingOrgId}
                      hasOrgContext={hasOrgContext}
                      profileCard
                      registrationOrganizerId={registrationOrgId}
                    />
                  </div>
                  {!hasOrgContext || jugador.visible_publico ? (
                    <div className="rjp-ficha-stat">
                      <span className="rjp-ficha-stat__lbl">
                        Ranking Oficial Riviera Open
                      </span>
                      <JugadorOfficialRomcPuntos jugador={jugador} />
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            <JugadorRedesPublicas redes={redes} />
          </div>

          <div className="rjp-ficha__col rjp-ficha__col--rating">
            <section className="rjp-ficha-card rjp-ficha-rating">
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

          <div className="rjp-ficha__col rjp-ficha__col--summary">
            <JugadorPublicFichaAside
              retas={profileStats.eventosJugados}
              torneosExpress={profileStats.torneosExpress}
              victorias={profileStats.victorias}
              partidosPerdidos={profileStats.partidosPerdidos}
              winRate={profileStats.winRate}
            />
            <div className="rjp-ficha__col--recent">
              <JugadorPublicRecentResults recent={recentActivity} />
            </div>
          </div>
        </div>

        <footer className="rjp-ficha-footer">
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
