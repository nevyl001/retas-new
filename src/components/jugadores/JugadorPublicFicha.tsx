import React, { useCallback, useEffect, useMemo, useState } from "react";
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const profile = await getPublicPlayerProfileData({
        playerId,
        slug,
        viewingOrgId,
        ratingRpc: viewingOrgId ? PUBLIC_ORGANIZER_RPC_FALLBACK : undefined,
      });

      if (!profile) {
        setJugador(null);
        setRankingPos(null);
        setHistorial([]);
        setHistorialOtrosClubes([]);
        setHistorialRating([]);
        return;
      }

      void prefetchOrganizerDisplayNames([
        profile.viewingOrgId,
        profile.identity.homeOrganizadorId,
        profile.jugador.grantedAccess?.ownerOrganizadorId,
        resolveRegistrationOrganizadorIdForPublicFicha(profile.jugador),
        ...(profile.jugador.careerPuntosByClub?.map((g) => g.organizadorId) ?? []),
        ...(profile.jugador.multiclubGranteePuntos?.map((g) => g.organizadorId) ?? []),
      ]);

      setJugador(profile.jugador);
      setHasOrgContext(profile.hasOrgContext);
      setHistorial(profile.historialMain);
      setHistorialOtrosClubes(profile.historialOtrosClubes);
      setHistorialRating(profile.historialRating);
      setRankingPos(profile.localRankingPos);
    } catch (e) {
      console.warn("[JugadorPublicFicha] load:", e);
      setJugador(null);
      setRankingPos(null);
      setHistorial([]);
      setHistorialOtrosClubes([]);
      setHistorialRating([]);
    } finally {
      setLoading(false);
    }
  }, [slug, viewingOrgId, playerId]);

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

  const historialItems = useMemo(
    () =>
      filterParticipacionesHistorialVisible(historialCompleto)
        .map((row) =>
          participacionToHistorialItem(row, {
            categoriaFallback: jugador?.categoria,
          })
        )
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [historialCompleto, jugador?.categoria]
  );

  const profileStats = useMemo(() => {
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
          <p className="rjp-ficha-empty">
            {viewingOrgId
              ? "Jugador no encontrado en este club."
              : "Jugador no encontrado o no está visible al público."}
          </p>
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
                    width={400}
                    height={500}
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
