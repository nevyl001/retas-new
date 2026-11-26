import React, { useEffect, useState } from "react";
import type { FlexPointsPoint } from "../../../lib/liga/flex/publicView";
import { isPhotographicSplitVsFoto } from "../jornada-public/ligaJornadaMatchNames";

export function useFlexPublicTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

export function FlexFace({
  name,
  foto,
  large = false,
}: {
  name: string;
  foto: string | null;
  large?: boolean;
}) {
  const letter = (name.trim().slice(0, 1) || "J").toUpperCase();
  if (foto) {
    return (
      <img
        className={large ? "flex-pub__face flex-pub__face--large" : "flex-pub__face"}
        src={foto}
        alt=""
      />
    );
  }
  return (
    <span className={large ? "flex-pub__face flex-pub__face--large flex-pub__face--letter" : "flex-pub__face flex-pub__face--letter"} aria-hidden>
      {letter}
    </span>
  );
}

export function movementLabel(delta: number | null | undefined): string {
  if (delta == null || delta === 0) return "—";
  return delta > 0 ? `↑ ${delta}` : `↓ ${Math.abs(delta)}`;
}

export function FlexPointsChart({ points }: { points: FlexPointsPoint[] }) {
  if (points.length === 0) return null;
  const width = 320;
  const height = 128;
  const max = Math.max(...points.map((point) => point.acumulado), 1);
  const coords = points.map((point, index) => {
    const x =
      points.length === 1 ? width / 2 : (index / (points.length - 1)) * (width - 20) + 10;
    const y = height - 16 - (point.acumulado / max) * (height - 32);
    return { ...point, x, y };
  });
  const path = coords
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
  return (
    <svg
      className="flex-pub__chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Evolución de puntos acumulados"
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
      {coords.map((point) => (
        <circle key={point.jornadaNumero} cx={point.x} cy={point.y} r="3.5" fill="currentColor" />
      ))}
    </svg>
  );
}

function playerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "J";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase();
}

export const FlexNeutralAvatar: React.FC<{
  name: string;
  fotoUrl?: string | null;
  variant: "participant" | "match" | "table" | "close";
}> = ({ name, fotoUrl, variant }) => {
  const candidate = isPhotographicSplitVsFoto(fotoUrl) ? fotoUrl!.trim() : null;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [candidate]);

  const showImg = Boolean(candidate) && !failed;

  return (
    <span className={`flex-pub-avatar flex-pub-avatar--${variant}`} aria-hidden>
      {showImg ? (
        <img
          className="flex-pub-avatar__img"
          src={candidate!}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="flex-pub-avatar__initials">{playerInitials(name)}</span>
      )}
    </span>
  );
};

export function fechaCorta(fecha: string | null | undefined): string {
  if (!fecha) return "Por programar";
  const [year, month, day] = fecha.split("-").map(Number);
  if (!year || !month || !day) return "Por programar";
  return new Date(year, month - 1, day).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
}

export function horarioFlex(inicio: string | null | undefined, fin: string | null | undefined): string {
  const hours = [inicio, fin].filter(Boolean).join(" – ");
  return hours || "Hora por definir";
}
