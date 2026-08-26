import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  LigaDetalle,
  LigaEquipoRankingItem,
  LigaJornada,
  RankingItem,
} from "../../lib/liga/types";
import { isEquiposModalidad } from "../../lib/liga/ligaModalidad";
import { ligaModalidadLabel } from "../../lib/liga/types";
import {
  listJornadaPublicMatches,
} from "../../lib/liga/publicDisplay";
import { formatFechaLegible, dateInputValue } from "../../lib/liga/programacion";
import { LIGA_PUBLIC_POLL_INTERVAL_MS } from "../../lib/liga/publicPoll";
import { resolveLigaJugadorPublicFotos } from "../../lib/liga/publicParejaAvatars";
import {
  getLigaById,
  getRanking,
  getRankingEquipos,
  publicLigaJornadaUrl,
} from "../../services/ligaService";
import { ClubExperienceScope, PublicClubModeEyebrow, PublicEventBrandIdentity, PublicEventNeutralLoading, PublicScopedBrandGate, useClubExperience, useOrganizerDisplayName } from "../../club-experience";
import { isPubDsV2Enabled } from "../../config/peds";
import { useLigaRealtime } from "../../hooks/useLigaRealtime";
import { useVisiblePolling } from "../../hooks/useVisiblePolling";
import { PublicModeShell } from "../platform/PublicModeShell";
import { StatusBadge } from "../platform/StatusBadge";
import { PublicHero } from "../public/peds";
import { LigaPublicParejasStandings } from "./LigaPublicParejasStandings";
import "./liga-public-pantalla.css";
import "../jugadores/riviera-jugadores.css";

