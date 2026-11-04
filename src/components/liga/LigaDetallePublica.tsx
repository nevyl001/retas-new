import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  LigaDetalle,
  LigaEquipoRankingItem,
  LigaJornada,
  RankingItem,
} from "../../lib/liga/types";
import {
  isEquiposModalidad,
  isParejasFijasPlayoffs,
} from "../../lib/liga/ligaModalidad";
import { supabase } from "../../lib/supabaseClient";
import { aplicarRatingsPendientesLigaPlayoffs } from "../../lib/rivieraJugadores/aplicarRatingPartido";
import { compareEquiposRanking } from "../../lib/liga/equiposRanking";
import { ligaModalidadPublicLabel } from "../../lib/liga/types";
import {
  groupJornadaPublicMatchesByRonda,
  listJornadaPublicMatches,
} from "../../lib/liga/publicDisplay";
import { formatFechaLegible, dateInputValue } from "../../lib/liga/programacion";
import {
  jornadaPublicTemporalEstado,
  pickDefaultPublicJornadaId,
} from "../../lib/liga/jornadaTemporal";
import { LIGA_PUBLIC_POLL_INTERVAL_MS } from "../../lib/liga/publicPoll";
import { resolveLigaJugadorPublicProfiles } from "../../lib/liga/publicParejaAvatars";
import { resolveLigaPublicPlayerRating } from "../../lib/liga/ligaPublicPlayerRating";
import {
  aggregateJugadorSeasonSupportStats,
  formatSupportDif,
  hasMeaningfulSupportStats,
  type JugadorSeasonSupportStats,
} from "../../lib/liga/jugadorSeasonSupportStats";
import {
  getLigaById,
  getRanking,
  getRankingEquipos,
  publicLigaJornadaUrl,
} from "../../services/ligaService";
import { ClubExperienceScope, PublicEventBrandIdentity, PublicEventNeutralLoading, PublicScopedBrandGate, useClubExperience, useOrganizerDisplayName } from "../../club-experience";
import { isPubDsV2Enabled } from "../../config/peds";
import { useLigaRealtime } from "../../hooks/useLigaRealtime";
import { useVisiblePolling } from "../../hooks/useVisiblePolling";
import { PublicModeShell } from "../platform/PublicModeShell";
import { StatusBadge } from "../platform/StatusBadge";
import { PublicHero } from "../public/peds";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import { LigaPubProgramaMatchCard } from "./LigaPubProgramaMatchCard";
import { LigaPublicParejasStandings } from "./LigaPublicParejasStandings";
import "./liga-public-pantalla.css";
import "./liga-public-programa.css";
import "./liga-public-individual-2026.css";
import "../jugadores/riviera-jugadores.css";

function estadoLigaBadgeVariant(
  estado: LigaDetalle["estado"]
): "live" | "muted" | "pending" {
  if (estado === "in_progress") return "live";
  if (estado === "completed") return "muted";
  return "pending";
}

/** Separa "A / B" para tipografía editorial en cards individuales. */
function splitParejaLabel(label: string): { a: string; b: string | null } {
  const parts = label.split(/\s*\/\s*/);
  if (parts.length < 2) return { a: label, b: null };
  return { a: parts[0]!, b: parts.slice(1).join(" / ") };
}

function estadoLigaLabel(estado: LigaDetalle["estado"]): string {
  switch (estado) {
    case "upcoming":
      return "Próxima";
    case "in_progress":
      return "En curso";
    case "completed":
      return "Finalizada";
    default:
      return estado;
  }
}

function jornadaBadgeClass(estado: LigaJornada["estado"]): string {
  if (estado === "in_progress") {
    return "liga-pantalla-ronda__badge liga-pantalla-ronda__badge--live";
  }
  if (estado === "completed") {
    return "liga-pantalla-ronda__badge liga-pantalla-ronda__badge--done";
  }
  return "liga-pantalla-ronda__badge";
}

function jornadaBadgeLabel(estado: LigaJornada["estado"]): string {
  if (estado === "in_progress") return "En curso";
  if (estado === "completed") return "Completada";
  return "Próxima";
}

function jornadaPublicEstadoNow(
  jornada: LigaJornada,
  now?: Date
): LigaJornada["estado"] {
  return jornadaPublicTemporalEstado(jornada, { now });
}

interface LigaDetallePublicaProps {
  ligaId: string;
}

