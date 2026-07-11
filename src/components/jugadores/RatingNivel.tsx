import React, { useMemo } from "react";
import type { RatingHistorialEntry } from "../../lib/rivieraJugadores/types";

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
): { label: string; color: string } | null {
  if (partidosJugados === 0) {
    return { label: "INICIAL", color: "rgba(255, 255, 255, 0.55)" };
  }
  if (fiabilidad >= 0.7) return { label: "FIABLE", color: "#34d399" };
  if (fiabilidad >= 0.4) return { label: "MEDIA", color: "#fbbf24" };
  return { label: "CALIBRANDO", color: "#fbbf24" };
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
    const w = 280;
    const h = density === "compact" ? 36 : 48;
    const pad = 4;
    const min = Math.min(...evolutionPoints) - 0.05;
    const max = Math.max(...evolutionPoints) + 0.05;
    const span = max - min || 0.1;
    const coords = evolutionPoints.map((val, i) => {
      const x = pad + (i / (evolutionPoints.length - 1)) * (w - pad * 2);
      const y = h - pad - ((val - min) / span) * (h - pad * 2);
      return `${x},${y}`;
    });
    return { w, h, polyline: coords.join(" ") };
  }, [evolutionPoints, density]);

  const isCompactStandalone =
    layout === "standalone" && density === "compact";

  const cardStyle: React.CSSProperties | undefined =
    layout === "embedded"
      ? {
          marginTop: "0.85rem",
          padding: "1rem 1.1rem",
          borderRadius: "14px",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          background: "rgba(255, 255, 255, 0.04)",
          width: "100%",
          boxSizing: "border-box",
        }
      : undefined;

  const movementLimit = isCompactStandalone ? 4 : historial.length;
  const visibleHistorial = historial.slice(0, movementLimit);

  return (
    <section
      className={[
        layout === "standalone" ? "rjp-ficha-rating__inner" : "",
        isCompactStandalone ? "rjp-rating-nivel--compact" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={cardStyle}
      aria-label="Nivel de juego"
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "0.75rem",
          marginBottom: "0.5rem",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontSize: "0.62rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "rgba(255, 255, 255, 0.45)",
            }}
          >
            Nivel
          </p>
          <p
            style={{
              margin: "0.15rem 0 0",
              fontSize: "1.75rem",
              fontWeight: 800,
              lineHeight: 1,
              color: "#a3e635",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {ratingLabel}
          </p>
        </div>
        {badge ? (
          <span
            style={{
              fontSize: "0.65rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: badge.color,
              padding: "0.28rem 0.55rem",
              borderRadius: "999px",
              border: `1px solid ${badge.color}55`,
              background: `${badge.color}18`,
            }}
          >
            {badge.label}
          </span>
        ) : null}
      </div>

      <p
        style={{
          margin: "0 0 0.75rem",
          fontSize: "0.78rem",
          color: "rgba(255, 255, 255, 0.55)",
        }}
      >
        {partidosJugados === 0
          ? "Nivel base 3.00 · aún sin partidos de rating"
          : `Fiabilidad del nivel: ${fiabPct}% · ${partidosJugados} partido${
              partidosJugados === 1 ? "" : "s"
            }`}
      </p>

      {evolutionSvg ? (
        <svg
          width="100%"
          height={evolutionSvg.h}
          viewBox={`0 0 ${evolutionSvg.w} ${evolutionSvg.h}`}
          style={{ display: "block", marginBottom: "0.85rem" }}
          aria-hidden
        >
          <polyline
            fill="none"
            stroke="#a3e635"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={evolutionSvg.polyline}
          />
        </svg>
      ) : partidosJugados === 0 ? (
        <p
          style={{
            margin: "0 0 0.85rem",
            fontSize: "0.8rem",
            lineHeight: 1.45,
            color: "rgba(255, 255, 255, 0.42)",
            fontStyle: "italic",
          }}
        >
          Juega tu primer partido competitivo para empezar a mover tu nivel
        </p>
      ) : null}

      {visibleHistorial.length > 0 ? (
        <div>
          <p
            style={{
              margin: "0 0 0.5rem",
              fontSize: "0.62rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "rgba(255, 255, 255, 0.4)",
            }}
          >
            Últimos movimientos
          </p>
          <ul
            className={isCompactStandalone ? "rjp-rating-nivel__moves" : undefined}
            style={
              isCompactStandalone
                ? undefined
                : {
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.45rem",
                  }
            }
          >
            {visibleHistorial.map((item) => {
              const up = item.delta >= 0;
              const deltaColor = up ? "#34d399" : "#f87171";
              const arrow = up ? "▲" : "▼";
              const deltaSign = up ? "+" : "";
              return (
                <li
                  key={item.id}
                  className={
                    isCompactStandalone ? "rjp-rating-nivel__move" : undefined
                  }
                  style={
                    isCompactStandalone
                      ? undefined
                      : {
                          display: "grid",
                          gridTemplateColumns: "auto 1fr auto auto",
                          gap: "0.5rem",
                          alignItems: "center",
                          fontSize: "0.78rem",
                          color: "rgba(255, 255, 255, 0.82)",
                        }
                  }
                >
                  <span style={{ color: deltaColor, fontWeight: 700, minWidth: "3.5rem" }}>
                    {arrow} {deltaSign}
                    {item.delta.toFixed(2)}
                  </span>
                  <span style={{ color: "rgba(255, 255, 255, 0.65)" }}>
                    {modoJuegoLabel(item.modo_juego)}
                  </span>
                  <span
                    style={{
                      color: "#a3e635",
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {item.rating_despues.toFixed(2)}
                  </span>
                  <span style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: "0.72rem" }}>
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
