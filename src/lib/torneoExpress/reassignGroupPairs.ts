import { generateBalancedRoundRobin, unorderedMatchupKey } from "./roundRobin";
import {
  addMinutesToMexicoCalendar,
  mexicoScheduleSlotKey,
  programadoIsoFromMexicoCalendar,
} from "./teScheduleTime";

export type ReassignGroupDraft = {
  orden: number;
  nombre: string;
  parejaIds: string[];
};

export type ReassignExistingMatch = {
  localId: string;
  visitanteId: string;
  cancha: string | null;
  programadoEn: string | null;
};

export type ReassignPayload = {
  grupos: Array<{ nombre: string; orden: number; pareja_ids: string[] }>;
  partidos: Array<{
    grupo_orden: number;
    pareja_local_id: string;
    pareja_visitante_id: string;
    ronda: number;
    orden: number;
    cancha: string;
    programado_en: string;
  }>;
};

type Slot = {
  cancha: string;
  programadoEn: string;
  localId: string;
  visitanteId: string;
};

function sameSlot(a: string, b: string): boolean {
  try {
    return mexicoScheduleSlotKey(a) === mexicoScheduleSlotKey(b);
  } catch {
    return a === b;
  }
}

function collides(a: Slot, b: Slot): boolean {
  if (!sameSlot(a.programadoEn, b.programadoEn)) return false;
  if (a.cancha === b.cancha) return true;
  return (
    a.localId === b.localId ||
    a.localId === b.visitanteId ||
    a.visitanteId === b.localId ||
    a.visitanteId === b.visitanteId
  );
}

function laterIso(current: string | null, candidate: string): string {
  if (!current) return candidate;
  const currentMs = new Date(current).getTime();
  const nextMs = new Date(candidate).getTime();
  if (Number.isNaN(nextMs)) return current;
  if (Number.isNaN(currentMs)) return candidate;
  return nextMs > currentMs ? candidate : current;
}

function hourAfter(iso: string): string | null {
  const key = mexicoScheduleSlotKey(iso);
  const [date, time] = key.split("T");
  if (!date || !time) return null;
  const next = addMinutesToMexicoCalendar(date, time, 60);
  if (!next) return null;
  return programadoIsoFromMexicoCalendar(next.date, next.time);
}

export function buildGroupReassignment(input: {
  grupos: ReassignGroupDraft[];
  existentes: ReassignExistingMatch[];
}): { ok: true; payload: ReassignPayload } | { ok: false; error: string } {
  const seen = new Set<string>();
  for (const grupo of input.grupos) {
    if (grupo.parejaIds.length < 2) {
      return {
        ok: false,
        error: `${grupo.nombre} necesita al menos 2 parejas.`,
      };
    }
    for (const parejaId of grupo.parejaIds) {
      if (seen.has(parejaId)) {
        return { ok: false, error: "Una pareja no puede estar en dos grupos." };
      }
      seen.add(parejaId);
    }
  }

  const stored = input.existentes
    .map((match) => {
      const cancha = match.cancha?.trim() ?? "";
      const programadoEn = match.programadoEn?.trim() ?? "";
      if (!cancha || !programadoEn) return null;
      return {
        key: unorderedMatchupKey(match.localId, match.visitanteId),
        slot: {
          cancha,
          programadoEn,
          localId: match.localId,
          visitanteId: match.visitanteId,
        },
      };
    })
    .filter((row): row is { key: string; slot: Slot } => row !== null);

  if (stored.length === 0) {
    return {
      ok: false,
      error: "Primero guarda día, hora y cancha de los partidos.",
    };
  }

  const byMatchup = new Map<string, Slot>();
  for (const row of stored) {
    if (!byMatchup.has(row.key)) byMatchup.set(row.key, row.slot);
  }

  const planned: Array<Slot & {
    grupoOrden: number;
    ronda: number;
    orden: number;
  }> = [];
  const usedMatchups = new Set<string>();

  for (const grupo of input.grupos) {
    const matches = generateBalancedRoundRobin(grupo.parejaIds);
    for (const match of matches) {
      const key = unorderedMatchupKey(match.localId, match.visitanteId);
      const kept = byMatchup.get(key);
      if (!kept || usedMatchups.has(key)) continue;
      const slot: Slot = {
        cancha: kept.cancha,
        programadoEn: kept.programadoEn,
        localId: match.localId,
        visitanteId: match.visitanteId,
      };
      if (planned.some((placed) => collides(placed, slot))) continue;
      usedMatchups.add(key);
      planned.push({
        ...slot,
        grupoOrden: grupo.orden,
        ronda: match.ronda,
        orden: match.orden,
      });
    }
  }

  const pool = stored
    .filter((row) => !usedMatchups.has(row.key))
    .map((row) => row.slot);
  const pending: Array<{
    grupoOrden: number;
    localId: string;
    visitanteId: string;
    ronda: number;
    orden: number;
  }> = [];

  for (const grupo of input.grupos) {
    for (const match of generateBalancedRoundRobin(grupo.parejaIds)) {
      const key = unorderedMatchupKey(match.localId, match.visitanteId);
      if (usedMatchups.has(key)) continue;
      pending.push({
        grupoOrden: grupo.orden,
        localId: match.localId,
        visitanteId: match.visitanteId,
        ronda: match.ronda,
        orden: match.orden,
      });
    }
  }

  const courts = Array.from(new Set(stored.map((row) => row.slot.cancha)));
  let latest = stored.reduce<string | null>(
    (max, row) => laterIso(max, row.slot.programadoEn),
    null
  );

  for (const match of pending) {
    const fromPool = pool.findIndex((slot) => {
      const trial: Slot = { ...slot, localId: match.localId, visitanteId: match.visitanteId };
      return !planned.some((placed) => collides(placed, trial));
    });
    if (fromPool >= 0) {
      const slot = pool.splice(fromPool, 1)[0]!;
      planned.push({
        cancha: slot.cancha,
        programadoEn: slot.programadoEn,
        localId: match.localId,
        visitanteId: match.visitanteId,
        grupoOrden: match.grupoOrden,
        ronda: match.ronda,
        orden: match.orden,
      });
      continue;
    }

    let placed = false;
    let cursor = latest;
    for (let step = 0; step < 48 && cursor && !placed; step += 1) {
      const next = hourAfter(cursor);
      if (!next) break;
      cursor = next;
      for (const cancha of courts) {
        const trial: Slot = {
          cancha,
          programadoEn: next,
          localId: match.localId,
          visitanteId: match.visitanteId,
        };
        if (planned.some((item) => collides(item, trial))) continue;
        planned.push({
          ...trial,
          grupoOrden: match.grupoOrden,
          ronda: match.ronda,
          orden: match.orden,
        });
        latest = laterIso(latest, next);
        placed = true;
        break;
      }
    }
    if (!placed) {
      return {
        ok: false,
        error: "No hay horario libre para los partidos nuevos.",
      };
    }
  }

  return {
    ok: true,
    payload: {
      grupos: input.grupos.map((grupo) => ({
        nombre: grupo.nombre,
        orden: grupo.orden,
        pareja_ids: grupo.parejaIds,
      })),
      partidos: planned.map((match) => ({
        grupo_orden: match.grupoOrden,
        pareja_local_id: match.localId,
        pareja_visitante_id: match.visitanteId,
        ronda: match.ronda,
        orden: match.orden,
        cancha: match.cancha,
        programado_en: match.programadoEn,
      })),
    },
  };
}