function estadoLigaBadgeVariant(
  estado: LigaDetalle["estado"]
): "live" | "muted" | "pending" {
  if (estado === "in_progress") return "live";
  if (estado === "completed") return "muted";
  return "pending";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
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
    void resolveLigaJugadorPublicFotos(organizadorId, entries).then((fotos) => {
      if (!cancelled) setParejaFotos(fotos);
    });

    return () => {
      cancelled = true;
    };
  }, [detalle?.organizador_id, detalle?.modalidad, detalle?.equipos]);

  const rankingParejasPublicas = useMemo(() => {
    if (!detalle || !isEquiposModalidad(detalle.modalidad)) return [];
    const byId = new Map(detalle.equipos.map((e) => [e.id, e]));
    return rankingEquipos.map((ranking) => {
      const equipo = byId.get(ranking.equipo_id);
      return {
        ranking,
        equipo,
        foto1: equipo ? parejaFotos[equipo.jugador1_id] ?? null : null,
        foto2: equipo ? parejaFotos[equipo.jugador2_id] ?? null : null,
      };
    });
  }, [detalle, rankingEquipos, parejaFotos]);

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
    ? rankingEquipos.slice(0, 3)
    : ranking.slice(0, 3);

  const podioOrdenVisual = esParejasFijas
    ? [podio[1], podio[0], podio[2]].filter(
        (row): row is LigaEquipoRankingItem => row != null
      )
    : [podio[1], podio[0], podio[2]].filter(
        (row): row is RankingItem => row != null
      );

  return (
    <ClubExperienceScope
      organizadorId={detalle.organizador_id}
      pendingUntilOrganizador
    >
    <PublicScopedBrandGate message="Cargando liga…">
    <div
      className={`liga-pantalla App--public-full-width ro-public-view ro-surface-dark${
        esParejasFijas ? " liga-pantalla--liga-fijas" : ""
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
            categoria={ligaModalidadLabel(detalle.modalidad)}
            meta="Liga"
          />
        ) : (
          <header className="liga-pantalla__header">
            <PublicClubModeEyebrow modeLabel="Liga" />
            <h1 className="liga-pantalla__title">{detalle.nombre}</h1>
            <p className="liga-pantalla__subtitle">
              {ligaModalidadLabel(detalle.modalidad)} · {estadoLigaLabel(detalle.estado)} ·{" "}
              {esParejasFijas
                ? `${detalle.equipos.length} parejas`
                : `${detalle.inscripciones.length} jugadores`}{" "}
              · {detalle.jornadas.length} jornadas
            </p>
          </header>
        )}

        <div
          className={`liga-pantalla__layout liga-pantalla__layout--liga${
            esParejasFijas ? " liga-pantalla__layout--parejas" : ""
          }`}
        >
          <section
            className={`liga-pantalla-ranking liga-pantalla-ranking--wide${
              esParejasFijas ? " liga-pantalla-ranking--parejas" : ""
            }`}
          >
            <h2 className="liga-pantalla-ranking__title">
              {esParejasFijas ? "Ranking por pareja" : "Ranking acumulado"}
            </h2>
            {esParejasFijas ? (
              <LigaPublicParejasStandings rows={rankingParejasPublicas} />
            ) : ranking.length === 0 ? (
              <p className="liga-pantalla__loading">Sin puntos aún.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Jugador</th>
                    <th>Pts</th>
                    <th>Jorn.</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((row) => (
                    <tr
                      key={row.jugador_id}
                      className={
                        row.posicion === 1
                          ? "liga-pantalla-ranking-top"
                          : undefined
                      }
                    >
                      <td className="liga-pantalla-ranking__rank">{row.posicion}</td>
                      <td className="liga-pantalla-ranking__name">{row.nombre}</td>
                      <td className="liga-pantalla-ranking__pts">{row.puntos}</td>
                      <td className="liga-pantalla-ranking__meta">
                        {row.jornadas_jugadas}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section
            id="programa-juego"
            className={`liga-pantalla-jornadas${
              esParejasFijas ? " liga-pantalla-jornadas--parejas" : ""
            }`}
          >
            <h2 className="liga-pantalla-jornadas__title">
              {esParejasFijas ? "Programa de juego" : "Jornadas"}
            </h2>
            {detalle.jornadas.length === 0 ? (
              <p className="liga-pantalla__loading">
                El calendario se publicará pronto.
              </p>
            ) : (
              <div
                className={`liga-pantalla-jornadas__grid${
                  esParejasFijas ? " liga-pantalla-jornadas__grid--parejas" : ""
                }`}
              >
                {detalle.jornadas.map((j) => {
                  const tienePantalla = (j.partidos?.length ?? 0) > 0;
                  const esActiva = jornadaActiva?.id === j.id;
                  const matchups = listJornadaPublicMatches(
                    j,
                    detalle.equipos,
                    esParejasFijas
                  );
                  return (
                    <article
                      key={j.id}
                      className={`liga-pantalla-jornada-card${
                        esActiva ? " liga-pantalla-jornada-card--live" : ""
                      }`}
                    >
                      <div className="liga-pantalla-jornada-card__head">
                        <h3 className="liga-pantalla-jornada-card__num">
                          Jornada {j.numero}
                          {j.fecha ? (
                            <span className="liga-pantalla-jornada-card__fecha">
                              {" "}
                              · {formatFechaLegible(dateInputValue(j.fecha))}
                            </span>
                          ) : null}
                        </h3>
                        <span className={jornadaBadgeClass(j.estado)}>
                          {jornadaBadgeLabel(j.estado)}
                        </span>
                      </div>
                      <div className="liga-pantalla-jornada-card__body">
                        {matchups.length === 0 ? (
                          <p className="liga-pantalla-jornada-card__hint">
                            Partidos pendientes de iniciar
                          </p>
                        ) : esParejasFijas ? (
                          <ul className="liga-pantalla-matchups">
                            {matchups.map((m) => (
                              <li key={m.id} className="liga-pantalla-matchup">
                                <span className="liga-pantalla-matchup__team">
                                  {m.local}
                                </span>
                                {m.visitante ? (
                                  <>
                                    <span
                                      className="liga-pantalla-matchup__vs"
                                      aria-hidden
                                    >
                                      vs
                                    </span>
                                    <span className="liga-pantalla-matchup__team">
                                      {m.visitante}
                                    </span>
                                  </>
                                ) : null}
                                {m.score ? (
                                  <span className="liga-pantalla-matchup__score">
                                    {m.score}
                                  </span>
                                ) : null}
                                {m.programacion ? (
                                  <span className="liga-pantalla-matchup__meta">
                                    {m.programacion}
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="liga-pantalla-parejas liga-pantalla-parejas--card">
                            {matchups.map((m) => (
                              <span key={m.id} className="liga-pantalla-pareja">
                                {m.local}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {tienePantalla ? (
                        <a
                          href={publicLigaJornadaUrl(ligaId, j.numero)}
                          className="liga-pantalla-jornada-card__link"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Ver resultados →
                        </a>
                      ) : null}
                    </article>
                  );
                })}
              </div>
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
