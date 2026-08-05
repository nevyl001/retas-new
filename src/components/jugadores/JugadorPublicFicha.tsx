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
    <div className="rjp-ficha-skel" aria-busy="true" aria-label="Cargando perfil">
      <div className="rjp-ficha-skel__block rjp-ficha-skel__hero" />
      <div className="rjp-ficha-skel__block rjp-ficha-skel__row" />
      <div className="rjp-ficha-skel__block rjp-ficha-skel__chart" />
      <div className="rjp-ficha-skel__block rjp-ficha-skel__list" />
    </div>
  );
}

/**
 * Techo de espera: nunca dejar el skeleton sin salida (incidente de
 * rendimiento 2026-08-05, ficha pública tardando 15s+). No cancela el
 * trabajo real del servidor -- withTimeout solo acota cuánto espera este
 * componente antes de mostrar un error con reintento.
 */
const LOAD_TIMEOUT_MS = 20_000;

/**
 * Corre `fn`, pero descarta el resultado si ya no es la carga vigente (evita
 * que un doble-invoke de React StrictMode, o un cambio rápido de slug/org,
 * deje una respuesta vieja pisando una más nueva). `getPublicPlayerProfileData`
 * no soporta AbortSignal hoy -- esto no cancela la red, solo protege el
 * setState final.
 */
function useLatestGuard() {
  const tokenRef = useRef(0);
  const next = useCallback(() => {
    tokenRef.current += 1;
    const token = tokenRef.current;
    return () => token === tokenRef.current;
  }, []);
  return next;
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const nextLoadToken = useLatestGuard();

  const load = useCallback(async () => {
    const isCurrent = nextLoadToken();
    setLoading(true);
    setLoadError(null);
    try {
      const profile = await withTimeout(
        getPublicPlayerProfileData({
          playerId,
          slug,
          viewingOrgId,
          ratingRpc: viewingOrgId ? PUBLIC_ORGANIZER_RPC_FALLBACK : undefined,
        }),
        { timeoutMs: LOAD_TIMEOUT_MS, label: "El perfil del jugador" }
      );
      if (!isCurrent()) return;

      if (!profile) {
        setJugador(null);
        setRankingPos(null);
        setHistorial([]);
        setHistorialOtrosClubes([]);
        setHistorialRating([]);
        return;
      }

      // Evita flash con labels fallback («Riviera Open»): nombres antes de pintar.
      // Falla no crítica: si esto tarda o falla, el perfil igual debe mostrarse
      // (con el nombre de club que ya esté en caché) en vez de quedar vacío.
      await prefetchOrganizerDisplayNames([
        profile.viewingOrgId,
        profile.identity.homeOrganizadorId,
        profile.jugador.grantedAccess?.ownerOrganizadorId,
        resolveRegistrationOrganizadorIdForPublicFicha(profile.jugador),
        ...(profile.jugador.careerPuntosByClub?.map((g) => g.organizadorId) ?? []),
        ...(profile.jugador.multiclubGranteePuntos?.map((g) => g.organizadorId) ?? []),
        ...(profile.jugador.pointsBreakdown?.pointsByClub.map(
          (c) => c.organizador_id
        ) ?? []),
      ]).catch((e) => {
        console.warn(
          "[JugadorPublicFicha] prefetchOrganizerDisplayNames:",
          errorLogPayload(e)
        );
      });
      if (!isCurrent()) return;

      setJugador(profile.jugador);
      setHasOrgContext(profile.hasOrgContext);
      setHistorial(profile.historialMain);
      setHistorialOtrosClubes(profile.historialOtrosClubes);
      setHistorialRating(profile.historialRating);
      setRankingPos(profile.localRankingPos);
    } catch (e) {
      if (!isCurrent()) return;
      console.warn("[JugadorPublicFicha] load:", errorLogPayload(e));
      setLoadError(`No se pudo cargar el perfil. ${errorMessage(e)}`);
      setJugador(null);
      setRankingPos(null);
      setHistorial([]);
      setHistorialOtrosClubes([]);
      setHistorialRating([]);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [slug, viewingOrgId, playerId, nextLoadToken]);

  useEffect(() => {
    void load();
    // load() ya se auto-descarta si queda obsoleto (useLatestGuard, protege
    // contra el doble-invoke de React StrictMode y cambios rápidos de
    // slug/org) -- no hace falta cleanup de cancelación aquí.
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

  // Falla en la derivación de "últimos resultados"/stats (dato secundario)
  // no debe tumbar la ficha completa (nombre/ranking/puntos ya cargados) --
  // se degrada esa sección sola en vez de dejar la página entera en blanco.
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

  if (loading) {
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
              <RatingNivel
                layout="standalone"
                density="compact"
                rating={jugador.rating ?? 3}
                fiabilidad={jugador.rating_fiabilidad ?? 0.2}
                partidosJugados={jugador.rating_partidos ?? 0}
                historial={historialRating}
              />
            </section>
          </div>

          <div className="rjp-ficha__col rjp-ficha__col--historial">
            <JugadorPublicHistorial
              participaciones={historial}
              otrosClubesParticipaciones={historialOtrosClubes}
              categoriaFallback={jugador.categoria}
            />
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
