import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClubExperienceScope,
  ClubIdentity,
  PublicClubModeEyebrow,
  getOrganizerCelebrateTagline,
  useClubExperience,
  useOrganizerDisplayName,
} from "../../club-experience";
import { isPubDsV2Enabled } from "../../config/peds";
import { useUser } from "../../contexts/UserContext";
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
import {
  enrichJugadorConcedidoClubView,
} from "../../lib/rivieraJugadores/concedidoClubView";
import {
  loadUnifiedParticipacionesForJugador,
  loadUnifiedRatingViewForJugador,
} from "../../lib/rivieraJugadores/grantedPlayerUnifiedView";
import {
  isJugadorConcedidoEnClub,
  mergeJugadorStatsPuntosTotales,
  rankingPuntosClubLocal,
  resolveJugadorPuntosRanking,
} from "../../lib/rivieraJugadores/rankingPosition";
import {
  prefetchOrganizerDisplayNames,
  rankingPuntosCarreraRivieraDisplay,
} from "../../lib/rivieraJugadores/grantedRankingDisplay";
import {
  getRivieraJugadorInternalClubById,
  getRivieraJugadorPublicById,
  getRivieraJugadorPublicBySlug,
  listParticipacionesPublic,
  obtenerHistorialRating,
  obtenerHistorialRatingPublic,
  resolveRankingPosicionForPublicFicha,
} from "../../lib/rivieraJugadores/rivieraJugadoresService";
import {
  rankingLabelForPublicFicha,
  shouldUseClubLocalPuntosOnPublicFicha,
} from "../../lib/rivieraJugadores/publicFichaRanking";
import { getRedesPublicas } from "../../lib/rivieraJugadores/jugadorRedes";
import { normalizeRivieraGenero } from "../../lib/rivieraJugadores/genero";
import {
  PUBLIC_ORGANIZER_RPC_FALLBACK,
  resolvePublicOrganizadorId,
} from "../../lib/rivieraJugadores/publicOrganizador";
import type {
  RatingHistorialEntry,
  RivieraJugadorWithStats,
} from "../../lib/rivieraJugadores/types";
import { TablerIcon } from "../ui/TablerIcon";
import { PublicModeShell } from "../platform/PublicModeShell";
import { StatusBadge } from "../platform/StatusBadge";
import { PublicHero } from "../public/peds";
import { JugadorAvatarHero } from "./JugadorAvatarHero";
import { JugadorPaisBadge } from "./JugadorPaisBadge";
import { RivieraIdShareBlock } from "./RivieraIdShareBlock";
import { JugadorPublicHistorial } from "./JugadorPublicHistorial";
import { RatingNivel } from "./RatingNivel";
import { JugadorPublicFichaAside } from "./JugadorPublicFichaAside";
import { JugadorRedesPublicas } from "./JugadorRedesPublicas";
import { JugadoresPublicShell } from "./JugadoresPublicShell";
import { buildMarketingOfficialRankingsUrl } from "../../lib/rivieraOfficialSite";
import { buildPublicRankingUrl, navigatePublicJugadores } from "./jugadoresPublicNav";
import "./riviera-jugadores-public-ficha.css";

interface JugadorPublicFichaProps {
  slug?: string;
  playerId?: string;
  /** Perfil desde ranking interno del club (/public/jugadores/{uuid}?org=). */
  internalClub?: boolean;
}

function FichaTopbar({ rankingUrl }: { rankingUrl: string }) {
  return (
    <nav className="rjp-ficha-topbar">
      <button
        type="button"
        className="rjp-ficha-topbar__back"
        onClick={() => navigatePublicJugadores(rankingUrl)}
      >
        <TablerIcon name="arrow-left" size={16} />
        Ranking
      </button>
    </nav>
  );
}

interface FichaPublicHeroProps {
  jugador: RivieraJugadorWithStats;
  rankingPos: number | null;
  organizadorId?: string | null;
}

