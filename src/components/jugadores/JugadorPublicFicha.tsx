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
import { loadOrganizerScopedPlayerView } from "../../lib/rivieraJugadores/playerClubDisplay";
import {
  filterParticipacionesForOrganizador,
  sumPuntosFromParticipaciones,
} from "../../lib/rivieraJugadores/participacionesOrganizadorScope";
import {
  loadUnifiedParticipacionesForJugador,
  loadUnifiedRatingViewForJugador,
} from "../../lib/rivieraJugadores/grantedPlayerUnifiedView";
import {
  mergeJugadorStatsPuntosTotales,
} from "../../lib/rivieraJugadores/rankingPosition";
import {
  prefetchOrganizerDisplayNames,
} from "../../lib/rivieraJugadores/grantedRankingDisplay";
import {
  getRivieraJugadorInternalClubById,
  getRivieraJugadorPublicById,
  getRivieraJugadorPublicBySlug,
  listParticipaciones,
  listParticipacionesPublic,
  obtenerHistorialRating,
  obtenerHistorialRatingPublic,
  resolveRankingPosicionForPublicFicha,
} from "../../lib/rivieraJugadores/rivieraJugadoresService";
import {
  rankingLabelForPublicFicha,
  resolveRegistrationOrganizadorIdForPublicFicha,
} from "../../lib/rivieraJugadores/publicFichaRanking";
import { getOrganizerDisplayNameSync } from "../../lib/organizer/organizerDisplayName";
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
import { JugadorPuntosBreakdown } from "./JugadorPuntosBreakdown";
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

function resolveEffectiveInternalClubOrganizadorId(
  internalClub: boolean,
  urlOrgId: string | null,
  jugador: RivieraJugadorWithStats | null,
  userId: string | null | undefined
): string | null {
  if (!internalClub) return urlOrgId;
  return (
    urlOrgId?.trim() ||
    jugador?.organizador_id?.trim() ||
    userId?.trim() ||
    null
  );
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
  internalClub?: boolean;
}

