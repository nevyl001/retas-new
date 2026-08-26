import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeJornadaPublicStats } from "../../lib/liga/jornadaStats";
import {
  buildVictoriaRankLabel,
  findPartidoGanadoPareja,
  statsParejaJornadaVictoria,
} from "../../lib/liga/jornadaCelebrate";
import {
  formatJornadaParejaNombre,
  getPartidoPublicScoreboard,
  partidoMatchWinnerSide,
} from "../../lib/liga/publicDisplay";
import { timeInputValue } from "../../lib/liga/programacion";
import type { LigaDetalle, LigaJornada, LigaJornadaPareja, LigaPartido } from "../../lib/liga/types";
import { isEquiposModalidad, isParejasFijasPlayoffs } from "../../lib/liga/ligaModalidad";
import { LIGA_PUBLIC_POLL_INTERVAL_MS } from "../../lib/liga/publicPoll";
import { resolveLigaJugadorPublicFotos } from "../../lib/liga/publicParejaAvatars";
import { getLigaById } from "../../services/ligaService";
import { ClubExperienceScope, PublicClubModeEyebrow, PublicEventBrandIdentity, useClubExperience, useOrganizerDisplayName } from "../../club-experience";
import { isPubDsV2Enabled } from "../../config/peds";
import { useLigaRealtime } from "../../hooks/useLigaRealtime";
import { useVisiblePolling } from "../../hooks/useVisiblePolling";
import type { PublicRetaWinnerAvatar } from "../public/PublicRetaWinnerSection";
import { PublicModeShell } from "../platform/PublicModeShell";
import { StatusBadge } from "../platform/StatusBadge";
import { PublicHero } from "../public/peds";
import { LigaParejaVictoriaCelebrate } from "./LigaParejaVictoriaCelebrate";
import {
  LigaPublicParejaPlayers,
  parejaPlayerNames,
} from "./LigaPublicParejaFaces";
import "./liga-pareja-victoria-celebrate.css";
import "./liga-public-pantalla.css";
import "../jugadores/riviera-jugadores.css";

function jornadaEstadoLabel(estado: LigaJornada["estado"]): string {
  if (estado === "completed") return "Finalizada";
  if (estado === "in_progress") return "En curso";
  return "Próxima";
}

function jornadaEstadoBadgeVariant(
  estado: LigaJornada["estado"]
): "live" | "muted" | "pending" {
  if (estado === "in_progress") return "live";
  if (estado === "completed") return "muted";
  return "pending";
}