const FichaPublicHero: React.FC<FichaPublicHeroProps> = ({
  jugador,
  rankingPos,
  organizadorId,
}) => {
  const { isClubBranded } = useClubExperience();
  const organizerName = useOrganizerDisplayName(organizadorId ?? jugador.organizador_id);
  const rankingLabel = rankingLabelForPublicFicha(jugador);

  return (
    <>
    <PublicHero
      logoClub={
        isClubBranded ? (
          <ClubIdentity
            variant="compact"
            showTagline={false}
            logoSurface="dark"
            wordmarkOnly
            className="peds-hero__club-identity"
          />
        ) : undefined
      }
      estado={
        <StatusBadge variant={rankingPos != null ? "gold" : "muted"}>
          {rankingPos != null ? `${rankingLabel} #${rankingPos}` : "Sin posición en ranking"}
        </StatusBadge>
      }
      nombreEvento={jugador.nombre}
      club={organizerName}
      categoria={JUGADOR_CATEGORIA_LABELS[jugador.categoria]}
      meta="Jugador"
    />
    <RivieraIdShareBlock
      jugador={jugador}
      variant="public"
      className="rjp-ficha-hero__riviera-id"
    />
  </>
  );
};

export const JugadorPublicFicha: React.FC<JugadorPublicFichaProps> = ({
  slug,
  playerId,
  internalClub = false,
}) => {
  const { user } = useUser();
  const orgId =
    playerId && !internalClub
      ? null
      : resolvePublicOrganizadorId(
          user?.id,
          typeof window !== "undefined" ? window.location.pathname : undefined
        );
  const organizerName = useOrganizerDisplayName(orgId ?? undefined);
  const [jugador, setJugador] = useState<RivieraJugadorWithStats | null>(null);
  const [historial, setHistorial] = useState<
    Awaited<ReturnType<typeof listParticipacionesPublic>>
  >([]);
  const [rankingPos, setRankingPos] = useState<number | null>(null);
  const [historialRating, setHistorialRating] = useState<RatingHistorialEntry[]>([]);
  const [officialPuntos, setOfficialPuntos] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const origenOrgId = jugador?.grantedAccess?.ownerOrganizadorId?.trim() || null;
  const origenClubName = useOrganizerDisplayName(origenOrgId);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let jugadorBase =
        internalClub && playerId && orgId
          ? await getRivieraJugadorInternalClubById(playerId, orgId)
          : playerId
          ? await getRivieraJugadorPublicById(playerId)
          : await getRivieraJugadorPublicBySlug(slug ?? "", orgId ?? undefined);
      setJugador(jugadorBase);
      if (jugadorBase) {
        if (internalClub && orgId) {
          jugadorBase = await enrichJugadorConcedidoClubView(orgId, jugadorBase, {
            rpc: PUBLIC_ORGANIZER_RPC_FALLBACK,
          });
        }
        void prefetchOrganizerDisplayNames([
          orgId,
          jugadorBase.grantedAccess?.ownerOrganizadorId,
        ]);
        const unified = await loadUnifiedParticipacionesForJugador(jugadorBase, {
          limit: 100,
          organizadorId: internalClub || orgId ? orgId ?? null : null,
          listParticipaciones: (id, lim, org) =>
            listParticipacionesPublic(id, lim, org ?? undefined),
        });
        if (internalClub && orgId) {
          jugadorBase = await enrichJugadorConcedidoClubView(orgId, jugadorBase, {
            participaciones: unified.historial,
            rpc: PUBLIC_ORGANIZER_RPC_FALLBACK,
          });
        }
        const ratingView = await loadUnifiedRatingViewForJugador(jugadorBase, {
          limite: 10,
          organizadorId: internalClub || orgId ? orgId ?? null : null,
          participacionesHistorial: unified.historial,
          fetchHistorial: user?.id
            ? obtenerHistorialRating
            : obtenerHistorialRatingPublic,
          rpc: internalClub || orgId ? PUBLIC_ORGANIZER_RPC_FALLBACK : undefined,
        });
        jugadorBase = {
          ...jugadorBase,
          rating: ratingView.jugador.rating,
          rating_partidos: ratingView.jugador.rating_partidos,
          rating_fiabilidad: ratingView.jugador.rating_fiabilidad,
        };
        setHistorial(unified.historial);
        setHistorialRating(ratingView.historial);

        const pos = await resolveRankingPosicionForPublicFicha(jugadorBase, {
          orgId: internalClub || orgId ? orgId : null,
          internalClub,
        });

        const puntosOficialEfectivos = unified.romcView.hasRomcData
          ? unified.romcView.puntosOficiales
          : null;
        setOfficialPuntos(puntosOficialEfectivos);
        setRankingPos(pos);
        const statsBase = jugadorBase.stats ?? {
          jugador_id: jugadorBase.id,
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
          puntos_totales: 0,
          updated_at: new Date().toISOString(),
        };
        const withStats =
          internalClub && jugadorBase.concedidoPorAdmin
            ? {
                ...jugadorBase,
                stats: statsBase,
                statsOrigenConcedido: jugadorBase.statsOrigenConcedido,
                grantedAccess: jugadorBase.grantedAccess,
                concedidoPorAdmin: true,
              }
            : internalClub
            ? {
                ...jugadorBase,
                stats: statsBase,
              }
            : {
                ...jugadorBase,
                stats: mergeJugadorStatsPuntosTotales(
                  statsBase,
                  puntosOficialEfectivos
                ),
                officialPuntosGlobal: puntosOficialEfectivos ?? undefined,
              };
        setJugador(withStats);
      } else {
        setRankingPos(null);
      }
    } finally {
      setLoading(false);
    }
  }, [slug, orgId, playerId, internalClub, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const rankingUrl = internalClub
    ? buildPublicRankingUrl(
        orgId,
        normalizeRivieraGenero(jugador?.genero) ?? "M"
      )
    : playerId
    ? buildMarketingOfficialRankingsUrl(
        jugador?.organizador_id,
        normalizeRivieraGenero(jugador?.genero) ?? "M"
      )
    : buildPublicRankingUrl(
        orgId,
        normalizeRivieraGenero(jugador?.genero) ?? "M"
      );

  const historialItems = useMemo(
    () =>
      filterParticipacionesHistorialVisible(historial)
        .map((row) =>
          participacionToHistorialItem(row, {
            categoriaFallback: jugador?.categoria,
          })
        )
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [historial, jugador?.categoria]
  );

  const profileStats = useMemo(() => {
    const fromHist = computePublicProfileStats(historial);
    const teStats = jugador?.stats?.total_torneos_express ?? 0;
    const partidosStats = jugador?.stats?.total_partidos ?? 0;
    const tieneHistorial = historial.length > 0;
    const victorias = tieneHistorial
      ? fromHist.partidosGanados
      : jugador?.stats?.victorias ?? 0;
    const perdidas = tieneHistorial
      ? fromHist.partidosPerdidos
      : jugador?.stats?.derrotas ?? 0;
    const winRateFromHist = fromHist.winRate;
    const winRateFromStats =
      jugador?.stats && jugador.stats.total_partidos > 0
        ? Math.round(Number(jugador.stats.pct_victorias))
        : null;
    const winRate =
      victorias + perdidas > 0
        ? Math.round((victorias / (victorias + perdidas)) * 100)
        : winRateFromHist ?? winRateFromStats;

    return {
      ...fromHist,
      torneosExpress: Math.max(fromHist.torneosExpress, teStats),
      eventosJugados: Math.max(
        fromHist.eventosJugados,
        partidosStats,
        jugador?.stats?.total_retas ?? 0,
        fromHist.retasClasicas +
          fromHist.americanos +
          fromHist.ligas +
          fromHist.torneosExpress
      ),
      victorias,
      partidosPerdidos: perdidas,
      winRate,
    };
  }, [historial, jugador?.stats]);

  const recentActivity = useMemo(() => historialItems.slice(0, 3), [historialItems]);

  if (loading) {
    return (
      <JugadoresPublicShell variant="ficha">
        <p className="rjp-ficha-empty">Cargando perfil…</p>
      </JugadoresPublicShell>
    );
  }

  if (!jugador) {
    return (
      <JugadoresPublicShell variant="ficha">
        <FichaTopbar rankingUrl={rankingUrl} />
        <p className="rjp-ficha-empty">
          {orgId
            ? "Jugador no encontrado en este club."
            : "Jugador no encontrado o no está visible al público."}
        </p>
      </JugadoresPublicShell>
    );
  }

  const puntos = shouldUseClubLocalPuntosOnPublicFicha(jugador, internalClub)
    ? rankingPuntosClubLocal(jugador)
    : resolveJugadorPuntosRanking({
        ...jugador,
        officialPuntosGlobal: officialPuntos ?? jugador.officialPuntosGlobal,
      });
  const puntosOrigen = rankingPuntosCarreraRivieraDisplay({
    ...jugador,
    officialPuntosGlobal: officialPuntos ?? jugador.officialPuntosGlobal,
  });
  const showDualPuntosFicha =
    internalClub &&
    isJugadorConcedidoEnClub(jugador) &&
    Boolean(origenOrgId);
  const redes = getRedesPublicas(jugador);
  const rankingVal = rankingPos != null ? `#${rankingPos}` : "—";
  const perfilMeta = getJugadorPerfilMeta(jugador);
  const hasPhoto = Boolean(jugador.foto_url?.trim());
  const catBadge = JUGADOR_CATEGORIA_AVATAR_BADGE[jugador.categoria];

  const metaIcon = (label: string) => {
    if (label === "Edad") return "user";
    if (label === "Mano dominante") return "hand-finger";
    return "arrows-left-right";
  };

  return (
    <ClubExperienceScope organizadorId={jugador.organizador_id ?? orgId}>
    <JugadoresPublicShell variant="ficha">
      <PublicModeShell className="rjp-ficha-shell">
      <div className="rjp-ficha">
        <FichaTopbar rankingUrl={rankingUrl} />

        {isPubDsV2Enabled ? (
          <FichaPublicHero
            jugador={jugador}
            rankingPos={rankingPos}
            organizadorId={orgId}
          />
        ) : null}

        <div className="rjp-ficha__layout">
          <div className="rjp-ficha__col rjp-ficha__col--profile">
            <section
              className={`rjp-ficha-card rjp-ficha-hero${
                hasPhoto ? " rjp-ficha-hero--photo" : ""
              }`}
            >
              {hasPhoto && jugador.foto_url && (
                <img
                  className="rjp-ficha-hero__photo"
                  src={jugador.foto_url}
                  alt=""
                  decoding="async"
                />
              )}
              <div className="rjp-ficha-hero__dim" aria-hidden />
              <div className="rjp-ficha-hero__veil" aria-hidden />
              <div className="rjp-ficha-hero__gold-line" aria-hidden />

              <div className="rjp-ficha-hero__content">
                {!isPubDsV2Enabled || hasPhoto ? (
                  <div className="rjp-ficha-hero__top">
                    {!isPubDsV2Enabled ? (
                      <PublicClubModeEyebrow
                        modeLabel="Jugador"
                        className="rjp-ficha-hero__brand"
                        clubIdentityClassName="rjp-ficha-hero__club-identity"
                      />
                    ) : null}
                    {hasPhoto ? (
                      <span className="rjp-ficha-hero__cat-badge">{catBadge}</span>
                    ) : null}
                  </div>
                ) : null}

                {!hasPhoto && (
                  <JugadorAvatarHero
                    fotoUrl={null}
                    nombre={jugador.nombre}
                    categoria={jugador.categoria}
                  />
                )}

                <div
                  className={
                    hasPhoto
                      ? "rjp-ficha-hero__panel rjp-ficha-hero__panel--photo"
                      : "rjp-ficha-hero__panel"
                  }
                >
                  <div className="rjp-ficha-hero__main">
                    <div className="rjp-ficha-hero__name-row">
                      {!isPubDsV2Enabled ? (
                        <h1 className="rjp-ficha-hero__name">{jugador.nombre}</h1>
                      ) : null}
                      <JugadorPaisBadge
                        codigo={jugador.pais_codigo}
                        size="md"
                        className="rjp-ficha-hero__pais"
                      />
                    </div>
                    <RivieraIdShareBlock jugador={jugador} variant="public" />

                    <div className="rjp-ficha-hero__pills">
                      {!isPubDsV2Enabled ? (
                        <span className="rjp-ficha-pill rjp-ficha-pill--open">
                          <TablerIcon name="trophy" size={14} />
                          {JUGADOR_CATEGORIA_LABELS[jugador.categoria]}
                        </span>
                      ) : null}
                      {perfilMeta.map((item) => (
                        <span
                          key={item.label}
                          className="rjp-ficha-pill rjp-ficha-pill--muted rjp-ficha-pill--labeled"
                        >
                          <TablerIcon name={metaIcon(item.label)} size={14} />
                          <span className="rjp-ficha-pill__text">
                            <span className="rjp-ficha-pill__lbl">
                              {item.label}
                            </span>
                            <span className="rjp-ficha-pill__val">
                              {item.value}
                            </span>
                          </span>
                        </span>
                      ))}
                    </div>

                    <div className="rjp-ficha-hero__stats">
                      <div className="rjp-ficha-stat">
                        <TablerIcon
                          name="hash"
                          size={14}
                          className="rjp-ficha-stat__icon"
                        />
                        <span className="rjp-ficha-stat__lbl">
                          {rankingLabelForPublicFicha(jugador)}
                        </span>
                        <span
                          className={`rjp-ficha-stat__val${
                            rankingPos == null ? " rjp-ficha-stat__val--empty" : ""
                          }`}
                        >
                          {rankingVal}
                        </span>
                      </div>
                      <div className="rjp-ficha-stat">
                        <TablerIcon
                          name="star"
                          size={14}
                          className="rjp-ficha-stat__icon"
                        />
                        <span className="rjp-ficha-stat__lbl">
                          {showDualPuntosFicha ? "Puntos en club" : "Puntos totales"}
                        </span>
                        {showDualPuntosFicha ? (
                          <span className="rjp-ficha-stat__val rjp-ficha-dual-pts">
                            <span className="rjp-ficha-dual-pts__main">
                              {puntos.toLocaleString("es-MX")}
                            </span>
                            <span className="rjp-ficha-dual-pts__origen">
                              {origenClubName}:{" "}
                              {puntosOrigen.toLocaleString("es-MX")} pts
                            </span>
                          </span>
                        ) : (
                          <span className="rjp-ficha-stat__val">
                            {puntos.toLocaleString("es-MX")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rjp-ficha-card rjp-ficha-rating">
              <RatingNivel
                layout="standalone"
                rating={jugador.rating ?? 3}
                fiabilidad={jugador.rating_fiabilidad ?? 0.2}
                partidosJugados={jugador.rating_partidos ?? 0}
                historial={historialRating}
              />
            </section>

            <JugadorRedesPublicas redes={redes} />
          </div>

          <div className="rjp-ficha__col rjp-ficha__col--historial">
            <JugadorPublicHistorial
              participaciones={historial}
              categoriaFallback={jugador.categoria}
            />
          </div>

          <JugadorPublicFichaAside
            retas={profileStats.eventosJugados}
            torneosExpress={profileStats.torneosExpress}
            victorias={profileStats.victorias}
            partidosPerdidos={profileStats.partidosPerdidos}
            winRate={profileStats.winRate}
            recent={recentActivity}
          />
        </div>

        <footer className="rjp-ficha-footer">
          {getOrganizerCelebrateTagline(organizerName)}
        </footer>
      </div>
      </PublicModeShell>
    </JugadoresPublicShell>
    </ClubExperienceScope>
  );
};
