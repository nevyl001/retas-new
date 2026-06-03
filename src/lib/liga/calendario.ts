import type { LigaDetalle } from "./types";

export function validateInscripcionesParaCalendario(count: number): void {
  if (count < 4) {
    throw new Error(
      "Se necesitan al menos 4 jugadores inscritos (cantidad par)."
    );
  }
  if (count % 2 !== 0) {
    throw new Error(
      `La cantidad de inscritos debe ser par (actualmente hay ${count}).`
    );
  }
}

/** Inscritos actuales ≠ jugadores del calendario generado. */
export function calendarioDesactualizado(detalle: LigaDetalle): boolean {
  if (detalle.estado === "upcoming" || detalle.jornadas.length === 0) {
    return false;
  }
  const inscritos = new Set(detalle.inscripciones.map((i) => i.jugador_id));
  const enCalendario = new Set<string>();
  for (const j of detalle.jornadas) {
    for (const p of j.parejas ?? []) {
      enCalendario.add(p.jugador1_id);
      enCalendario.add(p.jugador2_id);
    }
  }
  if (inscritos.size !== enCalendario.size) return true;
  for (const id of Array.from(inscritos)) {
    if (!enCalendario.has(id)) return true;
  }
  return false;
}

export function tieneJornadasEnCurso(detalle: LigaDetalle): boolean {
  return detalle.jornadas.some(
    (j) => j.estado === "in_progress" || j.estado === "completed"
  );
}
