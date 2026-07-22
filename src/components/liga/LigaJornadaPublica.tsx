import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeJornadaPublicStats } from "../../lib/liga/jornadaStats";
import {
  buildVictoriaRankLabel,
  findPartidoGanadoPareja,
  statsParejaJornadaVictoria,
} from "../../lib/liga/jornadaCelebrate";
import {
  formatJornadaParejaNombre,
  formatPartidoPublicScore,
  partidoMatchWinnerSide,
} from "../../lib/liga/publicDisplay";
import { formatPartidoCanchaHorarioLabel } from "../../lib/liga/programacion";
import type { LigaDetalle, LigaJornada, LigaJornadaPareja, LigaPartido } from "../../lib/liga/types";
import { LIGA_PUBLIC_POLL_INTERVAL_MS } from "../../lib/liga/publicPoll";
import {
  resolvePlayerPublicProfiles,
  type PlayerPublicProfile,
} from "../../lib/rivieraJugadores/publicPlayerAvatars";
import { getLigaById } from "../../services/ligaService";
import { ClubExperienceScope, PublicClubModeEyebrow, PublicEventBrandIdentity, useClubExperience, useOrganizerDisplayName } from "../../club-experience";
import { isPubDsV2Enabled } from "../../config/peds";
import { useVisiblePolling } from "../../hooks/useVisiblePolling";
import type { PublicRetaWinnerAvatar } from "../public/PublicRetaWinnerSection";
import { PublicModeShell } from "../platform/PublicModeShell";
import { StatusBadge } from "../platform/StatusBadge";
import { PublicHero } from "../public/peds";
import { LigaParejaVictoriaCelebrate } from "./LigaParejaVictoriaCelebrate";
import "./liga-pareja-victoria-celebrate.css";
import "./liga-public-pantalla.css";

function jornadaEstadoLabel(estado: LigaJornada["estado"]): string {
  if (estado === "completed") return "Finalizada";
  if (estado === "in_progress") return "En curso";
  return "Próxima";
}

