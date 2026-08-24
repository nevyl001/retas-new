import { partidoScheduleIso } from "./partidoSchedule";
import { mexicoScheduleSlotKey } from "./teScheduleTime";
import type { TorneoExpressPartido } from "./types";

export const REORDER_PAIR_SLOT_CONFLICT_MSG =
  "Esa pareja ya juega a esa hora. Elige otro lugar.";

type ScheduleSlot = {
  orden: number;
  programado_en: string | null;
  cancha: string | null;
};

/** Los horarios y canchas se quedan en su lugar; las parejas se mueven al hueco. */
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

  const slots: ScheduleSlot[] = current.map((p, i) => ({
    orden: i + 1,
    programado_en: p.programado_en ?? null,
    cancha: p.cancha ?? null,
  }));

  const identities = [...current];
  const [moved] = identities.splice(fromIndex, 1);
  identities.splice(toIndex, 0, moved);

  return identities.map((p, i) => ({
    ...p,
    orden: slots[i]!.orden,
    programado_en: slots[i]!.programado_en,
    cancha: slots[i]!.cancha,
  }));
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
