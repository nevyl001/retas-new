import { canchaSlotKey } from "./partidoCourtSlotConflict";
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

function sameCourt(a: string, b: string): boolean {
  if (a === b) return true;
  const left = canchaSlotKey(a);
  const right = canchaSlotKey(b);
  return left !== "" && left === right;
}

function collides(a: Slot, b: Slot): boolean {
  if (!sameSlot(a.programadoEn, b.programadoEn)) return false;
  if (sameCourt(a.cancha, b.cancha)) return true;
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
  /**
   * Partidos de grupos que no se tocan (ya iniciados): no se regeneran, pero
   * sus horarios y canchas cuentan como ocupados para no empalmar.
   */
  fixed?: ReassignExistingMatch[];
  /** Hora de partida si ningún partido tiene día y cancha guardados. */
  anchorIso?: string;
  /** Cruces que ya tienen resultado: no se regeneran. */
  omitMatchups?: ReadonlySet<string>;
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
      const cancha = (match.cancha == null ? "" : String(match.cancha)).trim();
      const programadoEn = (
        match.programadoEn == null ? "" : String(match.programadoEn)
      ).trim();
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

  const fixedSlots: Slot[] = (input.fixed ?? [])
    .map((match) => {
      const cancha = (match.cancha == null ? "" : String(match.cancha)).trim();
      const programadoEn = (
        match.programadoEn == null ? "" : String(match.programadoEn)
      ).trim();
      if (!cancha || !programadoEn) return null;
      return {
        cancha,
        programadoEn,
        localId: match.localId,
        visitanteId: match.visitanteId,
      };
    })
    .filter((slot): slot is Slot => slot !== null);

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
  const isTaken = (slot: Slot): boolean =>
    fixedSlots.some((other) => collides(other, slot)) ||
    planned.some((other) => collides(other, slot));

  for (const grupo of input.grupos) {
    const matches = generateBalancedRoundRobin(grupo.parejaIds);
    for (const match of matches) {
      const key = unorderedMatchupKey(match.localId, match.visitanteId);
      if (input.omitMatchups?.has(key)) continue;
      const kept = byMatchup.get(key);
      if (!kept || usedMatchups.has(key)) continue;
      const slot: Slot = {
        cancha: kept.cancha,
        programadoEn: kept.programadoEn,
        localId: match.localId,
        visitanteId: match.visitanteId,
      };
      if (isTaken(slot)) continue;
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
      if (input.omitMatchups?.has(key) || usedMatchups.has(key)) continue;
      pending.push({
        grupoOrden: grupo.orden,
        localId: match.localId,
        visitanteId: match.visitanteId,
        ronda: match.ronda,
        orden: match.orden,
      });
    }
  }

  const knownSlots = [...stored.map((row) => row.slot), ...fixedSlots];
  const courts =
    knownSlots.length > 0
      ? Array.from(new Set(knownSlots.map((slot) => slot.cancha)))
      : ["1"];
  let latest =
    knownSlots.reduce<string | null>(
      (max, slot) => laterIso(max, slot.programadoEn),
      null
    ) ??
    input.anchorIso?.trim() ??
    new Date().toISOString();

  for (const match of pending) {
    const fromPool = pool.findIndex((slot) => {
      const trial: Slot = { ...slot, localId: match.localId, visitanteId: match.visitanteId };
      return !isTaken(trial);
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
        if (isTaken(trial)) continue;
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

  // El servidor exige orden >= 1. Los grupos creados desde el asistente
  // empiezan en 0, así que se manda la posición 1-based y se conserva el
  // mismo orden relativo.
  const sentOrden = new Map<number, number>();
  input.grupos.forEach((grupo, index) => {
    sentOrden.set(grupo.orden, index + 1);
  });

  return {
    ok: true,
    payload: {
      grupos: input.grupos.map((grupo, index) => ({
        nombre: grupo.nombre,
        orden: index + 1,
        pareja_ids: grupo.parejaIds,
      })),
      partidos: planned.map((match) => ({
        grupo_orden: sentOrden.get(match.grupoOrden) ?? match.grupoOrden,
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
