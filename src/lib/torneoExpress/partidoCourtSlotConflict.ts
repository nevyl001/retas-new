import {
  canchaDraftFromStored,
  normalizeCanchaForSave,
} from "./canchaDisplay";
import { partidoScheduleIso } from "./partidoSchedule";
import { mexicoScheduleSlotKey } from "./teScheduleTime";
import type { TorneoExpressPartido } from "./types";

export const PARTIDO_CANCHA_OCUPADA_MSG =
  "Cancha ocupada en ese horario. Elige otra cancha u otro horario.";

export function canchaSlotKey(raw: string | null | undefined): string {
  const v = normalizeCanchaForSave(raw ?? "");
  const prefixed = v.match(/^cancha\s+(.+)$/i);
  const normalized = prefixed ? prefixed[1].trim() || v : v;
  return normalized.toLowerCase();
}

export function findPartidoCourtSlotConflict(
  partidoId: string,
  programadoEn: string,
  cancha: string | null | undefined,
  partidos: TorneoExpressPartido[]
): TorneoExpressPartido | null {
  if (!programadoEn.trim()) return null;

  let slotKey: string;
  try {
    slotKey = mexicoScheduleSlotKey(programadoEn);
  } catch {
    return null;
  }

  const courtKey = canchaSlotKey(cancha);
  if (!courtKey) return null;

  for (const partido of partidos) {
    if (partido.id === partidoId) continue;
    const otherIso = partidoScheduleIso(partido);
    if (mexicoScheduleSlotKey(otherIso) !== slotKey) continue;
    if (canchaSlotKey(partido.cancha) !== courtKey) continue;
    return partido;
  }

  return null;
}

/** Todos los partidos que ocupan cancha+horario (excluye el editado). */
export function findAllPartidoCourtSlotConflicts(
  partidoId: string,
  programadoEn: string,
  cancha: string | null | undefined,
  partidos: TorneoExpressPartido[]
): TorneoExpressPartido[] {
  if (!programadoEn.trim()) return [];

  let slotKey: string;
  try {
    slotKey = mexicoScheduleSlotKey(programadoEn);
  } catch {
    return [];
  }

  const courtKey = canchaSlotKey(cancha);
  if (!courtKey) return [];

  return partidos.filter((partido) => {
    if (partido.id === partidoId) return false;
    const otherIso = partidoScheduleIso(partido);
    if (mexicoScheduleSlotKey(otherIso) !== slotKey) return false;
    return canchaSlotKey(partido.cancha) === courtKey;
  });
}

export type CanchaChangePlan =
  | { kind: "noop"; cancha: string }
  | { kind: "update"; cancha: string }
  | {
      kind: "swap";
      cancha: string;
      swapWithId: string;
      swapCancha: string;
    };

/**
 * Si la cancha destino ya la usa exactamente un partido en ese horario,
 * intercambia canchas (evita bloqueo al “mover” un partido a la otra cancha).
 */
export function planCanchaChange(
  partido: TorneoExpressPartido,
  nextCanchaRaw: string,
  partidos: TorneoExpressPartido[]
): CanchaChangePlan {
  const nextCancha = normalizeCanchaForSave(nextCanchaRaw);
  const prevCancha = normalizeCanchaForSave(
    canchaDraftFromStored(partido.cancha)
  );

  if (canchaSlotKey(nextCancha) === canchaSlotKey(prevCancha)) {
    return { kind: "noop", cancha: nextCancha };
  }

  const scheduleIso = partidoScheduleIso(partido);
  const conflicts = findAllPartidoCourtSlotConflicts(
    partido.id,
    scheduleIso,
    nextCancha,
    partidos
  );

  if (conflicts.length === 0) {
    return { kind: "update", cancha: nextCancha };
  }

  if (conflicts.length === 1) {
    const other = conflicts[0]!;
    // El otro se queda con la cancha que liberamos.
    return {
      kind: "swap",
      cancha: nextCancha,
      swapWithId: other.id,
      swapCancha: prevCancha,
    };
  }

  throw new Error(PARTIDO_CANCHA_OCUPADA_MSG);
}

export function assertPartidoCourtSlotAvailable(
  partidoId: string,
  programadoEn: string,
  cancha: string | null | undefined,
  partidos: TorneoExpressPartido[]
): void {
  const conflict = findPartidoCourtSlotConflict(
    partidoId,
    programadoEn,
    cancha,
    partidos
  );
  if (conflict) {
    throw new Error(PARTIDO_CANCHA_OCUPADA_MSG);
  }
}

/** Ids de partidos que ya comparten cancha + horario con otro del torneo. */
export function findConflictingPartidoIds(
  partidos: TorneoExpressPartido[]
): Set<string> {
  const ids = new Set<string>();
  const bySlotCourt = new Map<string, string[]>();

  for (const partido of partidos) {
    const iso = partidoScheduleIso(partido);
    if (!iso) continue;
    let slotKey: string;
    try {
      slotKey = mexicoScheduleSlotKey(iso);
    } catch {
      continue;
    }
    const courtKey = canchaSlotKey(partido.cancha);
    if (!courtKey) continue;
    const key = `${slotKey}|${courtKey}`;
    const list = bySlotCourt.get(key) ?? [];
    list.push(partido.id);
    bySlotCourt.set(key, list);
  }

  for (const list of Array.from(bySlotCourt.values())) {
    if (list.length < 2) continue;
    for (const id of list) ids.add(id);
  }

  return ids;
}
