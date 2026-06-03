import React, { useCallback, useEffect, useMemo, useState } from "react";
import { computeJornadaPublicStats } from "../../lib/liga/jornadaStats";
import type { LigaDetalle, LigaJornada, LigaPartido } from "../../lib/liga/types";
import { getLigaById } from "../../services/ligaService";
import "./liga-public-pantalla.css";

const POLL_MS = 12_000;

interface LigaJornadaPublicaProps {
  ligaId: string;
  numero: number;
}

function parejaNombre(
  parejaId: string,
  jornada: LigaJornada | undefined
): string {
  const p = jornada?.parejas?.find((x) => x.id === parejaId);
  if (!p) return "—";
  return `${p.jugador1?.nombre ?? "?"} / ${p.jugador2?.nombre ?? "?"}`;
}

function rondaLabel(estado: string): string {
  if (estado === "live") return "En curso";
  if (estado === "done") return "Completada";
  return "Pendiente";
}

function scoreDisplay(partido: LigaPartido): { s1: string; s2: string } {
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

  const load = useCallback(async () => {
    try {
      const d = await getLigaById(ligaId);
      setDetalle(d);
      setLastRefresh(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No disponible");
    } finally {
      setLoading(false);
    }
  }, [ligaId]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const jornada = useMemo(
    () => detalle?.jornadas.find((j) => j.numero === numero),
    [detalle, numero]
  );

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

  const jornadaStats = useMemo(
    () => computeJornadaPublicStats(jornada),
    [jornada]
  );

  const todosPartidosCompletos =
    (jornada?.partidos?.length ?? 0) > 0 &&
    jornada!.partidos!.every((p) => p.estado === "completed");

  if (loading && !detalle) {
    return (
      <div className="liga-pantalla App--public-full-width ro-public-view">
        <div className="liga-pantalla__grain" aria-hidden />
        <div className="liga-pantalla__inner">
          <p className="liga-pantalla__loading">Cargando jornada…</p>
        </div>
      </div>
    );
  }

  if (!detalle || !jornada) {
    return (
      <div className="liga-pantalla App--public-full-width ro-public-view">
        <div className="liga-pantalla__grain" aria-hidden />
        <div className="liga-pantalla__inner">
          <p className="liga-pantalla__error">{error ?? "Jornada no encontrada"}</p>
        </div>
      </div>
    );
  }

  const jornadaEstadoLabel =
    jornada.estado === "completed"
      ? "Finalizada"
      : jornada.estado === "in_progress"
        ? "En curso"
        : "Próxima";

  return (
    <div className="liga-pantalla App--public-full-width ro-public-view">
      <div className="liga-pantalla__grain" aria-hidden />
      <div className="liga-pantalla__inner">
        <header className="liga-pantalla__header">
          <p className="liga-pantalla__eyebrow">Riviera Open · Liga</p>
          <h1 className="liga-pantalla__title">{detalle.nombre}</h1>
          <p className="liga-pantalla__subtitle">
            Jornada {numero} · {jornadaEstadoLabel}
          </p>
        </header>

        <div className="liga-pantalla-parejas">
          {(jornada.parejas ?? []).map((p) => (
            <span key={p.id} className="liga-pantalla-pareja">
              {p.jugador1?.nombre ?? "?"} / {p.jugador2?.nombre ?? "?"}
            </span>
          ))}
        </div>

        {todosPartidosCompletos && jornadaStats.ganadorPareja && (
          <div className="liga-pantalla-winner" role="status">
            <p className="liga-pantalla-winner__eyebrow">¡Felicidades!</p>
            <p className="liga-pantalla-winner__title">
              {jornadaStats.ganadorPareja.nombre}
            </p>
            <p className="liga-pantalla-winner__meta">
              Pareja ganadora de la jornada · {jornadaStats.ganadorPareja.victorias}{" "}
              {jornadaStats.ganadorPareja.victorias === 1 ? "victoria" : "victorias"} ·{" "}
              {jornadaStats.ganadorPareja.puntos} pts en games
            </p>
          </div>
        )}

        <div className="liga-pantalla__layout">
          <div className="liga-pantalla__rondas">
            {partidosByRonda.length === 0 ? (
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
                      estado === "live" ? " liga-pantalla-ronda--live" : ""
                    }`}
                  >
                    <div className="liga-pantalla-ronda__head">
                      <h2 className="liga-pantalla-ronda__title">Ronda {ronda}</h2>
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
                    <div className="liga-pantalla-ronda__matches">
                      {partidos.map((partido) => {
                        const { s1, s2 } = scoreDisplay(partido);
                        const pending = partido.estado !== "completed";
                        const n1 = pending ? null : Number(s1);
                        const n2 = pending ? null : Number(s2);
                        const p1Wins =
                          n1 != null && n2 != null && !Number.isNaN(n1) && n1 > n2;
                        const p2Wins =
                          n1 != null && n2 != null && !Number.isNaN(n2) && n2 > n1;

                        return (
                          <article
                            key={partido.id}
                            className="liga-pantalla-match"
                          >
                            <header className="liga-pantalla-match__head">
                              Cancha {partido.cancha ?? "?"}
                            </header>
                            <div className="liga-pantalla-match__board">
                              <div
                                className={`liga-pantalla-match__row${
                                  p1Wins ? " liga-pantalla-match__row--win" : ""
                                }`}
                              >
                                <span className="liga-pantalla-match__name">
                                  {parejaNombre(partido.pareja1_id, jornada)}
                                </span>
                                <span
                                  className={`liga-pantalla-match__pts${
                                    pending
                                      ? " liga-pantalla-match__pts--pending"
                                      : ""
                                  }`}
                                >
                                  {s1}
                                </span>
                              </div>
                              <p className="liga-pantalla-match__vs">vs</p>
                              <div
                                className={`liga-pantalla-match__row${
                                  p2Wins ? " liga-pantalla-match__row--win" : ""
                                }`}
                              >
                                <span className="liga-pantalla-match__name">
                                  {parejaNombre(partido.pareja2_id, jornada)}
                                </span>
                                <span
                                  className={`liga-pantalla-match__pts${
                                    pending
                                      ? " liga-pantalla-match__pts--pending"
                                      : ""
                                  }`}
                                >
                                  {s2}
                                </span>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })
            )}
          </div>

          <aside className="liga-pantalla-ranking">
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
      </div>
    </div>
  );
};
