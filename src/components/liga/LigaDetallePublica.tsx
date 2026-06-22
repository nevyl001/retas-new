import React, { useCallback, useEffect, useState } from "react";
import type { LigaDetalle, LigaJornada } from "../../lib/liga/types";
import type { RankingItem } from "../../lib/liga/types";
import {
  getLigaById,
  getRanking,
  publicLigaJornadaUrl,
} from "../../services/ligaService";
import "./liga-public-pantalla.css";

const POLL_MS = 15_000;

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, r] = await Promise.all([
        getLigaById(ligaId),
        getRanking(ligaId),
      ]);
      setDetalle(d);
      setRanking(r);
      setLastRefresh(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Liga no encontrada");
    } finally {
      setLoading(false);
    }
  }, [ligaId]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  if (loading && !detalle) {
    return (
      <div className="liga-pantalla App--public-full-width ro-public-view">
        <div className="liga-pantalla__grain" aria-hidden />
        <div className="liga-pantalla__inner">
          <p className="liga-pantalla__loading">Cargando liga…</p>
        </div>
      </div>
    );
  }

  if (!detalle) {
    return (
      <div className="liga-pantalla App--public-full-width ro-public-view">
        <div className="liga-pantalla__grain" aria-hidden />
        <div className="liga-pantalla__inner">
          <p className="liga-pantalla__error">{error ?? "No disponible"}</p>
        </div>
      </div>
    );
  }

  const jornadaActiva = detalle.jornadas.find((j) => j.estado === "in_progress");

  const todasJornadasCompletas =
    detalle.jornadas.length > 0 &&
    detalle.jornadas.every((j) => j.estado === "completed");

  const ligaTerminada =
    detalle.estado === "completed" || todasJornadasCompletas;

  const podio = ranking.slice(0, 3);

  const podioOrdenVisual = [
    podio[1],
    podio[0],
    podio[2],
  ].filter((row): row is RankingItem => row != null);

  return (
    <div className="liga-pantalla App--public-full-width ro-public-view">
      <div className="liga-pantalla__grain" aria-hidden />
      <div className="liga-pantalla__inner">
        <header className="liga-pantalla__header">
          <p className="liga-pantalla__eyebrow">Riviera Open · Liga</p>
          <h1 className="liga-pantalla__title">{detalle.nombre}</h1>
          <p className="liga-pantalla__subtitle">
            {estadoLigaLabel(detalle.estado)} · {detalle.inscripciones.length}{" "}
            jugadores · {detalle.jornadas.length} jornadas
          </p>
        </header>

        <div className="liga-pantalla__layout liga-pantalla__layout--liga">
          <section className="liga-pantalla-ranking liga-pantalla-ranking--wide">
            <h2 className="liga-pantalla-ranking__title">Ranking acumulado</h2>
            {ranking.length === 0 ? (
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

          <section className="liga-pantalla-jornadas">
            <h2 className="liga-pantalla-jornadas__title">Jornadas</h2>
            {detalle.jornadas.length === 0 ? (
              <p className="liga-pantalla__loading">
                El calendario se publicará pronto.
              </p>
            ) : (
              <div className="liga-pantalla-jornadas__grid">
                {detalle.jornadas.map((j) => {
                  const tienePantalla = (j.partidos?.length ?? 0) > 0;
                  const esActiva = jornadaActiva?.id === j.id;
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
                        </h3>
                        <span className={jornadaBadgeClass(j.estado)}>
                          {jornadaBadgeLabel(j.estado)}
                        </span>
                      </div>
                      <div className="liga-pantalla-parejas liga-pantalla-parejas--card">
                        {(j.parejas ?? []).map((p) => (
                          <span key={p.id} className="liga-pantalla-pareja">
                            {p.jugador1?.nombre ?? "?"} —{" "}
                            {p.jugador2?.nombre ?? "?"}
                          </span>
                        ))}
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
                      ) : (
                        <p className="liga-pantalla-jornada-card__hint">
                          Partidos pendientes de iniciar
                        </p>
                      )}
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
              {podioOrdenVisual.map((row) => {
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
      </div>
    </div>
  );
};
