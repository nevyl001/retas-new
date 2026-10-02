import {
  partidoDateInputValue,
  partidoScheduleIso,
} from "./partidoSchedule";
import {
  addMinutesToMexicoCalendar,
  mexicoScheduleSlotKey,
  partidoTimeInputValue24,
  programadoIsoFromMexicoCalendar,
} from "./teScheduleTime";
import type { TorneoExpressPartido } from "./types";

export const REORDER_PAIR_SLOT_CONFLICT_MSG =
  "Esa pareja ya juega a esa hora. Elige otro lugar.";

type ScheduleSlot = {
  programado_en: string | null;
  cancha: string | null;
};

const DEFAULT_REORDER_DURATION_MINUTES = 30;

function slotSortKey(slot: ScheduleSlot): string {
  const iso = slot.programado_en?.trim();
  if (!iso) return `\uffff|${slot.cancha ?? ""}`;
  try {
    return `${mexicoScheduleSlotKey(iso)}|${(slot.cancha ?? "").trim().toLowerCase()}`;
  } catch {
    return `${iso}|${slot.cancha ?? ""}`;
  }
}

function inferDurationMinutesFromSlots(slots: ScheduleSlot[]): number {
  const uniqueTimes = Array.from(
    new Set(
      slots
        .map((s) => {
          const iso = s.programado_en?.trim();
          if (!iso) return NaN;
          return new Date(iso).getTime();
        })
        .filter((t) => Number.isFinite(t))
    )
  ).sort((a, b) => a - b);

  const gaps: number[] = [];
  for (let i = 1; i < uniqueTimes.length; i += 1) {
    const gapMinutes = Math.round(
      (uniqueTimes[i]! - uniqueTimes[i - 1]!) / 60_000
    );
    if (gapMinutes >= 15 && gapMinutes <= 180) {
      gaps.push(gapMinutes);
    }
  }

  if (gaps.length === 0) return DEFAULT_REORDER_DURATION_MINUTES;

  const counts = new Map<number, number>();
  for (const gap of gaps) {
    counts.set(gap, (counts.get(gap) ?? 0) + 1);
  }

  let bestGap = gaps[0]!;
  let bestCount = 0;
  for (const [gap, count] of Array.from(counts.entries())) {
    if (count > bestCount || (count === bestCount && gap < bestGap)) {
      bestGap = gap;
      bestCount = count;
    }
  }
  return bestGap;
}

function uniqueCourtsPreserveOrder(slots: ScheduleSlot[]): string[] {
  const seen = new Set<string>();
  const courts: string[] = [];
  for (const slot of slots) {
    const name = slot.cancha?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    courts.push(name);
  }
  return courts.length > 0 ? courts : ["Cancha 1"];
}

function pairsBusyAtSlot(
  assigned: TorneoExpressPartido[],
  slotKey: string
): Set<string> {
  const busy = new Set<string>();
  for (const partido of assigned) {
    const iso = partido.programado_en?.trim();
    if (!iso) continue;
    let key: string;
    try {
      key = mexicoScheduleSlotKey(iso);
    } catch {
      continue;
    }
    if (key !== slotKey) continue;
    busy.add(partido.pareja_local_id);
    busy.add(partido.pareja_visitante_id);
  }
  return busy;
}

function courtsTakenAtSlot(
  assigned: TorneoExpressPartido[],
  slotKey: string
): Set<string> {
  const taken = new Set<string>();
  for (const partido of assigned) {
    const iso = partido.programado_en?.trim();
    const cancha = partido.cancha?.trim();
    if (!iso || !cancha) continue;
    let key: string;
    try {
      key = mexicoScheduleSlotKey(iso);
    } catch {
      continue;
    }
    if (key === slotKey) taken.add(cancha.toLowerCase());
  }
  return taken;
}

function nextIsoAfter(
  iso: string,
  durationMinutes: number
): string | null {
  const date = partidoDateInputValue(iso);
  const time = partidoTimeInputValue24(iso);
  const next = addMinutesToMexicoCalendar(date, time, durationMinutes);
  if (!next) return null;
  return programadoIsoFromMexicoCalendar(next.date, next.time);
}

/**
 * Empaqueta partidos en orden deseado sobre canchas/horarios del grupo.
 * Si dos partidos no pueden compartir horario (misma pareja), el segundo
 * se corre al siguiente hueco — reorganiza automáticamente.
 */