const FichaPublicHero: React.FC<FichaPublicHeroProps> = ({
  jugador,
  rankingPos,
  internalClub = false,
}) => {
  const { isClubBranded } = useClubExperience();
  const registrationOrgId = resolveRegistrationOrganizadorIdForPublicFicha(jugador);
  const organizerName = useOrganizerDisplayName(registrationOrgId ?? undefined);
  const rankingLabel = rankingLabelForPublicFicha(jugador, internalClub);

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
  const urlOrgId =
    playerId && !internalClub
      ? null
      : resolvePublicOrganizadorId(
          user?.id,
          typeof window !== "undefined" ? window.location.pathname : undefined
        );
  const [jugador, setJugador] = useState<RivieraJugadorWithStats | null>(null);
  const [historial, setHistorial] = useState<
    Awaited<ReturnType<typeof listParticipacionesPublic>>
  >([]);
  const [historialOtrosClubes, setHistorialOtrosClubes] = useState<
    Awaited<ReturnType<typeof listParticipacionesPublic>>
  >([]);
  const [effectiveOrgId, setEffectiveOrgId] = useState<string | null>(urlOrgId);
  const [rankingPos, setRankingPos] = useState<number | null>(null);
  const [historialRating, setHistorialRating] = useState<RatingHistorialEntry[]>([]);
  const [officialPuntos, setOfficialPuntos] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let jugadorBase =
        internalClub && playerId && urlOrgId
          ? await getRivieraJugadorInternalClubById(playerId, urlOrgId)
          : playerId
          ? await getRivieraJugadorPublicById(playerId)
          : await getRivieraJugadorPublicBySlug(slug ?? "", urlOrgId ?? undefined);

      const scopedOrgId = resolveEffectiveInternalClubOrganizadorId(
        internalClub,
        urlOrgId,
        jugadorBase,
        user?.id
      );
      setEffectiveOrgId(scopedOrgId);

      if (
        internalClub &&
        playerId &&
        scopedOrgId &&
        jugadorBase &&
        jugadorBase.organizador_id !== scopedOrgId
      ) {
        const internalRow = await getRivieraJugadorInternalClubById(
          playerId,
          scopedOrgId
        );
        if (internalRow) jugadorBase = internalRow;
      }

      setJugador(jugadorBase);
      if (jugadorBase) {
        if (internalClub && scopedOrgId) {
          jugadorBase = await enrichJugadorConcedidoClubView(scopedOrgId, jugadorBase, {
            rpc: PUBLIC_ORGANIZER_RPC_FALLBACK,
          });
        }
        void prefetchOrganizerDisplayNames([
          scopedOrgId,
          jugadorBase.grantedAccess?.ownerOrganizadorId,
          resolveRegistrationOrganizadorIdForPublicFicha(jugadorBase),
          ...(jugadorBase.multiclubGranteePuntos?.map((g) => g.organizadorId) ?? []),
        ]);

        if (internalClub && scopedOrgId) {
          const scoped = await loadOrganizerScopedPlayerView(scopedOrgId, jugadorBase, {
            listParticipaciones: (id, lim, org) =>
              listParticipacionesPublic(id, lim, org),
            fetchParticipacionesRaw: (id, lim) => listParticipaciones(id, lim),
            fetchHistorialRating: user?.id
              ? obtenerHistorialRating
              : obtenerHistorialRatingPublic,
            ratingRpc: PUBLIC_ORGANIZER_RPC_FALLBACK,
          });
          jugadorBase = scoped.jugador;
          setHistorial(scoped.historial);
          setHistorialOtrosClubes(scoped.historialOtrosClubes ?? []);
          setHistorialRating(scoped.historialRating);

          const pos = await resolveRankingPosicionForPublicFicha(jugadorBase, {
            orgId: scopedOrgId,
            internalClub,
          });
          setOfficialPuntos(jugadorBase.officialPuntosGlobal ?? null);
          setRankingPos(pos);
          setJugador(jugadorBase);
        } else {
        const unified = await loadUnifiedParticipacionesForJugador(jugadorBase, {
          limit: 100,
          organizadorId:
            internalClub && scopedOrgId
              ? scopedOrgId
              : internalClub || scopedOrgId
              ? scopedOrgId ?? null
              : null,
          scopedToOrganizadorHistorial: internalClub && Boolean(scopedOrgId),
          listParticipaciones: (id, lim, org) =>
            listParticipacionesPublic(id, lim, org ?? undefined),
        });
        const scopedHistorial =
          internalClub && scopedOrgId
            ? filterParticipacionesForOrganizador(
                unified.historial,
                scopedOrgId
              )
            : unified.historial;

        if (internalClub && scopedOrgId) {
          jugadorBase = await enrichJugadorConcedidoClubView(scopedOrgId, jugadorBase, {
            rpc: PUBLIC_ORGANIZER_RPC_FALLBACK,
          });
        }
        const ratingView = await loadUnifiedRatingViewForJugador(jugadorBase, {
          limite: 10,
          organizadorId: internalClub || scopedOrgId ? scopedOrgId ?? null : null,
          participacionesHistorial: scopedHistorial,
          fetchHistorial: user?.id
            ? obtenerHistorialRating
            : obtenerHistorialRatingPublic,
          rpc: internalClub || scopedOrgId ? PUBLIC_ORGANIZER_RPC_FALLBACK : undefined,
        });
        jugadorBase = {
          ...jugadorBase,
          rating: ratingView.jugador.rating,
          rating_partidos: ratingView.jugador.rating_partidos,
          rating_fiabilidad: ratingView.jugador.rating_fiabilidad,
        };
        setHistorial(scopedHistorial);
        setHistorialRating(ratingView.historial);

        const pos = await resolveRankingPosicionForPublicFicha(jugadorBase, {
          orgId: internalClub || scopedOrgId ? scopedOrgId : null,
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
        const scopedPuntos =
          internalClub && scopedHistorial.length > 0
            ? sumPuntosFromParticipaciones(scopedHistorial)
            : statsBase.puntos_totales;
        const statsForView =
          internalClub && scopedHistorial.length > 0
            ? { ...statsBase, puntos_totales: scopedPuntos }
            : statsBase;
        const withStats =
          internalClub && jugadorBase.concedidoPorAdmin
            ? {
                ...jugadorBase,
                stats: statsForView,
                statsOrigenConcedido: jugadorBase.statsOrigenConcedido,
                grantedAccess: jugadorBase.grantedAccess,
                concedidoPorAdmin: true,
              }
            : internalClub
            ? {
                ...jugadorBase,
                stats: statsForView,
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
        }
      } else {
        setRankingPos(null);
      }
    } finally {
      setLoading(false);
    }
  }, [slug, urlOrgId, playerId, internalClub, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const rankingUrl = internalClub
    ? buildPublicRankingUrl(
        effectiveOrgId ?? urlOrgId,
        normalizeRivieraGenero(jugador?.genero) ?? "M"
      )
    : playerId
    ? buildMarketingOfficialRankingsUrl(
        jugador?.organizador_id,
        normalizeRivieraGenero(jugador?.genero) ?? "M"
      )
    : buildPublicRankingUrl(
        effectiveOrgId ?? urlOrgId,
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
    const statsHistorial = internalClub ? historial : historialCompleto;
    const fromHist = computePublicProfileStats(statsHistorial);
    const statsOnlyFromHistorial = internalClub && historial.length > 0;
    const teStats = statsOnlyFromHistorial
      ? fromHist.torneosExpress
      : jugador?.stats?.total_torneos_express ?? 0;
    const partidosStats = statsOnlyFromHistorial
      ? fromHist.eventosJugados
      : jugador?.stats?.total_partidos ?? 0;
    const tieneHistorial = statsHistorial.length > 0;
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
      torneosExpress: statsOnlyFromHistorial
        ? fromHist.torneosExpress
        : Math.max(fromHist.torneosExpress, teStats),
      eventosJugados: statsOnlyFromHistorial
        ? fromHist.eventosJugados
        : Math.max(
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
  }, [historial, historialCompleto, historialOtrosClubes.length, internalClub, jugador?.stats]);

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
          {effectiveOrgId ?? urlOrgId
            ? "Jugador no encontrado en este club."
            : "Jugador no encontrado o no está visible al público."}
        </p>
      </JugadoresPublicShell>
    );
  }

  const registrationOrgId = jugador
    ? resolveRegistrationOrganizadorIdForPublicFicha(jugador)
    : null;
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
    <ClubExperienceScope organizadorId={jugador.organizador_id ?? effectiveOrgId ?? urlOrgId}>
    <JugadoresPublicShell variant="ficha">
      <PublicModeShell className="rjp-ficha-shell">
      <div className="rjp-ficha">
        <FichaTopbar rankingUrl={rankingUrl} />

        {isPubDsV2Enabled ? (
          <FichaPublicHero
            jugador={jugador}
            rankingPos={rankingPos}
            internalClub={internalClub}
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
                          {rankingLabelForPublicFicha(jugador, internalClub)}
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
                          {internalClub
                            ? "Puntos ranking interno"
                            : "Puntos totales"}
                        </span>
                        <JugadorPuntosBreakdown
                          jugador={jugador}
                          clubOrganizadorId={effectiveOrgId ?? urlOrgId}
                          internalClub={internalClub}
                        />
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
              otrosClubesParticipaciones={historialOtrosClubes}
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
