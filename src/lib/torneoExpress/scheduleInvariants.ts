import { mexicoScheduleSlotKey } from "./teScheduleTime";
import { PARTIDO_CANCHA_OCUPADA_MSG } from "./partidoCourtSlotConflict";
import type { DraftScheduleMatch } from "./draftScheduleMatch";

export class ScheduleInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduleInvariantError";
  }
}

export const SCHEDULE_INCOMPLETE_MSG =
  "No fue posible programar todos los partidos.";

/** Valida que el schedule cumple todas las invariantes antes de persistir. */
export function validateScheduleInvariants(
  original: DraftScheduleMatch[],
  scheduled: DraftScheduleMatch[]
): void {
  if (scheduled.length !== original.length) {
    throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
  }

  const originalByKey = new Map(original.map((m) => [m.matchKey, m]));
  const seenKeys = new Set<string>();

  for (const match of scheduled) {
    if (seenKeys.has(match.matchKey)) {
      throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
    }
    seenKeys.add(match.matchKey);

    const source = originalByKey.get(match.matchKey);
    if (!source) {
      throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
    }

    if (
      source.parejaLocalId !== match.parejaLocalId ||
      source.parejaVisitanteId !== match.parejaVisitanteId ||
      source.ronda !== match.ronda ||
      source.orden !== match.orden ||
      source.groupKey !== match.groupKey
    ) {
      throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
    }

    if (!match.programado_en?.trim()) {
      throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
    }

    if (!match.cancha?.trim()) {
      throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
    }
  }

  for (const key of Array.from(originalByKey.keys())) {
    if (!seenKeys.has(key)) {
      throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
    }
  }

  const courtSlotKeys = new Set<string>();
  const pairSlotKeys = new Set<string>();

  for (const match of scheduled) {
    const slotKey = mexicoScheduleSlotKey(match.programado_en!);
    const courtKey = `${slotKey}|${match.cancha!.trim()}`;
    if (courtSlotKeys.has(courtKey)) {
      throw new ScheduleInvariantError(PARTIDO_CANCHA_OCUPADA_MSG);
    }
    courtSlotKeys.add(courtKey);

    for (const pairId of [match.parejaLocalId, match.parejaVisitanteId]) {
      const pairKey = `${slotKey}|${pairId}`;
      if (pairSlotKeys.has(pairKey)) {
        throw new ScheduleInvariantError(SCHEDULE_INCOMPLETE_MSG);
      }
      pairSlotKeys.add(pairKey);
    }
  }
}
