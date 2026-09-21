import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  LigaDetalle,
  LigaEquipoRankingItem,
  LigaJornada,
  RankingItem,
} from "../../lib/liga/types";
import { isEquiposModalidad } from "../../lib/liga/ligaModalidad";
import { compareEquiposRanking } from "../../lib/liga/equiposRanking";
import { ligaModalidadPublicLabel } from "../../lib/liga/types";
import {
  groupJornadaPublicMatchesByRonda,
  listJornadaPublicMatches,
} from "../../lib/liga/publicDisplay";
import { formatFechaLegible, dateInputValue } from "../../lib/liga/programacion";
import { LIGA_PUBLIC_POLL_INTERVAL_MS } from "../../lib/liga/publicPoll";
import { resolveLigaJugadorPublicFotos } from "../../lib/liga/publicParejaAvatars";
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

/** Jornada expandida por defecto: en curso, o la completed más reciente. */
function jornadaFeaturedOpenId(jornadas: LigaJornada[]): string | null {
  const live = jornadas.find((j) => j.estado === "in_progress");
  if (live) return live.id;
  const completed = jornadas
    .filter((j) => j.estado === "completed")
    .sort((a, b) => b.numero - a.numero);
  return completed[0]?.id ?? null;
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

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, [ligaId]);

  const load = useCallback(async () => {
    try {
      const d = await getLigaById(ligaId, true);
      if (cancelledRef.current) return;
      if (isEquiposModalidad(d.modalidad)) {
        const rEq = await getRankingEquipos(ligaId);
        if (cancelledRef.current) return;
        setDetalle(d);
        setRankingEquipos(rEq);
        setRanking([]);
      } else {
        const r = await getRanking(ligaId);
        if (cancelledRef.current) return;
        setDetalle(d);
        setRanking(r);
        setRankingEquipos([]);
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
    setParejaFotosReady(false);
    void resolveLigaJugadorPublicFotos(organizadorId, entries).then((fotos) => {
      if (cancelled) return;
      setParejaFotos(fotos);
      setParejaFotosReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [detalle?.organizador_id, detalle?.modalidad, detalle?.equipos]);

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
      return {
        ranking,
        equipo,
        foto1: !parejaFotosReady
          ? undefined
          : equipo
            ? parejaFotos[equipo.jugador1_id] ?? null
            : null,
        foto2: !parejaFotosReady
          ? undefined
          : equipo
            ? parejaFotos[equipo.jugador2_id] ?? null
            : null,
      };
    });
  }, [detalle, rankingEquiposOrdered, parejaFotos, parejaFotosReady]);

  const supportStatsByJugador = useMemo((): Map<
    string,
    JugadorSeasonSupportStats
  > => {
    if (!detalle || isEquiposModalidad(detalle.modalidad)) {
      return new Map();
    }
    return aggregateJugadorSeasonSupportStats(detalle.jornadas);
  }, [detalle]);

  const [expandedJornadaIds, setExpandedJornadaIds] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    if (!detalle?.jornadas.length || isEquiposModalidad(detalle.modalidad)) {
      return;
    }
    const featured = jornadaFeaturedOpenId(detalle.jornadas);
    setExpandedJornadaIds((prev) => {
      // Solo inicializar si aún no hay selección (evita pisar toggles del usuario).
      if (prev.size > 0) {
        const stillValid = Array.from(prev).some((id) =>
          detalle.jornadas.some((j) => j.id === id)
        );
        if (stillValid) return prev;
      }
      return featured ? new Set([featured]) : new Set();
    });
  }, [detalle]);

  useEffect(() => {
    if (!detalle?.jornadas.length) {
      setProgramaJornadaId(null);
      return;
    }
    const preferred =
      detalle.jornadas.find((j) => j.estado === "in_progress")?.id ??
      detalle.jornadas.find((j) => j.estado === "upcoming")?.id ??
      detalle.jornadas[detalle.jornadas.length - 1]?.id ??
      detalle.jornadas[0]?.id ??
      null;
    setProgramaJornadaId((prev) => {
      if (prev && detalle.jornadas.some((j) => j.id === prev)) return prev;
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

  const jornadaActiva = detalle.jornadas.find((j) => j.estado === "in_progress");

  const todasJornadasCompletas =
    detalle.jornadas.length > 0 &&
    detalle.jornadas.every((j) => j.estado === "completed");

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
                <div className="liga-ind-top3" role="list">
                  {ranking.slice(0, 3).map((row) => {
                    const support = supportStatsByJugador.get(row.jugador_id);
                    const showSupport = hasMeaningfulSupportStats(support);
                    return (
                      <article
                        key={row.jugador_id}
                        role="listitem"
                        className={`liga-ind-top3__card liga-ind-top3__card--${row.posicion}`}
                      >
                        <span className="liga-ind-top3__pos" aria-hidden>
                          {row.posicion}
                        </span>
                        <div className="liga-ind-top3__body">
                          <p className="liga-ind-top3__name">{row.nombre}</p>
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
                    <table className="liga-ind-rest__table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Jugador</th>
                          <th>Pts</th>
                          <th>Jorn.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ranking.slice(3).map((row) => (
                          <tr key={row.jugador_id}>
                            <td className="liga-pantalla-ranking__rank">
                              {row.posicion}
                            </td>
                            <td className="liga-pantalla-ranking__name">
                              {row.nombre}
                            </td>
                            <td className="liga-pantalla-ranking__pts">
                              {row.puntos}
                            </td>
                            <td className="liga-pantalla-ranking__meta">
                              {row.jornadas_jugadas}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
            ) : (
              <>
                {esParejasFijas ? (
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
                        onChange={(e) => setProgramaJornadaId(e.target.value)}
                      >
                        {detalle.jornadas.map((j) => (
                          <option key={j.id} value={j.id}>
                            Jornada {j.numero}
                            {j.fecha
                              ? ` · ${formatFechaLegible(dateInputValue(j.fecha))}`
                              : ""}
                            {` · ${jornadaBadgeLabel(j.estado)}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : null}
                <div
                  className={`liga-pantalla-jornadas__grid${
                    esParejasFijas
                      ? " liga-pantalla-jornadas__grid--parejas liga-pub-programa__grid"
                      : " liga-pantalla-jornadas__grid--individual"
                  }`}
                >
                  {detalle.jornadas.map((j, jornadaIndex) => {
                    const tienePantalla = (j.partidos?.length ?? 0) > 0;
                    const esActiva = jornadaActiva?.id === j.id;
                    const matchups = listJornadaPublicMatches(
                      j,
                      detalle.equipos,
                      esParejasFijas
                    );
                    const estadoMod =
                      j.estado === "in_progress"
                        ? "live"
                        : j.estado === "completed"
                          ? "done"
                          : "upcoming";
                    const isSelected =
                      !esParejasFijas || j.id === programaJornadaId;
                    const defaultOpen = expandedJornadaIds.has(j.id);

                    if (!esParejasFijas) {
                      return (
                        <details
                          key={j.id}
                          className={`liga-pantalla-jornada-card liga-ind-jornada${
                            esActiva ? " liga-pantalla-jornada-card--live" : ""
                          } liga-pantalla-jornada-card--${estadoMod}`}
                          open={defaultOpen}
                          onToggle={(e) => {
                            const isOpen = (e.currentTarget as HTMLDetailsElement)
                              .open;
                            setExpandedJornadaIds((prev) => {
                              const next = new Set(prev);
                              if (isOpen) next.add(j.id);
                              else next.delete(j.id);
                              return next;
                            });
                          }}
                        >
                          <summary className="liga-ind-jornada__summary">
                            <div className="liga-pantalla-jornada-card__head">
                              <div className="liga-pub-programa__card-titles">
                                <h3 className="liga-pantalla-jornada-card__num">
                                  Jornada {j.numero}
                                </h3>
                                {j.fecha ? (
                                  <p className="liga-pantalla-jornada-card__fecha">
                                    {formatFechaLegible(
                                      dateInputValue(j.fecha)
                                    )}
                                  </p>
                                ) : null}
                              </div>
                              <span className={jornadaBadgeClass(j.estado)}>
                                {jornadaBadgeLabel(j.estado)}
                              </span>
                            </div>
                          </summary>
                          <div className="liga-pantalla-jornada-card__body">
                            {matchups.length === 0 ? (
                              <p className="liga-pantalla-jornada-card__hint">
                                Partidos pendientes de iniciar
                              </p>
                            ) : (
                              <div className="liga-pantalla-parejas liga-pantalla-parejas--card">
                                {matchups.map((m) => {
                                  const { a, b } = splitParejaLabel(m.local);
                                  return (
                                    <span
                                      key={m.id}
                                      className="liga-pantalla-pareja"
                                    >
                                      <span className="liga-pantalla-pareja__a">
                                        {a}
                                      </span>
                                      {b ? (
                                        <>
                                          <span
                                            className="liga-pantalla-pareja__sep"
                                            aria-hidden
                                          >
                                            /
                                          </span>
                                          <span className="liga-pantalla-pareja__b">
                                            {b}
                                          </span>
                                        </>
                                      ) : null}
                                    </span>
                                  );
                                })}
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
                        </details>
                      );
                    }

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
                          <span className={jornadaBadgeClass(j.estado)}>
                            {jornadaBadgeLabel(j.estado)}
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
                                        esParejasFijas={esParejasFijas}
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