function formatJornadaFechaPublica(fecha: string | null | undefined): string | null {
  if (!fecha) return null;
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)}`;
}

interface LigaJornadaPublicaProps {
  ligaId: string;
  numero: number;
}

function rondaLabel(estado: string): string {
  if (estado === "live") return "En curso";
  if (estado === "done") return "Completada";
  return "Pendiente";
}

function partidoPublicEstadoLabel(estado: LigaPartido["estado"]): string {
  if (estado === "completed") return "Final";
  if (estado === "in_progress") return "En juego";
  return "Pendiente";
}

function partidoPublicEstadoMod(
  estado: LigaPartido["estado"]
): "pending" | "live" | "done" {
  if (estado === "completed") return "done";
  if (estado === "in_progress") return "live";
  return "pending";
}

function scoreDisplay(
  partido: LigaPartido
): { s1: string; s2: string } {
  if (partido.estado !== "completed") {
    return { s1: "—", s2: "—" };
  }
  return {
    s1: String(partido.score_pareja1 ?? 0),
    s2: String(partido.score_pareja2 ?? 0),
  };
}

export const LigaJornadaPublica: React.FC<LigaJornadaPublicaProps> = ({
  ligaId,
  numero,
}) => {
  const [detalle, setDetalle] = useState<LigaDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [parejaFotos, setParejaFotos] = useState<Record<string, string | null>>(
    {}
  );
  const organizerName = useOrganizerDisplayName(detalle?.organizador_id);
  const { isClubBranded } = useClubExperience();
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, [ligaId, numero]);

  const load = useCallback(async () => {
    try {
      const d = await getLigaById(ligaId, true);
      if (cancelledRef.current) return;
      setDetalle(d);
      setLastRefresh(new Date());
      setError(null);
    } catch (e) {
      if (cancelledRef.current) return;
      setError(e instanceof Error ? e.message : "No disponible");
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
    ligaId,
    jornadaIds,
    onUpdate: load,
    enabled: true,
  });

  const jornada = useMemo(
    () => detalle?.jornadas.find((j) => j.numero === numero),
    [detalle, numero]
  );

  useEffect(() => {
    const organizadorId = detalle?.organizador_id;
    const parejas = jornada?.parejas;
    if (!organizadorId || !parejas?.length) {
      setParejaFotos({});
      return;
    }

    const equiposMap = new Map(
      (detalle?.equipos ?? []).map((e) => [e.id, e] as const)
    );

    const entries = parejas.flatMap((p) => {
      const face = parejaPlayerNames(p, equiposMap);
      const list: { id: string; name: string }[] = [];
      if (face.id1) list.push({ id: face.id1, name: face.name1 });
      if (face.id2) list.push({ id: face.id2, name: face.name2 });
      return list;
    });

    let cancelled = false;
    void resolveLigaJugadorPublicFotos(organizadorId, entries).then((fotos) => {
      if (!cancelled) setParejaFotos(fotos);
    });

    return () => {
      cancelled = true;
    };
  }, [detalle?.organizador_id, detalle?.equipos, jornada?.parejas]);

  const partidosByRonda = useMemo(() => {
    const map = new Map<number, LigaPartido[]>();
    for (const p of jornada?.partidos ?? []) {
      const list = map.get(p.ronda) ?? [];
      list.push(p);
      map.set(p.ronda, list);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([ronda, partidos]) => [
        ronda,
        [...partidos].sort((a, b) => (a.cancha ?? 0) - (b.cancha ?? 0)),
      ] as [number, LigaPartido[]]);
  }, [jornada]);

  const rondaEstados = useMemo(() => {
    return partidosByRonda.map(([ronda, partidos]) => {
      const completa = partidos.every((p) => p.estado === "completed");
      const enCurso = partidos.some((p) => p.estado === "in_progress");
      return {
        ronda,
        estado: completa ? "done" : enCurso ? "live" : "pending",
      };
    });
  }, [partidosByRonda]);

  const esParejasFijas = isEquiposModalidad(detalle?.modalidad ?? "individual_rotativo");
  const esParejasFijasPlayoffs = isParejasFijasPlayoffs(
    detalle?.modalidad ?? "individual_rotativo"
  );

  const jornadaStats = useMemo(
    () => computeJornadaPublicStats(jornada, { parejasFijas: esParejasFijas }),
    [jornada, esParejasFijas]
  );

  const equiposById = useMemo(
    () => new Map((detalle?.equipos ?? []).map((e) => [e.id, e])),
    [detalle]
  );

  const todosPartidosCompletos =
    (jornada?.partidos?.length ?? 0) > 0 &&
    jornada!.partidos!.every((p) => p.estado === "completed");

  const parejasGanadorasJornada = useMemo(() => {
    return jornadaStats.rankingParejas.filter((row) => row.victorias > 0);
  }, [jornadaStats.rankingParejas]);

  const nombreParejaGanadora = (parejaId: string, fallback: string) => {
    const pareja = jornada?.parejas?.find((p) => p.id === parejaId);
    return pareja
      ? formatJornadaParejaNombre(pareja, equiposById)
      : fallback;
  };

  const winnerAvatarsForPareja = (
    pareja: LigaJornadaPareja | undefined
  ): PublicRetaWinnerAvatar[] | undefined => {
    if (!pareja) return undefined;
    return [
      {
        name: pareja.jugador1?.nombre ?? "?",
        jugadorId: pareja.jugador1_id,
        fotoUrl: parejaFotos[pareja.jugador1_id] ?? undefined,
      },
      {
        name: pareja.jugador2?.nombre ?? "?",
        jugadorId: pareja.jugador2_id,
        fotoUrl: parejaFotos[pareja.jugador2_id] ?? undefined,
      },
    ];
  };

  const resolveParejaFace = (parejaId: string) => {
    const pareja = jornada?.parejas?.find((x) => x.id === parejaId);
    const names = parejaPlayerNames(pareja, equiposById);
    return {
      ...names,
      foto1: names.id1 ? parejaFotos[names.id1] ?? null : null,
      foto2: names.id2 ? parejaFotos[names.id2] ?? null : null,
    };
  };

  if (loading && !detalle) {
    return (
      <ClubExperienceScope organizadorId={null} pendingUntilOrganizador>
        <div className="liga-pantalla App--public-full-width ro-public-view ro-surface-dark">
          <div className="liga-pantalla__grain" aria-hidden />
          <PublicModeShell className="liga-pantalla__inner">
            <p className="liga-pantalla__loading">Cargando jornada…</p>
          </PublicModeShell>
        </div>
      </ClubExperienceScope>
    );
  }

  if (!detalle || !jornada) {
    return (
      <ClubExperienceScope
        organizadorId={detalle?.organizador_id ?? null}
        pendingUntilOrganizador={!detalle?.organizador_id}
      >
        <div className="liga-pantalla App--public-full-width ro-public-view ro-surface-dark">
          <div className="liga-pantalla__grain" aria-hidden />
          <PublicModeShell className="liga-pantalla__inner">
            <p className="liga-pantalla__error">{error ?? "Jornada no encontrada"}</p>
          </PublicModeShell>
        </div>
      </ClubExperienceScope>
    );
  }

  const jornadaEstadoText = jornadaEstadoLabel(jornada.estado);
  const jornadaFechaText = formatJornadaFechaPublica(jornada.fecha);
  const canchasDisponibles = Math.max(1, detalle.canchas_disponibles ?? 4);
  const totalPartidos = jornada.partidos?.length ?? 0;

  const renderMatchCard = (partido: LigaPartido, duelLayout: boolean) => {
    const { s1, s2 } = scoreDisplay(partido);
    const pending = partido.estado !== "completed";
    const winner = partidoMatchWinnerSide(partido, esParejasFijas);
    const p1Wins = winner === 1;
    const p2Wins = winner === 2;
    const side1 = resolveParejaFace(partido.pareja1_id);
    const side2 = resolveParejaFace(partido.pareja2_id);
    const canchaNum = partido.cancha ?? "?";
    const horario = timeInputValue(partido.hora_inicio) || null;
    const estadoMod = partidoPublicEstadoMod(partido.estado);
    const estadoText = partidoPublicEstadoLabel(partido.estado);
    const board = getPartidoPublicScoreboard(partido, esParejasFijas);

    const renderDuelSeparator = () => {
      if (board.kind === "wo") {
        return (
          <p className="liga-pantalla-match__wo-pill" role="status">
            WO
          </p>
        );
      }
      if (board.kind === "board") {
        return (
          <div className="liga-pantalla-match__setboard" aria-label="Marcador">
            {board.columns.map((col) => {
              const topWin = col.p1 > col.p2;
              const botWin = col.p2 > col.p1;
              return (
                <div key={col.label} className="liga-pantalla-match__setboard-col">
                  <span className="liga-pantalla-match__setboard-label">
                    {col.label}
                  </span>
                  <span
                    className={`liga-pantalla-match__setboard-cell${
                      topWin ? " liga-pantalla-match__setboard-cell--win" : ""
                    }`}
                  >
                    {col.p1}
                  </span>
                  <span
                    className={`liga-pantalla-match__setboard-cell${
                      botWin ? " liga-pantalla-match__setboard-cell--win" : ""
                    }`}
                  >
                    {col.p2}
                  </span>
                </div>
              );
            })}
          </div>
        );
      }
      if (board.kind === "simple") {
        return (
          <p className="liga-pantalla-match__scoreline">
            <span className={p1Wins ? "liga-pantalla-match__scoreline-win" : undefined}>
              {board.s1}
            </span>
            <span className="liga-pantalla-match__vs-pill">VS</span>
            <span className={p2Wins ? "liga-pantalla-match__scoreline-win" : undefined}>
              {board.s2}
            </span>
          </p>
        );
      }
      return <p className="liga-pantalla-match__vs-pill">VS</p>;
    };

    if (duelLayout) {
      return (
        <article
          key={partido.id}
          className="liga-pantalla-match liga-pantalla-match--duel"
        >
          <header className="liga-pantalla-match__head">
            <div className="liga-pantalla-match__head-left">
              <span className="liga-pantalla-match__cancha">
                Cancha {canchaNum}
              </span>
              {horario ? (
                <span className="liga-pantalla-match__hora">{horario}</span>
              ) : null}
            </div>
            <span
              className={`liga-pantalla-match__status liga-pantalla-match__status--${estadoMod}`}
            >
              {estadoText}
            </span>
          </header>
          <div className="liga-pantalla-match__duel">
            <div
              className={`liga-pantalla-match__side${
                p1Wins
                  ? " liga-pantalla-match__side--win"
                  : p2Wins
                    ? " liga-pantalla-match__side--loss"
                    : ""
              }`}
            >
              <LigaPublicParejaPlayers
                name1={side1.name1}
                name2={side1.name2}
                foto1={side1.foto1}
                foto2={side1.foto2}
                size="lg"
                orientation="stack"
                win={p1Wins}
              />
            </div>
            <div className="liga-pantalla-match__separator">
              {renderDuelSeparator()}
            </div>
            <div
              className={`liga-pantalla-match__side${
                p2Wins
                  ? " liga-pantalla-match__side--win"
                  : p1Wins
                    ? " liga-pantalla-match__side--loss"
                    : ""
              }`}
            >
              <LigaPublicParejaPlayers
                name1={side2.name1}
                name2={side2.name2}
                foto1={side2.foto1}
                foto2={side2.foto2}
                size="lg"
                orientation="stack"
                win={p2Wins}
              />
            </div>
          </div>
        </article>
      );
    }

    return (
      <article
        key={partido.id}
        className="liga-pantalla-match liga-pantalla-match--faces"
      >
        <header className="liga-pantalla-match__head">
          <span className="liga-pantalla-match__cancha">Cancha {canchaNum}</span>
          {horario ? (
            <span className="liga-pantalla-match__hora">{horario}</span>
          ) : null}
        </header>
        <div className="liga-pantalla-match__board">
          <div
            className={`liga-pantalla-match__row liga-pantalla-match__row--face${
              p1Wins ? " liga-pantalla-match__row--win" : ""
            }`}
          >
            <LigaPublicParejaPlayers
              name1={side1.name1}
              name2={side1.name2}
              foto1={side1.foto1}
              foto2={side1.foto2}
              size="sm"
              win={p1Wins}
            />
            <span
              className={`liga-pantalla-match__pts${
                pending ? " liga-pantalla-match__pts--pending" : ""
              }`}
            >
              {s1}
            </span>
          </div>
          <div className="liga-pantalla-match__mid">
            <p className="liga-pantalla-match__vs">vs</p>
          </div>
          <div
            className={`liga-pantalla-match__row liga-pantalla-match__row--face${
              p2Wins ? " liga-pantalla-match__row--win" : ""
            }`}
          >
            <LigaPublicParejaPlayers
              name1={side2.name1}
              name2={side2.name2}
              foto1={side2.foto1}
              foto2={side2.foto2}
              size="sm"
              win={p2Wins}
            />
            <span
              className={`liga-pantalla-match__pts${
                pending ? " liga-pantalla-match__pts--pending" : ""
              }`}
            >
              {s2}
            </span>
          </div>
        </div>
      </article>
    );
  };

  return (
    <ClubExperienceScope
      organizadorId={detalle.organizador_id}
      pendingUntilOrganizador
    >
    <div
      className={`liga-pantalla App--public-full-width ro-public-view ro-surface-dark${
        esParejasFijas ? " liga-pantalla--jornada-fijas" : ""
      }`}
    >
      <div className="liga-pantalla__grain" aria-hidden />
      <PublicModeShell className="liga-pantalla__inner">
        {isPubDsV2Enabled ? (
          <PublicHero
            className="liga-pantalla-jornada-hero"
            logoClub={
              <PublicEventBrandIdentity className="peds-hero__club-identity" />
            }
            estado={
              <StatusBadge variant={jornadaEstadoBadgeVariant(jornada.estado)}>
                {jornadaEstadoText}
              </StatusBadge>
            }
            nombreEvento={detalle.nombre}
            club={isClubBranded ? organizerName : undefined}
            categoria={`Jornada ${numero}`}
            fecha={jornadaFechaText}
            meta={
              totalPartidos > 0
                ? `${partidosByRonda.length} ronda${
                    partidosByRonda.length === 1 ? "" : "s"
                  } · ${canchasDisponibles} canchas`
                : "Liga"
            }
          />
        ) : (
          <header className="liga-pantalla__header">
            <PublicClubModeEyebrow modeLabel="Liga" />
            <h1 className="liga-pantalla__title">{detalle.nombre}</h1>
            <p className="liga-pantalla__subtitle">
              Jornada {numero}
              {jornada.fecha
                ? ` · ${jornada.fecha.slice(8, 10)}/${jornada.fecha.slice(5, 7)}/${jornada.fecha.slice(0, 4)}`
                : ""}
              {" · "}
              {jornadaEstadoText}
            </p>
          </header>
        )}

        {/* Roster de parejas solo en el link completo de la liga (LigaDetallePublica).
            En jornada pública: solo partidos + tabla. */}

        {!esParejasFijas &&
          todosPartidosCompletos &&
          jornadaStats.ganadorPareja && (
          <div className="liga-pantalla-winner" role="status">
            <p className="liga-pantalla-winner__eyebrow">¡Felicidades!</p>
            <p className="liga-pantalla-winner__title">
              {jornadaStats.ganadorPareja.nombre}
            </p>
            <p className="liga-pantalla-winner__meta">
              Pareja ganadora de la jornada · {jornadaStats.ganadorPareja.victorias}{" "}
              {jornadaStats.ganadorPareja.victorias === 1 ? "victoria" : "victorias"} ·{" "}
              {jornadaStats.ganadorPareja.puntos} pts
            </p>
          </div>
        )}

        {esParejasFijas &&
          todosPartidosCompletos &&
          parejasGanadorasJornada.length > 0 && (
          <div className="liga-parejas-victorias-grid" role="status">
            {parejasGanadorasJornada.map((row) => {
              const pareja = jornada.parejas?.find((p) => p.id === row.parejaId);
              const pairLabel = nombreParejaGanadora(row.parejaId, row.nombre);
              const partidoGanado = findPartidoGanadoPareja(row.parejaId, jornada);
              return (
                <LigaParejaVictoriaCelebrate
                  key={row.parejaId}
                  pairId={row.parejaId}
                  pairLabel={pairLabel}
                  torneoNombre={detalle.nombre}
                  rankLabel={buildVictoriaRankLabel(partidoGanado, jornada.fecha)}
                  stats={statsParejaJornadaVictoria(row.parejaId, jornada, row)}
                  winners={winnerAvatarsForPareja(pareja)}
                />
              );
            })}
          </div>
        )}

        <div
          className={`liga-pantalla__layout${
            esParejasFijas ? " liga-pantalla__layout--parejas" : ""
          }`}
        >
          <div className="liga-pantalla__rondas">
            {totalPartidos === 0 ? (
              <p className="liga-pantalla__loading">
                Los partidos aparecerán cuando se inicie la jornada.
              </p>
            ) : (
              partidosByRonda.map(([ronda, partidos]) => {
                const meta = rondaEstados.find((x) => x.ronda === ronda);
                const estado = meta?.estado ?? "pending";
                return (
                  <section
                    key={ronda}
                    className={`liga-pantalla-ronda${
                      esParejasFijas ? " liga-pantalla-ronda--courts" : ""
                    }${estado === "live" ? " liga-pantalla-ronda--live" : ""}`}
                  >
                    <div className="liga-pantalla-ronda__head">
                      <div className="liga-pantalla-ronda__heading">
                        <h2 className="liga-pantalla-ronda__title">
                          Ronda {ronda}
                        </h2>
                        {esParejasFijas ? (
                          <p className="liga-pantalla-ronda__meta">
                            {partidos.length} partido
                            {partidos.length === 1 ? "" : "s"}
                            {" · "}
                            {partidos.length} cancha
                            {partidos.length === 1 ? "" : "s"}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={`liga-pantalla-ronda__badge${
                          estado === "live"
                            ? " liga-pantalla-ronda__badge--live"
                            : estado === "done"
                              ? " liga-pantalla-ronda__badge--done"
                              : ""
                        }`}
                      >
                        {rondaLabel(estado)}
                      </span>
                    </div>
                    <div
                      className={`liga-pantalla-ronda__matches${
                        esParejasFijas
                          ? " liga-pantalla-ronda__matches--courts"
                          : ""
                      }`}
                    >
                      {partidos.map((partido) =>
                        renderMatchCard(partido, esParejasFijas)
                      )}
                    </div>
                  </section>
                );
              })
            )}
          </div>

          <aside
            className={`liga-pantalla-ranking${
              esParejasFijas
                ? " liga-pantalla-ranking--parejas liga-pantalla-ranking--jornada-fijas"
                : ""
            }`}
          >
            {esParejasFijas ? (
              <>
                <h2 className="liga-pantalla-ranking__title">
                  Ranking de la jornada
                </h2>
                <p className="liga-pantalla-ranking__hint">
                  {esParejasFijasPlayoffs
                    ? "Puntos por games totales: Diff ≥2 → 3/0 · Diff 1 → 2/1 · Empate + STB → 2/1 · WO → 3/−1."
                    : "Puntos: 3 si gana en 2 sets, 2 si gana en super tie-break, 0 si pierde."}
                </p>
                {jornadaStats.rankingParejas.length === 0 ? (
                  <p className="liga-pantalla__loading">Sin parejas en jornada.</p>
                ) : (
                  <div className="liga-pantalla-ranking__scroll">
                    <table className="liga-pantalla-ranking__table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Pareja</th>
                          <th title="Partido ganado">PG</th>
                          <th title="Partido perdido">PP</th>
                          <th title="Puntos de la jornada">PTS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jornadaStats.rankingParejas.map((row) => {
                          const pareja = jornada.parejas?.find(
                            (p) => p.id === row.parejaId
                          );
                          const label = pareja
                            ? formatJornadaParejaNombre(pareja, equiposById)
                            : row.nombre;
                          return (
                            <tr
                              key={row.parejaId}
                              className={
                                row.victorias > 0
                                  ? "liga-pantalla-ranking-winner"
                                  : row.posicion <= 3
                                    ? "liga-pantalla-ranking-top"
                                    : undefined
                              }
                            >
                              <td className="liga-pantalla-ranking__rank">
                                {row.posicion}
                              </td>
                              <td className="liga-pantalla-ranking__name">
                                {label}
                              </td>
                              <td className="liga-pantalla-ranking__stat">
                                {row.victorias}
                              </td>
                              <td className="liga-pantalla-ranking__stat">
                                {row.derrotas}
                              </td>
                              <td className="liga-pantalla-ranking__pts">
                                {row.puntos}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <>
            <h2 className="liga-pantalla-ranking__title">Puntos de la jornada</h2>
            <p className="liga-pantalla-ranking__hint">
              Games anotados en esta jornada (por jugador)
            </p>
            {jornadaStats.rankingJugadores.length === 0 ? (
              <p className="liga-pantalla__loading">Sin resultados aún.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Jugador</th>
                    <th>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {jornadaStats.rankingJugadores.map((row) => (
                    <tr
                      key={row.jugadorId}
                      className={
                        row.posicion <= 3 ? "liga-pantalla-ranking-top" : undefined
                      }
                    >
                      <td>{row.posicion}</td>
                      <td>{row.nombre}</td>
                      <td>{row.puntos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {jornadaStats.rankingParejas.length > 0 && (
              <>
                <h3 className="liga-pantalla-ranking__subtitle">Parejas</h3>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Pareja</th>
                      <th>V</th>
                      <th>Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jornadaStats.rankingParejas.map((row) => (
                      <tr
                        key={row.parejaId}
                        className={
                          row.parejaId === jornadaStats.ganadorPareja?.parejaId
                            ? "liga-pantalla-ranking-winner"
                            : row.posicion <= 3
                              ? "liga-pantalla-ranking-top"
                              : undefined
                        }
                      >
                        <td>{row.posicion}</td>
                        <td>{row.nombre}</td>
                        <td>{row.victorias}</td>
                        <td>{row.puntos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
              </>
            )}
          </aside>
        </div>

        <footer className="liga-pantalla__footer">
          Actualización automática
          {lastRefresh
            ? ` · ${lastRefresh.toLocaleTimeString("es-MX", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}`
            : ""}
        </footer>
      </PublicModeShell>
    </div>
    </ClubExperienceScope>
  );
};
