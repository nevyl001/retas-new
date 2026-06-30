import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClubExperienceScope,
  PublicClubModeEyebrow,
  getOrganizerCelebrateTagline,
  useOrganizerDisplayName,
} from "../../club-experience";
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
  fetchOfficialRankingPosicionForJugador,
  loadRomcOfficialPlayerView,
} from "../../lib/rivieraJugadores/rivieraOfficialActivity";
import { mergeJugadorStatsPuntosTotales, resolveJugadorPuntosRanking, isJugadorConcedidoEnClub, jugadorPuntosOrigenConcedido, rankingPuntosClubLocal } from "../../lib/rivieraJugadores/rankingPosition";
import {
  prefetchOrganizerDisplayNames,
} from "../../lib/rivieraJugadores/grantedRankingDisplay";
import {
  getRankingPosicionEnCategoria,
  getRankingPosicionOficialEnCategoria,
  getRivieraJugadorInternalClubById,
  getRivieraJugadorPublicById,
  getRivieraJugadorPublicBySlug,
  listParticipacionesPublic,
  obtenerHistorialRatingPublic,
} from "../../lib/rivieraJugadores/rivieraJugadoresService";
import { getRedesPublicas } from "../../lib/rivieraJugadores/jugadorRedes";
import { normalizeRivieraGenero } from "../../lib/rivieraJugadores/genero";
import { resolvePublicOrganizadorId } from "../../lib/rivieraJugadores/publicOrganizador";
import type {
  RatingHistorialEntry,
  RivieraJugadorWithStats,
} from "../../lib/rivieraJugadores/types";
import { TablerIcon } from "../ui/TablerIcon";
import { JugadorAvatarHero } from "./JugadorAvatarHero";
import { JugadorPaisBadge } from "./JugadorPaisBadge";
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
      const j =
        internalClub && playerId && orgId
          ? await getRivieraJugadorInternalClubById(playerId, orgId)
          : playerId
          ? await getRivieraJugadorPublicById(playerId)
          : await getRivieraJugadorPublicBySlug(slug ?? "", orgId ?? undefined);
      setJugador(j);
      if (j) {
        void prefetchOrganizerDisplayNames([
          orgId,
          j.grantedAccess?.ownerOrganizadorId,
        ]);
        const h = await listParticipacionesPublic(
          j.id,
          100,
          internalClub || orgId ? orgId ?? undefined : undefined
        );

        const [posRpc, posList, romcView] = await Promise.all([
          playerId && !internalClub
            ? fetchOfficialRankingPosicionForJugador(
                j.id,
                j.organizador_id,
                j.categoria,
                normalizeRivieraGenero(j.genero) ?? "M"
              )
            : Promise.resolve(null),
          internalClub && orgId
            ? getRankingPosicionEnCategoria(
                orgId,
                j.id,
                j.categoria,
                normalizeRivieraGenero(j.genero) ?? "M"
              )
            : playerId
            ? getRankingPosicionOficialEnCategoria(
                j.id,
                j.organizador_id,
                j.categoria,
                normalizeRivieraGenero(j.genero) ?? "M"
              )
            : orgId
            ? getRankingPosicionEnCategoria(
                orgId,
                j.id,
                j.categoria,
                normalizeRivieraGenero(j.genero) ?? "M"
              )
            : Promise.resolve(null),
          internalClub
            ? Promise.resolve({
                hasRomcData: false,
                historial: h,
                puntosOficiales: null,
              })
            : loadRomcOfficialPlayerView(j.id, { localParticipaciones: h }),
        ]);

        const pos = posRpc ?? posList;

        const isGrantedInternal = Boolean(
          internalClub &&
            j.concedidoPorAdmin &&
            j.grantedAccess?.sourceJugadorId
        );
        const historialMerged =
          internalClub || isGrantedInternal
            ? h
            : romcView.hasRomcData
            ? romcView.historial
            : h;
        setHistorial(historialMerged);
        const puntosOficialEfectivos = romcView.hasRomcData
          ? romcView.puntosOficiales
          : null;
        setOfficialPuntos(puntosOficialEfectivos);
        setRankingPos(pos);
        const statsBase = j.stats ?? {
          jugador_id: j.id,
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
        if (isGrantedInternal) {
          setJugador({ ...j, stats: statsBase });
        } else {
          setJugador({
            ...j,
            stats: mergeJugadorStatsPuntosTotales(
              statsBase,
              puntosOficialEfectivos
            ),
            officialPuntosGlobal: puntosOficialEfectivos ?? undefined,
          });
        }
      } else {
        setRankingPos(null);
      }
    } finally {
      setLoading(false);
    }
  }, [slug, orgId, playerId, internalClub]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!jugador?.id) {
      setHistorialRating([]);
      return;
    }
    const ratingJugadorId =
      jugador.concedidoPorAdmin && jugador.grantedAccess?.sourceJugadorId
        ? jugador.grantedAccess.sourceJugadorId
        : jugador.id;
    let active = true;
    obtenerHistorialRatingPublic(ratingJugadorId, 10)
      .then((rows) => {
        if (active) setHistorialRating(rows);
      })
      .catch(() => {
        if (active) setHistorialRating([]);
      });
    return () => {
      active = false;
    };
  }, [
    jugador?.id,
    jugador?.concedidoPorAdmin,
    jugador?.grantedAccess?.sourceJugadorId,
  ]);

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

  const puntos = internalClub
    ? rankingPuntosClubLocal(jugador)
    : resolveJugadorPuntosRanking({
        ...jugador,
        officialPuntosGlobal: officialPuntos ?? jugador.officialPuntosGlobal,
      });
  const puntosOrigen = jugadorPuntosOrigenConcedido(jugador);
  const showDualPuntosFicha =
    internalClub && isJugadorConcedidoEnClub(jugador) && puntosOrigen > 0;
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
      <div className="rjp-ficha">
        <FichaTopbar rankingUrl={rankingUrl} />

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
                  fetchPriority="high"
                />
              )}
              <div className="rjp-ficha-hero__dim" aria-hidden />
              <div className="rjp-ficha-hero__veil" aria-hidden />
              <div className="rjp-ficha-hero__gold-line" aria-hidden />

              <div className="rjp-ficha-hero__content">
                <div className="rjp-ficha-hero__top">
                  <PublicClubModeEyebrow
                    modeLabel="Jugador"
                    className="rjp-ficha-hero__brand"
                    clubIdentityClassName="rjp-ficha-hero__club-identity"
                  />
                  {hasPhoto ? (
                    <span className="rjp-ficha-hero__cat-badge">{catBadge}</span>
                  ) : null}
                </div>

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
                      <h1 className="rjp-ficha-hero__name">{jugador.nombre}</h1>
                      <JugadorPaisBadge
                        codigo={jugador.pais_codigo}
                        size="md"
                        className="rjp-ficha-hero__pais"
                      />
                    </div>

                    <div className="rjp-ficha-hero__pills">
                      <span className="rjp-ficha-pill rjp-ficha-pill--open">
                        <TablerIcon name="trophy" size={14} />
                        {JUGADOR_CATEGORIA_LABELS[jugador.categoria]}
                      </span>
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
                        <span className="rjp-ficha-stat__lbl">Ranking</span>
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
    </JugadoresPublicShell>
    </ClubExperienceScope>
  );
};