function jornadaEstadoBadgeVariant(
  estado: LigaJornada["estado"]
): "live" | "gold" | "pending" {
  if (estado === "in_progress") return "live";
  if (estado === "completed") return "gold";
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

function parejaNombre(
  parejaId: string,
  jornada: LigaJornada | undefined,
  equiposById: Map<string, LigaDetalle["equipos"][number]>
): string {
  const p = jornada?.parejas?.find((x) => x.id === parejaId);
  if (!p) return "—";
  return formatJornadaParejaNombre(p, equiposById);
}

function rondaLabel(estado: string): string {
  if (estado === "live") return "En curso";
  if (estado === "done") return "Completada";
  return "Pendiente";
}

function scoreDisplay(
  partido: LigaPartido,
  esParejasFijas: boolean
): { s1: string; s2: string; setsLabel: string | null } {
  if (partido.estado !== "completed") {
    return { s1: "—", s2: "—", setsLabel: null };
  }

  const setsLabel = esParejasFijas
    ? formatPartidoPublicScore(partido, true)
    : null;

  return {
    s1: String(partido.score_pareja1 ?? 0),
    s2: String(partido.score_pareja2 ?? 0),
    setsLabel,
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
  const [playerProfiles, setPlayerProfiles] = useState<
    Record<string, PlayerPublicProfile>
  >({});
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
      const d = await getLigaById(ligaId);
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

  const jornada = useMemo(
    () => detalle?.jornadas.find((j) => j.numero === numero),
    [detalle, numero]
  );

  useEffect(() => {
    const organizadorId = detalle?.organizador_id;
    const parejas = jornada?.parejas;
    if (!organizadorId || !parejas?.length) {
      setPlayerProfiles({});
      return;
    }

    const entries = parejas.flatMap((p) => {
      const list: { id: string; name: string }[] = [];
      if (p.jugador1) {
        list.push({ id: p.jugador1_id, name: p.jugador1.nombre });
      }
      if (p.jugador2) {
        list.push({ id: p.jugador2_id, name: p.jugador2.nombre });
      }
      return list;
    });

    let cancelled = false;
    void resolvePlayerPublicProfiles(organizadorId, entries, {
      publicOnly: true,
    }).then((profiles) => {
      if (!cancelled) setPlayerProfiles(profiles);
    });

    return () => {
      cancelled = true;
    };
  }, [detalle?.organizador_id, jornada?.parejas]);

  const partidosJornadaOrdenados = useMemo(
    () =>
      [...(jornada?.partidos ?? [])].sort(
        (a, b) => (a.cancha ?? 0) - (b.cancha ?? 0)
      ),
    [jornada]
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

  const esParejasFijas = detalle?.modalidad === "parejas_fijas";

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
        fotoUrl: playerProfiles[pareja.jugador1_id]?.fotoUrl,
      },
      {
        name: pareja.jugador2?.nombre ?? "?",
        jugadorId: pareja.jugador2_id,
        fotoUrl: playerProfiles[pareja.jugador2_id]?.fotoUrl,
      },
    ];
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

  const nombrePareja = (parejaId: string) =>
    parejaNombre(parejaId, jornada, equiposById);

  const jornadaEstadoText = jornadaEstadoLabel(jornada.estado);
  const jornadaFechaText = formatJornadaFechaPublica(jornada.fecha);

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
            meta="Liga"
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

        <div
          className={`liga-pantalla-parejas${
            esParejasFijas ? " liga-pantalla-parejas--center" : ""
          }`}
        >
          {(jornada.parejas ?? []).map((p) => (
            <span key={p.id} className="liga-pantalla-pareja">
              {formatJornadaParejaNombre(p, equiposById)}
            </span>
          ))}
        </div>

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

        {esParejasFijas && parejasGanadorasJornada.length > 0 && (
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
            {partidosJornadaOrdenados.length === 0 ? (
              <p className="liga-pantalla__loading">
                Los partidos aparecerán cuando se inicie la jornada.
              </p>
            ) : esParejasFijas ? (
              <div className="liga-pantalla-ronda__matches liga-pantalla-ronda__matches--jornada">
                {partidosJornadaOrdenados.map((partido) => {
                  const { setsLabel } = scoreDisplay(partido, true);
                  const pending = partido.estado !== "completed";
                  const winner = partidoMatchWinnerSide(partido, true);
                  const p1Wins = winner === 1;
                  const p2Wins = winner === 2;

                  return (
                    <article key={partido.id} className="liga-pantalla-match">
                      <header className="liga-pantalla-match__head">
                        {formatPartidoCanchaHorarioLabel(
                          partido.cancha,
                          partido.hora_inicio,
                          jornada.fecha
                        ) || `Cancha ${partido.cancha ?? "?"}`}
                      </header>
                      <div className="liga-pantalla-match__board">
                        <div
                          className={`liga-pantalla-match__row${
                            p1Wins ? " liga-pantalla-match__row--win" : ""
                          }`}
                        >
                          <span className="liga-pantalla-match__name">
                            {nombrePareja(partido.pareja1_id)}
                          </span>
                        </div>
                        {setsLabel ? (
                          <p className="liga-pantalla-match__sets">{setsLabel}</p>
                        ) : (
                          <p className="liga-pantalla-match__vs">vs</p>
                        )}
                        <div
                          className={`liga-pantalla-match__row${
                            p2Wins ? " liga-pantalla-match__row--win" : ""
                          }`}
                        >
                          <span className="liga-pantalla-match__name">
                            {nombrePareja(partido.pareja2_id)}
                          </span>
                        </div>
                        {pending && !setsLabel ? (
                          <p className="liga-pantalla-match__pending">Pendiente</p>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
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
                        const { s1, s2, setsLabel } = scoreDisplay(
                          partido,
                          esParejasFijas
                        );
                        const pending = partido.estado !== "completed";
                        const winner = partidoMatchWinnerSide(
                          partido,
                          esParejasFijas
                        );
                        const p1Wins = winner === 1;
                        const p2Wins = winner === 2;

                        return (
                          <article
                            key={partido.id}
                            className="liga-pantalla-match"
                          >
                            <header className="liga-pantalla-match__head">
                              {formatPartidoCanchaHorarioLabel(
                                partido.cancha,
                                partido.hora_inicio,
                                jornada.fecha
                              ) || `Cancha ${partido.cancha ?? "?"}`}
                            </header>
                            <div className="liga-pantalla-match__board">
                              <div
                                className={`liga-pantalla-match__row${
                                  p1Wins ? " liga-pantalla-match__row--win" : ""
                                }`}
                              >
                                <span className="liga-pantalla-match__name">
                                  {nombrePareja(partido.pareja1_id)}
                                </span>
                                {!esParejasFijas || !setsLabel ? (
                                  <span
                                    className={`liga-pantalla-match__pts${
                                      pending
                                        ? " liga-pantalla-match__pts--pending"
                                        : ""
                                    }`}
                                  >
                                    {s1}
                                  </span>
                                ) : null}
                              </div>
                              {esParejasFijas && setsLabel ? (
                                <p className="liga-pantalla-match__sets">{setsLabel}</p>
                              ) : (
                                <p className="liga-pantalla-match__vs">vs</p>
                              )}
                              <div
                                className={`liga-pantalla-match__row${
                                  p2Wins ? " liga-pantalla-match__row--win" : ""
                                }`}
                              >
                                <span className="liga-pantalla-match__name">
                                  {nombrePareja(partido.pareja2_id)}
                                </span>
                                {!esParejasFijas || !setsLabel ? (
                                  <span
                                    className={`liga-pantalla-match__pts${
                                      pending
                                        ? " liga-pantalla-match__pts--pending"
                                        : ""
                                    }`}
                                  >
                                    {s2}
                                  </span>
                                ) : null}
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
                  Puntos: 3 si gana en 2 sets, 2 si gana en super tie-break, 0 si pierde.
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
