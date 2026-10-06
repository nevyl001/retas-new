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

export const REORDER_COURT_SLOT_CONFLICT_MSG =
  "No se pudo reorganizar sin chocar con otra cancha u horario. Revisa la programación.";

type ScheduleSlot = {
  programado_en: string | null;
  cancha: string | null;
};

const DEFAULT_REORDER_DURATION_MINUTES = 30;

/** Misma normalización que partidoCourtSlotConflict.canchaSlotKey (sin ciclo de imports). */
function courtKey(raw: string | null | undefined): string {
  const v = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!v) return "";
  const lower = v.toLowerCase();
  const prefixed = lower.match(/^cancha\s+(.+)$/);
  return (prefixed ? prefixed[1].trim() || lower : lower);
}

function slotSortKey(slot: ScheduleSlot): string {
  const iso = slot.programado_en?.trim();
  if (!iso) return `\uffff|${slot.cancha ?? ""}`;
  try {
    return `${mexicoScheduleSlotKey(iso)}|${courtKey(slot.cancha)}`;
  } catch {
    return `${iso}|${courtKey(slot.cancha)}`;
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

/** Nombre de cancha canónico para guardar (prioriza el texto ya usado). */
function uniqueCourtsPreserveOrder(
  slots: ScheduleSlot[],
  extra: TorneoExpressPartido[] = []
): string[] {
  const seen = new Set<string>();
  const courts: string[] = [];

  const push = (raw: string | null | undefined) => {
    const name = raw?.trim();
    if (!name) return;
    const key = courtKey(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    courts.push(name);
  };

  for (const slot of slots) push(slot.cancha);
  for (const partido of extra) push(partido.cancha);

  return courts.length > 0 ? courts : ["Cancha 1"];
}

function slotKeyOf(iso: string | null | undefined): string | null {
  const value = iso?.trim();
  if (!value) return null;
  try {
    return mexicoScheduleSlotKey(value);
  } catch {
    return null;
  }
}

function pairsBusyAtSlot(
  partidos: TorneoExpressPartido[],
  slotKey: string
): Set<string> {
  const busy = new Set<string>();
  for (const partido of partidos) {
    if (slotKeyOf(partido.programado_en) !== slotKey) continue;
    busy.add(partido.pareja_local_id);
    busy.add(partido.pareja_visitante_id);
  }
  return busy;
}

function courtsTakenAtSlot(
  partidos: TorneoExpressPartido[],
  slotKey: string
): Set<string> {
  const taken = new Set<string>();
  for (const partido of partidos) {
    if (slotKeyOf(partido.programado_en) !== slotKey) continue;
    const key = courtKey(partido.cancha);
    if (key) taken.add(key);
  }
  return taken;
}

function nextIsoAfter(iso: string, durationMinutes: number): string | null {
  const date = partidoDateInputValue(iso);
  const time = partidoTimeInputValue24(iso);
  const next = addMinutesToMexicoCalendar(date, time, durationMinutes);
  if (!next) return null;
  return programadoIsoFromMexicoCalendar(next.date, next.time);
}

export type ReorderScheduleOptions = {
  /**
   * Partidos de otros grupos (o del torneo) que no se mueven.
   * Sus canchas/horarios se respetan al reorganizar.
   */
  externalPartidos?: TorneoExpressPartido[];
};

/**
 * Empaqueta partidos en el orden deseado eligiendo horario + cancha libres
 * respecto a parejas del grupo y canchas ya ocupadas en el torneo.
 */
function packMatchesInDesiredOrder(
  matches: TorneoExpressPartido[],
  templateSlots: ScheduleSlot[],
  externalPartidos: TorneoExpressPartido[]
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

  const courts = uniqueCourtsPreserveOrder(timedSlots, externalPartidos);
  const durationMinutes = inferDurationMinutesFromSlots(timedSlots);
  const startIso = timedSlots[0]!.programado_en!.trim();

  const movingIds = new Set(matches.map((m) => m.id));
  const externals = externalPartidos.filter((p) => !movingIds.has(p.id));

  const queue = [...matches];
  const assigned: TorneoExpressPartido[] = [];
  let currentIso = startIso;
  let guard = 0;

  while (queue.length > 0 && guard < 500) {
    guard += 1;
    const slotKey = slotKeyOf(currentIso);
    if (!slotKey) break;

    const busyPairs = pairsBusyAtSlot(assigned, slotKey);
    const takenCourts = new Set<string>([
      ...Array.from(courtsTakenAtSlot(assigned, slotKey)),
      ...Array.from(courtsTakenAtSlot(externals, slotKey)),
    ]);

    const availableCourts = courts.filter((c) => !takenCourts.has(courtKey(c)));

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
      takenCourts.add(courtKey(court));
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
 * Al arrastrar un partido, ese orden es la intención: se recalculan
 * horarios y canchas del grupo sin chocar parejas ni canchas del torneo.
 */
export function reassignScheduleSlotsOnReorder(
  current: TorneoExpressPartido[],
  fromIndex: number,
  toIndex: number,
  options: ReorderScheduleOptions = {}
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

  return packMatchesInDesiredOrder(
    identities,
    templateSlots,
    options.externalPartidos ?? []
  );
}

/** Tras reordenar: ¿queda alguna cancha+horario chocado en el torneo? */
export function reorderCreatesCourtConflict(
  reorderedGroup: TorneoExpressPartido[],
  externalPartidos: TorneoExpressPartido[]
): boolean {
  const movingIds = new Set(reorderedGroup.map((p) => p.id));
  const merged = [
    ...externalPartidos.filter((p) => !movingIds.has(p.id)),
    ...reorderedGroup,
  ];

  const bySlotCourt = new Map<string, string[]>();
  for (const partido of merged) {
    const slot = slotKeyOf(partido.programado_en ?? partidoScheduleIso(partido));
    const court = courtKey(partido.cancha);
    if (!slot || !court) continue;
    const key = `${slot}|${court}`;
    const list = bySlotCourt.get(key) ?? [];
    list.push(partido.id);
    bySlotCourt.set(key, list);
  }

  const conflictIds = new Set<string>();
  for (const list of Array.from(bySlotCourt.values())) {
    if (list.length < 2) continue;
    for (const id of list) conflictIds.add(id);
  }
  return reorderedGroup.some((p) => conflictIds.has(p.id));
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
    const iso = partido.programado_en?.trim();
    if (!iso) continue;
    let slotKey: string;
    try {
      slotKey = mexicoScheduleSlotKey(iso);
    } catch {
      continue;
    }
    for (const pairId of [
      partido.pareja_local_id,
      partido.pareja_visitante_id,
    ]) {
      // Una plaza de eliminatoria sin definir llega vacía: no es una pareja.
      if (!pairId?.trim()) continue;
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
