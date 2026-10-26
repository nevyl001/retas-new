/** Marcador de un juego americano: entero, finito y no negativo. */
export function parseAmericanoScore(value: unknown): number | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    value = Number(trimmed);
  }
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

export interface AmericanoScoreRevision {
  previousScoreA: number;
  previousScoreB: number;
  editedAt: string;
}

export type AmericanoEditScoreResult =
  | { ok: true }
  | { ok: false; error: string; conflict?: boolean };