function packMatchesInDesiredOrder(
  matches: TorneoExpressPartido[],
  templateSlots: ScheduleSlot[]
): TorneoExpressPartido[] {
  if (matches.length === 0) return [];

  const timedSlots = templateSlots
    .filter((s) => Boolean(s.programado_en?.trim()))
    .sort((a, b) => slotSortKey(a).localeCompare(slotSortKey(b)));

  if (timedSlots.length === 0) {
    return matches.map((p, i) => ({
      ...p,
      orden: i + 1,
    }));
  }

  const courts = uniqueCourtsPreserveOrder(timedSlots);
  const durationMinutes = inferDurationMinutesFromSlots(timedSlots);
  const startIso = timedSlots[0]!.programado_en!.trim();

  const queue = [...matches];
  const assigned: TorneoExpressPartido[] = [];
  let currentIso = startIso;
  let guard = 0;

  while (queue.length > 0 && guard < 500) {
    guard += 1;
    let slotKey: string;
    try {
      slotKey = mexicoScheduleSlotKey(currentIso);
    } catch {
      break;
    }

    const busyPairs = pairsBusyAtSlot(assigned, slotKey);
    const takenCourts = courtsTakenAtSlot(assigned, slotKey);
    const availableCourts = courts.filter(
      (c) => !takenCourts.has(c.toLowerCase())
    );

    let placedThisSlot = 0;
    for (let i = 0; i < queue.length && availableCourts.length > 0; ) {
      const match = queue[i]!;
      if (
        busyPairs.has(match.pareja_local_id) ||
        busyPairs.has(match.pareja_visitante_id)
      ) {
        i += 1;
        continue;
      }

      const court = availableCourts.shift()!;
      assigned.push({
        ...match,
        programado_en: currentIso,
        cancha: court,
        orden: assigned.length + 1,
      });
      busyPairs.add(match.pareja_local_id);
      busyPairs.add(match.pareja_visitante_id);
      queue.splice(i, 1);
      placedThisSlot += 1;
    }

    const nextIso = nextIsoAfter(currentIso, durationMinutes);
    if (!nextIso) break;
    currentIso = nextIso;

    if (placedThisSlot === 0 && queue.length > 0 && courts.length === 0) {
      break;
    }
  }

  if (queue.length > 0) {
    // No se pudo colocar todo: conserva identidades restantes al final
    // con el último horario conocido (el chequeo de conflictos lo detectará).
    for (const match of queue) {
      assigned.push({
        ...match,
        orden: assigned.length + 1,
      });
    }
  }

  return assigned.map((p, i) => ({ ...p, orden: i + 1 }));
}

/**
 * Al arrastrar un partido a otra posición, ese orden es la intención:
 * el partido pasa a ser el N-ésimo y los horarios se reorganizan solos
 * (recorren) para que ninguna pareja juegue dos veces a la misma hora.
 */
export function reassignScheduleSlotsOnReorder(
  current: TorneoExpressPartido[],
  fromIndex: number,
  toIndex: number
): TorneoExpressPartido[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= current.length ||
    toIndex >= current.length
  ) {
    return current;
  }

  const templateSlots: ScheduleSlot[] = current.map((p) => ({
    programado_en: p.programado_en ?? null,
    cancha: p.cancha ?? null,
  }));

  const identities = [...current];
  const [moved] = identities.splice(fromIndex, 1);
  identities.splice(toIndex, 0, moved);

  return packMatchesInDesiredOrder(identities, templateSlots);
}

export function hasPairSameSlotConflict(
  partidos: TorneoExpressPartido[]
): boolean {
  return findPairSameSlotConflictDetails(partidos).pairIds.length > 0;
}

/** Parejas y partidos que quedarían dos veces en el mismo horario. */
export function findPairSameSlotConflictDetails(
  partidos: TorneoExpressPartido[]
): { partidoIds: string[]; pairIds: string[] } {
  const seen = new Map<string, string>();
  const conflictingPartidoIds = new Set<string>();
  const conflictingPairIds = new Set<string>();

  for (const partido of partidos) {
    const iso = partidoScheduleIso(partido);
    let slotKey: string;
    try {
      slotKey = mexicoScheduleSlotKey(iso);
    } catch {
      continue;
    }
    for (const pairId of [partido.pareja_local_id, partido.pareja_visitante_id]) {
      const key = `${slotKey}|${pairId}`;
      const prevPartidoId = seen.get(key);
      if (prevPartidoId) {
        conflictingPartidoIds.add(prevPartidoId);
        conflictingPartidoIds.add(partido.id);
        conflictingPairIds.add(pairId);
      } else {
        seen.set(key, partido.id);
      }
    }
  }

  return {
    partidoIds: Array.from(conflictingPartidoIds),
    pairIds: Array.from(conflictingPairIds),
  };
}

export function formatPairSameSlotConflictMessage(
  pairIds: string[],
  labelById: Map<string, string>
): string {
  const names = pairIds
    .map((id) => labelById.get(id)?.trim())
    .filter((name): name is string => Boolean(name));

  if (names.length === 1) {
    return `${names[0]} ya juega a esa hora. Elige otro lugar.`;
  }
  if (names.length > 1) {
    return `${names.join(" y ")} ya juegan a esa hora. Elige otro lugar.`;
  }
  return REORDER_PAIR_SLOT_CONFLICT_MSG;
}
