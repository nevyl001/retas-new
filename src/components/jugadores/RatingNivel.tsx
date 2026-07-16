import React, { useMemo } from "react";
import type { RatingHistorialEntry } from "../../lib/rivieraJugadores/types";
import "./RatingNivel.css";

const MODO_JUEGO_LABELS: Record<string, string> = {
  reta_rr: "Round Robin",
  americano: "Americano",
  equipos: "Reta Equipos",
  duelo_2v2: "Duelo 2 vs 2",
  torneo: "Torneo",
};

function modoJuegoLabel(modo: string): string {
  return MODO_JUEGO_LABELS[modo] ?? modo.replace(/_/g, " ");
}

/** Indica qué tan confiable es el nivel, no si el jugador es bueno o malo. */
function fiabilidadBadge(
  fiabilidad: number,
  partidosJugados: number
): { label: string; tone: "inicial" | "fiable" | "media" | "calibrando" } | null {
  if (partidosJugados === 0) {
    return { label: "INICIAL", tone: "inicial" };
  }
  if (fiabilidad >= 0.7) return { label: "FIABLE", tone: "fiable" };
  if (fiabilidad >= 0.4) return { label: "MEDIA", tone: "media" };
  return { label: "CALIBRANDO", tone: "calibrando" };
}

function formatFechaCorta(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

interface RatingNivelProps {
  rating: number;
  fiabilidad: number;
  partidosJugados: number;
  historial?: RatingHistorialEntry[];
  /** standalone = fuera de la card del jugador */
  layout?: "embedded" | "standalone";
  density?: "default" | "compact";
}

export const RatingNivel: React.FC<RatingNivelProps> = ({
  rating,
  fiabilidad,
  partidosJugados,
  historial = [],
  layout = "embedded",
  density = "default",
}) => {
  const badge = fiabilidadBadge(fiabilidad, partidosJugados);
  const ratingLabel = rating.toFixed(2);
  const fiabPct = Math.round(fiabilidad * 100);

  const evolutionPoints = useMemo(() => {
    if (historial.length === 0) return [];
    return [...historial].reverse().map((h) => h.rating_despues);
  }, [historial]);

  const evolutionSvg = useMemo(() => {
    if (evolutionPoints.length < 2) return null;
    const w = 560;
    const h = density === "compact" ? 72 : 96;
    const padX = 8;
    const padY = 10;
    const min = Math.min(...evolutionPoints) - 0.05;
    const max = Math.max(...evolutionPoints) + 0.05;
    const span = max - min || 0.1;
    const coords = evolutionPoints.map((val, i) => {
      const x = padX + (i / (evolutionPoints.length - 1)) * (w - padX * 2);
      const y = h - padY - ((val - min) / span) * (h - padY * 2);
      return `${x},${y}`;
    });
    return { w, h, polyline: coords.join(" "), minLabel: min.toFixed(2), maxLabel: max.toFixed(2) };
  }, [evolutionPoints, density]);

  const isCompactStandalone =
    layout === "standalone" && density === "compact";

  const movementLimit = isCompactStandalone ? 5 : historial.length;
  const visibleHistorial = historial.slice(0, movementLimit);

  const rootClass = [
    "rjp-rating-nivel",
    layout === "standalone" ? "rjp-rating-nivel--standalone" : "rjp-rating-nivel--embedded",
    density === "compact" ? "rjp-rating-nivel--compact" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={rootClass} aria-label="Nivel de juego">
      <div className="rjp-rating-nivel__head">
        <div>
          <p className="rjp-rating-nivel__eyebrow">Mi nivel</p>
          <p className="rjp-rating-nivel__value">{ratingLabel}</p>
        </div>
        {badge ? (
          <span
            className={`rjp-rating-nivel__badge rjp-rating-nivel__badge--${badge.tone}`}
          >
            {badge.label}
          </span>
        ) : null}
      </div>

      <p className="rjp-rating-nivel__meta">
        {partidosJugados === 0
          ? "Nivel base 3.00 · aún sin partidos de rating"
          : `Fiabilidad del nivel: ${fiabPct}% · ${partidosJugados} partido${
              partidosJugados === 1 ? "" : "s"
            }`}
      </p>

      {evolutionSvg ? (
        <div className="rjp-rating-nivel__chart" aria-hidden>
          <svg
            width="100%"
            height={evolutionSvg.h}
            viewBox={`0 0 ${evolutionSvg.w} ${evolutionSvg.h}`}
            preserveAspectRatio="none"
          >
            <polyline
              className="rjp-rating-nivel__line"
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={evolutionSvg.polyline}
            />
          </svg>
        </div>
      ) : partidosJugados === 0 ? (
        <p className="rjp-rating-nivel__empty">
          Juega tu primer partido competitivo para empezar a mover tu nivel
        </p>
      ) : (
        <p className="rjp-rating-nivel__empty">
          Aún no hay suficientes movimientos para graficar la evolución
        </p>
      )}

      {visibleHistorial.length > 0 ? (
        <div className="rjp-rating-nivel__moves-wrap">
          <p className="rjp-rating-nivel__moves-title">Últimos movimientos</p>
          <ul className="rjp-rating-nivel__moves">
            {visibleHistorial.map((item) => {
              const up = item.delta >= 0;
              const deltaSign = up ? "+" : "";
              return (
                <li key={item.id} className="rjp-rating-nivel__move">
                  <span
                    className={`rjp-rating-nivel__delta${
                      up
                        ? " rjp-rating-nivel__delta--up"
                        : " rjp-rating-nivel__delta--down"
                    }`}
                  >
                    <span aria-hidden>{up ? "▲" : "▼"}</span>{" "}
                    <span className="rjp-rating-nivel__delta-sr">
                      {up ? "Subió" : "Bajó"}{" "}
                    </span>
                    {deltaSign}
                    {item.delta.toFixed(2)}
                  </span>
                  <span className="rjp-rating-nivel__modo">
                    {modoJuegoLabel(item.modo_juego)}
                  </span>
                  <span className="rjp-rating-nivel__after">
                    {item.rating_despues.toFixed(2)}
                  </span>
                  <span className="rjp-rating-nivel__date">
                    {formatFechaCorta(item.fecha)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
};
