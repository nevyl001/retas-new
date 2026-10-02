/**
 * Badge «En vivo» / «En juego» solo dentro de la ventana del horario programado.
 * Antes del inicio o fuera de la ventana → pendiente.
 */

/** Ventana por defecto tras `programado_en` (cubre slot típico 45–60 min + margen). */
export const DEFAULT_PARTIDO_EN_VIVO_DURATION_MINUTES = 90;

export function parseProgramadoEnMs(
  programadoEn: string | null | undefined
): number | null {
  const iso = programadoEn?.trim();
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * true solo si el partido está pendiente y `now` está en
 * [programado_en, programado_en + duration).
 */
export function isPartidoEnVivoWindow(input: {
  estado?: string | null;
  programado_en?: string | null;
  now?: Date;
  durationMinutes?: number;
}): boolean {
  if (input.estado === "jugado") return false;
  const startMs = parseProgramadoEnMs(input.programado_en);
  if (startMs == null) return false;

  const duration = Math.max(
    1,
    Math.floor(
      input.durationMinutes ?? DEFAULT_PARTIDO_EN_VIVO_DURATION_MINUTES
    )
  );
  const nowMs = (input.now ?? new Date()).getTime();
  const endMs = startMs + duration * 60_000;
  return nowMs >= startMs && nowMs < endMs;
}

/** Id del primer partido (por orden del array) que está en ventana en vivo. */
export function findPartidoEnVivoId(
  partidos: Array<{
    id: string;
    estado?: string | null;
    programado_en?: string | null;
  }>,
  opts?: { now?: Date; durationMinutes?: number }
): string | null {
  for (const p of partidos) {
    if (p.estado !== "pendiente") continue;
    if (
      isPartidoEnVivoWindow({
        estado: p.estado,
        programado_en: p.programado_en,
        now: opts?.now,
        durationMinutes: opts?.durationMinutes,
      })
    ) {
      return p.id;
    }
  }
  return null;
}
