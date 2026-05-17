import React from "react";

export function GrupoBadge({
  nombre,
  orden,
}: {
  nombre: string;
  orden: number;
}) {
  const idx = orden % 5;
  return (
    <span className={`te-grupo-badge te-grupo-badge--${idx}`}>{nombre}</span>
  );
}