export const LigaDetallePublica: React.FC<LigaDetallePublicaProps> = ({
  ligaId,
}) => {
  const [detalle, setDetalle] = useState<LigaDetalle | null>(null);
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [rankingEquipos, setRankingEquipos] = useState<LigaEquipoRankingItem[]>(
    []
  );
  const [parejaFotos, setParejaFotos] = useState<Record<string, string | null>>(
    {}
  );
  const [jugadorFotos, setJugadorFotos] = useState<
    Record<string, string | null>
  >({});
  const [parejaRatings, setParejaRatings] = useState<
    Record<string, number | null>
  >({});
  const [parejaFotosReady, setParejaFotosReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [programaJornadaId, setProgramaJornadaId] = useState<string | null>(
    null
  );
  const organizerName = useOrganizerDisplayName(detalle?.organizador_id);
  const { isClubBranded } = useClubExperience();
  const cancelledRef = useRef(false);
  const programaUserPickedRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    programaUserPickedRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, [ligaId]);

  const selectProgramaJornada = useCallback((jornadaId: string) => {
    programaUserPickedRef.current = true;
    setProgramaJornadaId(jornadaId);
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await getLigaById(ligaId, true);
      if (cancelledRef.current) return;
      // Ranking en paralelo conceptual: detalle primero (nombres/nivel), ranking al lado.
      if (isEquiposModalidad(d.modalidad)) {
        setDetalle(d);
        setRanking([]);
        const rEq = await getRankingEquipos(ligaId);
        if (cancelledRef.current) return;
        setRankingEquipos(rEq);
      } else {
        setDetalle(d);
        setRankingEquipos([]);
        const r = await getRanking(ligaId);
        if (cancelledRef.current) return;
        setRanking(r);
      }
      setLastRefresh(new Date());
      setError(null);
    } catch (e) {
      if (cancelledRef.current) return;
      setError(e instanceof Error ? e.message : "Liga no encontrada");
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [ligaId]);

  useVisiblePolling({
    callback: load,
    intervalMs: LIGA_PUBLIC_POLL_INTERVAL_MS,
  });

  // Realtime como actualización principal; el polling de arriba queda como respaldo.
  const jornadaIds = useMemo(
    () => (detalle?.jornadas ?? []).map((j) => j.id),
    [detalle]
  );
  useLigaRealtime({
    ligaId: ligaId,
    jornadaIds,
    onUpdate: load,
    enabled: true,
  });

  useEffect(() => {
    const organizadorId = detalle?.organizador_id;
    if (!organizadorId || !detalle || isEquiposModalidad(detalle.modalidad)) {
      setJugadorFotos({});
      return;
    }

    const byId = new Map<string, string>();
    for (const row of ranking) {
      byId.set(row.jugador_id, row.nombre);
    }
    for (const j of detalle.jugadores ?? []) {
      if (!byId.has(j.id)) byId.set(j.id, j.nombre);
    }
    for (const jornada of detalle.jornadas ?? []) {
      for (const p of jornada.parejas ?? []) {
        if (p.jugador1_id && !byId.has(p.jugador1_id)) {
          byId.set(p.jugador1_id, p.jugador1?.nombre ?? "");
        }
        if (p.jugador2_id && !byId.has(p.jugador2_id)) {
          byId.set(p.jugador2_id, p.jugador2?.nombre ?? "");
        }
      }
    }
    const entries = Array.from(byId.entries()).map(([id, name]) => ({
      id,
      name,
    }));
    if (entries.length === 0) {
      setJugadorFotos({});
      return;
    }

    let cancelled = false;
    void resolveLigaJugadorPublicProfiles(organizadorId, entries)
      .then((profiles) => {
        if (cancelled || !profiles) return;
        const fotos: Record<string, string | null> = {};
        for (const entry of entries) {
          fotos[entry.id] = profiles[entry.id]?.fotoUrl ?? null;
        }
        setJugadorFotos(fotos);
      })
      .catch((err) => {
        console.warn("[liga] fotos ranking individual:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [detalle, ranking]);

  useEffect(() => {
    const organizadorId = detalle?.organizador_id;
    const equipos = detalle?.equipos ?? [];
    if (!organizadorId || !isEquiposModalidad(detalle?.modalidad) || !equipos.length) {
      setParejaFotos({});
      setParejaFotosReady(true);
      return;
    }

    const entries = equipos.flatMap((eq) => {
      const list: { id: string; name: string }[] = [];
      if (eq.jugador1_id) {
        list.push({
          id: eq.jugador1_id,
          name: eq.jugador1?.nombre ?? "",
        });
      }
      if (eq.jugador2_id) {
        list.push({
          id: eq.jugador2_id,
          name: eq.jugador2?.nombre ?? "",
        });
      }
      return list;
    });

    let cancelled = false;
    // No bloquear UI: iniciales/rating original (nivel) ya salen del detalle.
    setParejaFotosReady(true);
    void (async () => {
      // Perfiles (foto + rating Riviera) en paralelo; aplicar pendientes no bloquea.
      if (isParejasFijasPlayoffs(detalle?.modalidad)) {
        void supabase.auth.getSession().then(({ data: sessionData }) => {
          if (sessionData.session?.user?.id !== organizadorId) return;
          void aplicarRatingsPendientesLigaPlayoffs(ligaId, organizadorId).catch(
            (error) => console.warn("[rating] liga playoffs pendientes:", error)
          );
        });
      }
      return resolveLigaJugadorPublicProfiles(organizadorId, entries);
    })().then(
      (profiles) => {
        if (cancelled || !profiles) return;
        const fotos: Record<string, string | null> = {};
        const ratings: Record<string, number | null> = {};
        for (const entry of entries) {
          fotos[entry.id] = profiles[entry.id]?.fotoUrl ?? null;
          ratings[entry.id] = profiles[entry.id]?.rating ?? null;
        }
        setParejaFotos(fotos);
        setParejaRatings(ratings);
      }
    ).catch((error) => {
      console.warn("[rating] perfiles liga:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [ligaId, detalle?.organizador_id, detalle?.modalidad, detalle?.equipos]);

  const rankingEquiposOrdered = useMemo(() => {
    const sorted = [...rankingEquipos].sort((a, b) =>
      compareEquiposRanking(
        {
          puntos: a.puntos,
          diferencia_games: a.diferencia_games,
          games_favor: a.games_favor,
          partidos_ganados: a.partidos_ganados,
          partidos_jugados: a.partidos_jugados,
          nombre: a.nombre,
        },
        {
          puntos: b.puntos,
          diferencia_games: b.diferencia_games,
          games_favor: b.games_favor,
          partidos_ganados: b.partidos_ganados,
          partidos_jugados: b.partidos_jugados,
          nombre: b.nombre,
        }
      )
    );
    return sorted.map((row, index) => ({ ...row, posicion: index + 1 }));
  }, [rankingEquipos]);

  const rankingParejasPublicas = useMemo(() => {
    if (!detalle || !isEquiposModalidad(detalle.modalidad)) return [];
    const byId = new Map(detalle.equipos.map((e) => [e.id, e]));
    return rankingEquiposOrdered.map((ranking) => {
      const equipo = byId.get(ranking.equipo_id);
      const riviera1 = equipo
        ? parejaRatings[equipo.jugador1_id] ?? null
        : null;
      const riviera2 = equipo
        ? parejaRatings[equipo.jugador2_id] ?? null
        : null;
      const r1 = resolveLigaPublicPlayerRating(
        equipo?.jugador1?.nivel,
        riviera1
      );
      const r2 = resolveLigaPublicPlayerRating(
        equipo?.jugador2?.nivel,
        riviera2
      );
      return {
        ranking,
        equipo,
        // null inmediato → iniciales; la URL llega luego sin vaciar la tarjeta
        foto1: equipo
          ? parejaFotosReady
            ? parejaFotos[equipo.jugador1_id] ?? null
            : null
          : null,
        foto2: equipo
          ? parejaFotosReady
            ? parejaFotos[equipo.jugador2_id] ?? null
            : null
          : null,
        rating1: r1.value,
        rating2: r2.value,
        ratingCaption1: r1.source === "none" ? undefined : r1.label,
        ratingCaption2: r2.source === "none" ? undefined : r2.label,
        ratingEmpty1: r1.source === "none" ? r1.label : undefined,
        ratingEmpty2: r2.source === "none" ? r2.label : undefined,
      };
    });
  }, [
    detalle,
    rankingEquiposOrdered,
    parejaFotos,
    parejaRatings,
    parejaFotosReady,
  ]);

  const supportStatsByJugador = useMemo((): Map<
    string,
    JugadorSeasonSupportStats
  > => {
    if (!detalle || isEquiposModalidad(detalle.modalidad)) {
      return new Map();
    }
    return aggregateJugadorSeasonSupportStats(detalle.jornadas);
  }, [detalle]);

  useEffect(() => {
    if (!detalle?.jornadas.length) {
      setProgramaJornadaId(null);
      return;
    }
    const now = new Date();
    const preferred =
      pickDefaultPublicJornadaId(
        detalle.jornadas.map((j) => ({
          id: j.id,
          numero: j.numero,
          estado: jornadaPublicEstadoNow(j, now),
        }))
      ) ??
      detalle.jornadas[0]?.id ??
      null;
    setProgramaJornadaId((prev) => {
      if (
        programaUserPickedRef.current &&
        prev &&
        detalle.jornadas.some((j) => j.id === prev)
      ) {
        return prev;
      }
      return preferred;
    });
  }, [detalle]);

  if (loading && !detalle) {
    return (
      <ClubExperienceScope organizadorId={null} pendingUntilOrganizador>
        <PublicEventNeutralLoading message="Cargando liga…" />
      </ClubExperienceScope>
    );
  }

  if (!detalle) {
    return (
      <ClubExperienceScope organizadorId={null} pendingUntilOrganizador>
        <PublicEventNeutralLoading message={error ?? "No disponible"} />
      </ClubExperienceScope>
    );
  }

  const jornadaActiva = detalle.jornadas.find(
    (j) => jornadaPublicEstadoNow(j) === "in_progress"
  );

  const todasJornadasCompletas =
    detalle.jornadas.length > 0 &&
    detalle.jornadas.every((j) => jornadaPublicEstadoNow(j) === "completed");

  const ligaTerminada =
    detalle.estado === "completed" || todasJornadasCompletas;

  const esParejasFijas = isEquiposModalidad(detalle.modalidad);

  const podio = esParejasFijas
    ? rankingEquiposOrdered.slice(0, 3)
    : ranking.slice(0, 3);

  const podioOrdenVisual = esParejasFijas
    ? [podio[1], podio[0], podio[2]].filter(
        (row): row is LigaEquipoRankingItem => row != null
      )
    : [podio[1], podio[0], podio[2]].filter(
        (row): row is RankingItem => row != null
      );

  const ligaHeroMeta = esParejasFijas
    ? `${detalle.equipos.length} parejas · ${detalle.jornadas.length} jornadas`
    : `${detalle.inscripciones.length} jugadores · ${detalle.jornadas.length} jornadas`;
  const modalidadLabel = ligaModalidadPublicLabel(detalle.modalidad);
  /** Individual: modalidad en la meta del topline (sin pill suelto). */
  const heroMetaIndividual = `${modalidadLabel} · ${ligaHeroMeta}`;

  return (
    <ClubExperienceScope
      organizadorId={detalle.organizador_id}
      pendingUntilOrganizador
    >
    <PublicScopedBrandGate message="Cargando liga…">
    <div
      className={`liga-pantalla App--public-full-width ro-public-view ro-surface-dark${
        esParejasFijas ? " liga-pantalla--liga-fijas" : " liga-pantalla--individual"
      }`}
    >
      <div className="liga-pantalla__grain" aria-hidden />
      <PublicModeShell className="liga-pantalla__inner">
        {isPubDsV2Enabled ? (
          <PublicHero
            logoClub={
              <PublicEventBrandIdentity className="peds-hero__club-identity" />
            }
            estado={
              <StatusBadge variant={estadoLigaBadgeVariant(detalle.estado)}>
                {estadoLigaLabel(detalle.estado)}
              </StatusBadge>
            }
            nombreEvento={detalle.nombre}
            club={isClubBranded ? organizerName : undefined}
            categoria={esParejasFijas ? modalidadLabel : undefined}
            meta={esParejasFijas ? ligaHeroMeta : heroMetaIndividual}
          />
        ) : (
          <header className="liga-pantalla__header">
            <h1 className="liga-pantalla__title">{detalle.nombre}</h1>
            <p className="liga-pantalla__subtitle">
              {modalidadLabel} · {estadoLigaLabel(detalle.estado)} ·{" "}
              {ligaHeroMeta}
            </p>
          </header>
        )}

        <div
          className={`liga-pantalla__layout liga-pantalla__layout--liga${
            esParejasFijas
              ? " liga-pantalla__layout--parejas"
              : " liga-pantalla__layout--individual"
          }`}
        >
          <section
            className={`liga-pantalla-ranking liga-pantalla-ranking--wide${
              esParejasFijas
                ? " liga-pantalla-ranking--parejas"
                : " liga-pantalla-ranking--individual-primary"
            }`}
            {...(esParejasFijas
              ? { "aria-labelledby": "liga-pub-general-title" }
              : { "aria-labelledby": "liga-ind-ranking-title" })}
          >
            {esParejasFijas ? null : (
              <h2
                id="liga-ind-ranking-title"
                className="liga-pantalla-ranking__title"
              >
                Ranking acumulado
              </h2>
            )}
            {esParejasFijas ? (
              <LigaPublicParejasStandings
                rows={rankingParejasPublicas}
                motionResetKey={detalle.id}
                subtitle={`${detalle.equipos.length} parejas · ${detalle.jornadas.length} jornadas · ${estadoLigaLabel(detalle.estado)}`}
              />
            ) : ranking.length === 0 ? (
              <p className="liga-pantalla__loading">Sin puntos aún.</p>
            ) : (
              <>
                <div className="liga-ind-top3" role="list" aria-label="Podio del ranking">
                  {(podioOrdenVisual as RankingItem[]).map((row, idx) => {
                    const support = supportStatsByJugador.get(row.jugador_id);
                    const showSupport = hasMeaningfulSupportStats(support);
                    const foto = jugadorFotos[row.jugador_id];
                    return (
                      <article
                        key={row.jugador_id}
                        role="listitem"
                        className={`liga-ind-top3__card liga-ind-top3__card--${row.posicion} liga-ind-enter`}
                        style={
                          {
                            ["--liga-ind-i" as string]: idx,
                          } as React.CSSProperties
                        }
                      >
                        <div className="liga-ind-top3__portrait">
                          <JugadorAvatar
                            fotoUrl={foto}
                            nombre={row.nombre}
                            size="xl"
                            className="liga-ind-top3__photo"
                            alt=""
                          />
                          <span className="liga-ind-top3__pos" aria-hidden>
                            {row.posicion}
                          </span>
                        </div>
                        <div className="liga-ind-top3__body">
                          <p className="liga-ind-top3__name">{row.nombre}</p>
                          {row.ingreso_jornada_numero ? (
                            <p className="liga-ind-top3__ajuste">
                              Sustituto desde Jornada {row.ingreso_jornada_numero}
                            </p>
                          ) : row.puntos_ajuste_motivo ? (
                            <p className="liga-ind-top3__ajuste">
                              Ajuste: {row.puntos_ajuste_motivo}
                            </p>
                          ) : null}
                          <p className="liga-ind-top3__pts">
                            <span className="liga-ind-top3__pts-value">
                              {row.puntos}
                            </span>
                            <span className="liga-ind-top3__pts-label">pts</span>
                          </p>
                          {showSupport ? (
                            <p className="liga-ind-top3__support">
                              <span className="liga-ind-top3__vd">
                                {support.victorias}V – {support.derrotas}D
                              </span>
                              <span className="liga-ind-top3__dif">
                                DIF {formatSupportDif(support.diferencia_games)}
                              </span>
                            </p>
                          ) : (
                            <p className="liga-ind-top3__support liga-ind-top3__support--muted">
                              {row.jornadas_jugadas}{" "}
                              {row.jornadas_jugadas === 1
                                ? "jornada"
                                : "jornadas"}
                            </p>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>

                {ranking.length > 3 ? (
                  <div className="liga-ind-rest">
                    <ul className="liga-ind-rest__list" aria-label="Resto del ranking">
                      {ranking.slice(3).map((row, idx) => {
                        const foto = jugadorFotos[row.jugador_id];
                        return (
                          <li
                            key={row.jugador_id}
                            className="liga-ind-rest__row liga-ind-enter"
                            style={
                              {
                                ["--liga-ind-i" as string]: idx + 3,
                              } as React.CSSProperties
                            }
                          >
                            <span className="liga-ind-rest__rank" aria-hidden>
                              {row.posicion}
                            </span>
                            <JugadorAvatar
                              fotoUrl={foto}
                              nombre={row.nombre}
                              size="sm"
                              className="liga-ind-rest__avatar"
                              alt=""
                            />
                            <span className="liga-ind-rest__identity">
                              <span className="liga-ind-rest__name">
                                {row.nombre}
                              </span>
                              {row.ingreso_jornada_numero ? (
                                <span className="liga-ind-rest__ajuste">
                                  Sustituto desde Jornada{" "}
                                  {row.ingreso_jornada_numero}
                                  {row.sustituye_a_nombre
                                    ? ` · sustituye a ${row.sustituye_a_nombre}`
                                    : ""}
                                </span>
                              ) : row.puntos_ajuste_motivo ? (
                                <span className="liga-ind-rest__ajuste">
                                  Ajuste: {row.puntos_ajuste_motivo}
                                </span>
                              ) : null}
                            </span>
                            <span className="liga-ind-rest__stats">
                              <span className="liga-ind-rest__pts">
                                <strong>{row.puntos}</strong>
                                <small>pts</small>
                              </span>
                              <span className="liga-ind-rest__jorn">
                                {row.jornadas_jugadas} jorn.
                              </span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </>
            )}
          </section>

          <section
            id="programa-juego"
            className={`liga-pantalla-jornadas${
              esParejasFijas
                ? " liga-pantalla-jornadas--parejas liga-pub-programa"
                : " liga-pantalla-jornadas--individual-secondary"
            }`}
            {...(esParejasFijas
              ? { "aria-labelledby": "liga-pub-programa-title" }
              : { "aria-labelledby": "liga-ind-jornadas-title" })}
          >
            {esParejasFijas ? (
              <header className="liga-pub-programa__head">
                <p className="liga-pub-programa__eyebrow">Calendario</p>
                <h2
                  id="liga-pub-programa-title"
                  className="liga-pub-programa__title"
                >
                  Programa de juego
                </h2>
                <p className="liga-pub-programa__subtitle">
                  {detalle.jornadas.length} jornada
                  {detalle.jornadas.length === 1 ? "" : "s"}
                  {jornadaActiva
                    ? ` · jornada ${jornadaActiva.numero} en curso`
                    : ""}
                </p>
              </header>
            ) : (
              <h2
                id="liga-ind-jornadas-title"
                className="liga-pantalla-jornadas__title"
              >
                Jornadas
              </h2>
            )}
            {detalle.jornadas.length === 0 ? (
              <p className="liga-pantalla__loading">
                El calendario se publicará pronto.
              </p>
            ) : esParejasFijas ? (
              <>
                <div className="liga-pub-programa__picker">
                  <label
                    className="liga-pub-programa__picker-label"
                    htmlFor="liga-pub-programa-select"
                  >
                    Elegir jornada
                  </label>
                  <div className="liga-pub-programa__picker-shell">
                    <select
                      id="liga-pub-programa-select"
                      className="liga-pub-programa__select"
                      value={programaJornadaId ?? ""}
                      onChange={(e) => selectProgramaJornada(e.target.value)}
                    >
                      {detalle.jornadas.map((j) => (
                        <option key={j.id} value={j.id}>
                          Jornada {j.numero}
                          {j.fecha
                            ? ` · ${formatFechaLegible(dateInputValue(j.fecha))}`
                            : ""}
                          {` · ${jornadaBadgeLabel(jornadaPublicEstadoNow(j))}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="liga-pantalla-jornadas__grid liga-pantalla-jornadas__grid--parejas liga-pub-programa__grid">
                  {detalle.jornadas.map((j, jornadaIndex) => {
                    const tienePantalla = (j.partidos?.length ?? 0) > 0;
                    const esActiva = jornadaActiva?.id === j.id;
                    const matchups = listJornadaPublicMatches(
                      j,
                      detalle.equipos,
                      true
                    );
                    const jEstado = jornadaPublicEstadoNow(j);
                    const estadoMod =
                      jEstado === "in_progress"
                        ? "live"
                        : jEstado === "completed"
                          ? "done"
                          : "upcoming";
                    const isSelected = j.id === programaJornadaId;

                    return (
                      <article
                        key={j.id}
                        className={`liga-pantalla-jornada-card${
                          esActiva ? " liga-pantalla-jornada-card--live" : ""
                        } liga-pub-programa__card liga-pub-programa__card--${estadoMod}${
                          isSelected
                            ? " liga-pub-programa__card--selected"
                            : ""
                        }`}
                        style={
                          {
                            ["--liga-prog-i" as string]: jornadaIndex,
                          } as React.CSSProperties
                        }
                      >
                        <div className="liga-pantalla-jornada-card__head">
                          <div className="liga-pub-programa__card-titles">
                            <h3 className="liga-pantalla-jornada-card__num">
                              Jornada {j.numero}
                            </h3>
                            {j.fecha ? (
                              <p className="liga-pantalla-jornada-card__fecha">
                                {formatFechaLegible(dateInputValue(j.fecha))}
                              </p>
                            ) : null}
                          </div>
                          <span className={jornadaBadgeClass(jEstado)}>
                            {jornadaBadgeLabel(jEstado)}
                          </span>
                        </div>
                        <div className="liga-pantalla-jornada-card__body">
                          {matchups.length === 0 ? (
                            <p className="liga-pantalla-jornada-card__hint">
                              Partidos pendientes de iniciar
                            </p>
                          ) : (
                            <div className="liga-pub-programa__rounds">
                              {groupJornadaPublicMatchesByRonda(
                                matchups,
                                j,
                                detalle.canchas_disponibles
                              ).map(({ ronda, matches: roundMatches }) => (
                                <section
                                  key={`${j.id}-ronda-${ronda}`}
                                  className="liga-pub-programa__round"
                                  aria-label={`Ronda ${ronda}`}
                                >
                                  <h4 className="liga-pub-programa__round-title">
                                    Ronda {ronda}
                                  </h4>
                                  <ul className="liga-pantalla-matchups liga-pub-programa__matchups">
                                    {roundMatches.map((m, matchIndex) => (
                                      <LigaPubProgramaMatchCard
                                        key={m.id}
                                        match={m}
                                        partido={j.partidos?.find(
                                          (p) => p.id === m.id
                                        )}
                                        esParejasFijas
                                        jornadaFecha={j.fecha}
                                        matchIndex={matchIndex}
                                      />
                                    ))}
                                  </ul>
                                </section>
                              ))}
                            </div>
                          )}
                        </div>
                        {tienePantalla ? (
                          <a
                            href={publicLigaJornadaUrl(ligaId, j.numero)}
                            className="liga-pantalla-jornada-card__link liga-pub-programa__link"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Ver resultados
                            <span aria-hidden> →</span>
                          </a>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              (() => {
                const selectedJornada =
                  detalle.jornadas.find((j) => j.id === programaJornadaId) ??
                  detalle.jornadas[0];
                if (!selectedJornada) return null;
                const matchups = listJornadaPublicMatches(
                  selectedJornada,
                  detalle.equipos,
                  false
                );
                const tienePantalla =
                  (selectedJornada.partidos?.length ?? 0) > 0;
                const selectedEstado = jornadaPublicEstadoNow(selectedJornada);
                const estadoMod =
                  selectedEstado === "in_progress"
                    ? "live"
                    : selectedEstado === "completed"
                      ? "done"
                      : "upcoming";

                return (
                  <div className="liga-ind-jornadas">
                    <div
                      className="liga-ind-jornadas__index"
                      role="tablist"
                      aria-label="Índice de jornadas"
                    >
                      {detalle.jornadas.map((j) => {
                        const selected = j.id === selectedJornada.id;
                        const jEstado = jornadaPublicEstadoNow(j);
                        return (
                          <button
                            key={j.id}
                            type="button"
                            role="tab"
                            id={`liga-ind-jornada-tab-${j.numero}`}
                            aria-selected={selected}
                            aria-controls="liga-ind-jornada-panel"
                            tabIndex={selected ? 0 : -1}
                            className={`liga-ind-jornadas__tab${
                              selected ? " is-selected" : ""
                            } liga-ind-jornadas__tab--${
                              jEstado === "in_progress"
                                ? "live"
                                : jEstado === "completed"
                                  ? "done"
                                  : "upcoming"
                            }`}
                            onClick={() => selectProgramaJornada(j.id)}
                          >
                            <span className="liga-ind-jornadas__tab-num">
                              {j.numero}
                            </span>
                            <span className="liga-ind-jornadas__tab-label">
                              {jornadaBadgeLabel(jEstado)}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div
                      id="liga-ind-jornada-panel"
                      role="tabpanel"
                      aria-labelledby={`liga-ind-jornada-tab-${selectedJornada.numero}`}
                      className={`liga-ind-jornadas__panel liga-ind-jornadas__panel--${estadoMod}`}
                    >
                      <header className="liga-ind-jornadas__panel-head">
                        <div className="liga-ind-jornadas__panel-titles">
                          <h3 className="liga-ind-jornadas__panel-title">
                            Jornada {selectedJornada.numero}
                          </h3>
                          {selectedJornada.fecha ? (
                            <p className="liga-ind-jornadas__panel-fecha">
                              {formatFechaLegible(
                                dateInputValue(selectedJornada.fecha)
                              )}
                            </p>
                          ) : null}
                        </div>
                        <span className={jornadaBadgeClass(selectedEstado)}>
                          {jornadaBadgeLabel(selectedEstado)}
                        </span>
                      </header>

                      <div className="liga-ind-jornadas__panel-body">
                        {matchups.length === 0 ? (
                          <p className="liga-pantalla-jornada-card__hint">
                            Partidos pendientes de iniciar
                          </p>
                        ) : (
                          <ul className="liga-ind-jornadas__matches">
                            {(selectedJornada.parejas ?? []).map((pareja) => {
                              const labelFallback = splitParejaLabel(
                                matchups.find((m) => m.id === pareja.id)
                                  ?.local ?? ""
                              );
                              const nombre1 =
                                pareja.jugador1?.nombre?.trim() ||
                                labelFallback.a ||
                                "?";
                              const nombre2 =
                                pareja.jugador2?.nombre?.trim() ||
                                labelFallback.b ||
                                "?";
                              return (
                                <li
                                  key={pareja.id}
                                  className="liga-ind-jornadas__match"
                                >
                                  <div
                                    className="liga-ind-jornadas__faces"
                                    aria-hidden
                                  >
                                    <JugadorAvatar
                                      fotoUrl={
                                        jugadorFotos[pareja.jugador1_id]
                                      }
                                      nombre={nombre1}
                                      size="sm"
                                      className="liga-ind-jornadas__face"
                                    />
                                    <JugadorAvatar
                                      fotoUrl={
                                        jugadorFotos[pareja.jugador2_id]
                                      }
                                      nombre={nombre2}
                                      size="sm"
                                      className="liga-ind-jornadas__face"
                                    />
                                  </div>
                                  <span className="liga-ind-jornadas__pair">
                                    <span className="liga-ind-jornadas__player">
                                      {nombre1}
                                    </span>
                                    <span
                                      className="liga-ind-jornadas__sep"
                                      aria-hidden
                                    >
                                      /
                                    </span>
                                    <span className="liga-ind-jornadas__player">
                                      {nombre2}
                                    </span>
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>

                      {tienePantalla ? (
                        <a
                          href={publicLigaJornadaUrl(
                            ligaId,
                            selectedJornada.numero
                          )}
                          className="liga-ind-jornadas__link"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Ver resultados
                          <span aria-hidden> →</span>
                        </a>
                      ) : null}
                    </div>
                  </div>
                );
              })()
            )}
          </section>
        </div>

        {ligaTerminada && podio.length > 0 && (
          <section
            className="liga-pantalla-cierre"
            aria-labelledby="liga-cierre-titulo"
          >
            <p className="liga-pantalla-cierre__eyebrow">Temporada concluida</p>
            <h2 id="liga-cierre-titulo" className="liga-pantalla-cierre__title">
              ¡Gracias por su esfuerzo!
            </h2>
            <p className="liga-pantalla-cierre__mensaje">
              Cada punto, cada jornada y cada partido sumaron para hacer de esta
              liga una gran experiencia. Felicitamos a todos los jugadores por
              competir con entrega y buen espíritu deportivo.
            </p>

            <h3 className="liga-pantalla-cierre__podio-titulo">
              Primeros lugares del ranking
            </h3>
            <div className="liga-pantalla-podium" role="list">
              {esParejasFijas
                ? (podioOrdenVisual as LigaEquipoRankingItem[]).map((row) => {
                    const lugar = row.posicion;
                    const medal =
                      lugar === 1 ? "🥇" : lugar === 2 ? "🥈" : "🥉";
                    return (
                      <article
                        key={row.equipo_id}
                        role="listitem"
                        className={`liga-pantalla-podium__place liga-pantalla-podium__place--${lugar}`}
                      >
                        <span className="liga-pantalla-podium__medal" aria-hidden>
                          {medal}
                        </span>
                        <span className="liga-pantalla-podium__rank">{lugar}°</span>
                        <p className="liga-pantalla-podium__name">{row.nombre}</p>
                        <p className="liga-pantalla-podium__pts">
                          {row.puntos}{" "}
                          <span className="liga-pantalla-podium__pts-label">pts</span>
                        </p>
                        <p className="liga-pantalla-podium__meta">
                          {row.games_favor} GF · DIF {row.diferencia_games >= 0 ? "+" : ""}
                          {row.diferencia_games}
                        </p>
                      </article>
                    );
                  })
                : (podioOrdenVisual as RankingItem[]).map((row) => {
                    const lugar = row.posicion;
                    const medal =
                      lugar === 1 ? "🥇" : lugar === 2 ? "🥈" : "🥉";
                    return (
                      <article
                        key={row.jugador_id}
                        role="listitem"
                        className={`liga-pantalla-podium__place liga-pantalla-podium__place--${lugar}`}
                      >
                        <span className="liga-pantalla-podium__medal" aria-hidden>
                          {medal}
                        </span>
                        <span className="liga-pantalla-podium__rank">{lugar}°</span>
                        <p className="liga-pantalla-podium__name">{row.nombre}</p>
                        <p className="liga-pantalla-podium__pts">
                          {row.puntos}{" "}
                          <span className="liga-pantalla-podium__pts-label">pts</span>
                        </p>
                        <p className="liga-pantalla-podium__meta">
                          {row.jornadas_jugadas}{" "}
                          {row.jornadas_jugadas === 1 ? "jornada" : "jornadas"}
                        </p>
                      </article>
                    );
                  })}
            </div>
          </section>
        )}

        <footer className="liga-pantalla__footer">
          Actualización automática
          {lastRefresh
            ? ` · ${lastRefresh.toLocaleTimeString("es-MX", {
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : ""}
        </footer>
      </PublicModeShell>
    </div>
    </PublicScopedBrandGate>
    </ClubExperienceScope>
  );
};
