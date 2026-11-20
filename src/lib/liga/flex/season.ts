import { FLEX_MAX_PLAYERS, FLEX_POSITION_POINTS } from "./constants";

export type FlexAward = {
  jornadaNumero: number;
  jugadorId: string;
  posicion: number;
  puntos: number;
};

export type FlexSeasonRow = {
  jugadorId: string;
  puntos: number;
  jornadasJugadas: number;
  posicion: number;
  porPosicion: number[];
  historial: Array<{ jornadaNumero: number; posicion: number; puntos: number }>;
};

export type FlexSeasonRank =
  | { ok: true; rows: FlexSeasonRow[]; podio: [string, string, string] | null }
  | { ok: false; reason: string; ties: string[][] };

/**
 * Suma los puntos oficiales de jornadas cerradas. No promedia, no resta
 * ausencias y no usa los games. El empate que cruza el podio no se rompe solo.
 */
export function rankFlexSeason(input: {
  awards: readonly FlexAward[];
  resolution?: readonly string[];
}): FlexSeasonRank {
  const byPlayer = new Map<string, FlexSeasonRow>();
  for (const award of input.awards) {
    if (award.puntos !== FLEX_POSITION_POINTS[award.posicion - 1]) {
      return {
        ok: false,
        reason: "Los puntos de una jornada no coinciden con la tabla oficial.",
        ties: [],
      };
    }
    const row = byPlayer.get(award.jugadorId) ?? {
      jugadorId: award.jugadorId,
      puntos: 0,
      jornadasJugadas: 0,
      posicion: 0,
      porPosicion: Array.from({ length: FLEX_MAX_PLAYERS }, () => 0),
      historial: [],
    };
    row.puntos += award.puntos;
    row.jornadasJugadas += 1;
    row.porPosicion[award.posicion - 1] = (row.porPosicion[award.posicion - 1] ?? 0) + 1;
    row.historial.push({
      jornadaNumero: award.jornadaNumero,
      posicion: award.posicion,
      puntos: award.puntos,
    });
    byPlayer.set(award.jugadorId, row);
  }

  const people = Array.from(byPlayer.values()).map((row) => ({
    ...row,
    historial: [...row.historial].sort((a, b) => a.jornadaNumero - b.jornadaNumero),
  }));
  const ordered = orderSeason(people, input.resolution);
  if (!ordered.ok) return ordered;

  const rows = ordered.rows.map((row, index) => ({ ...row, posicion: index + 1 }));
  const podio =
    rows.length >= 3
      ? ([rows[0]!.jugadorId, rows[1]!.jugadorId, rows[2]!.jugadorId] as [
          string,
          string,
          string,
        ])
      : null;
  return { ok: true, rows, podio };
}

function compareSeason(a: FlexSeasonRow, b: FlexSeasonRow): number {
  if (a.puntos !== b.puntos) return b.puntos - a.puntos;
  for (let i = 0; i < a.porPosicion.length; i += 1) {
    const diff = (b.porPosicion[i] ?? 0) - (a.porPosicion[i] ?? 0);
    if (diff !== 0) return diff;
  }
  if (a.jornadasJugadas !== b.jornadasJugadas) return b.jornadasJugadas - a.jornadasJugadas;
  return 0;
}

function orderSeason(
  people: FlexSeasonRow[],
  resolution?: readonly string[]
): { ok: true; rows: FlexSeasonRow[] } | { ok: false; reason: string; ties: string[][] } {
  const remaining = [...people];
  const rows: FlexSeasonRow[] = [];
  const resolved = new Map<string, number>();
  (resolution ?? []).forEach((id, index) => resolved.set(id, index));

  while (remaining.length > 0) {
    let best = remaining[0]!;
    for (const candidate of remaining.slice(1)) {
      if (compareSeason(candidate, best) < 0) best = candidate;
    }
    const group = remaining.filter(
      (p) => compareSeason(p, best) === 0 && compareSeason(best, p) === 0
    );
    if (group.length > 1) {
      const place = rows.length + 1;
      const affectsPodium = place <= 3;
      if (affectsPodium && !group.every((p) => resolved.has(p.jugadorId))) {
        return {
          ok: false,
          reason:
            "El podio sigue empatado. Registra una resolución deportiva antes de cerrar la liga.",
          ties: [group.map((p) => p.jugadorId)],
        };
      }
      if (group.every((p) => resolved.has(p.jugadorId))) {
        group.sort(
          (a, b) => (resolved.get(a.jugadorId) ?? 0) - (resolved.get(b.jugadorId) ?? 0)
        );
      }
    }
    for (const member of group) {
      rows.push(member);
      remaining.splice(
        remaining.findIndex((p) => p.jugadorId === member.jugadorId),
        1
      );
    }
  }
  return { ok: true, rows };
}

export type FlexCalendarJornada = {
  numero: number;
  hasOfficialResults: boolean;
};

/** Amplía al final o retira solo jornadas futuras sin resultados oficiales. */
export function resizeFlexSeason(input: {
  jornadas: readonly FlexCalendarJornada[];
  targetCount: number;
}):
  | { ok: true; removeNumeros: number[]; addNumeros: number[] }
  | { ok: false; error: string } {
  const target = Math.floor(input.targetCount);
  if (target !== 12) {
    return { ok: false, error: "Riviera Flex League se juega a 12 jornadas." };
  }
  const numeros = input.jornadas.map((j) => j.numero).sort((a, b) => a - b);
  const max = numeros.length ? numeros[numeros.length - 1]! : 0;
  if (target === max && numeros.length === max) {
    return { ok: true, removeNumeros: [], addNumeros: [] };
  }
  if (target > max) {
    const addNumeros = Array.from({ length: target - max }, (_, i) => max + 1 + i);
    return { ok: true, removeNumeros: [], addNumeros };
  }
  const removeNumeros: number[] = [];
  for (let n = max; n > target; n -= 1) {
    const row = input.jornadas.find((j) => j.numero === n);
    if (row?.hasOfficialResults) {
      return {
        ok: false,
        error: `La jornada ${n} ya tiene resultados oficiales y no se puede retirar.`,
      };
    }
    removeNumeros.push(n);
  }
  return { ok: true, removeNumeros, addNumeros: [] };
}

export function assertFlexFinalJornada(input: {
  jornadas: readonly { numero: number; hasData: boolean }[];
  numero: number;
}): { ok: true } | { ok: false; error: string } {
  const max = input.jornadas.reduce((m, j) => Math.max(m, j.numero), 0);
  if (!input.jornadas.some((j) => j.numero === input.numero)) {
    return { ok: false, error: "Esa jornada no está en el calendario." };
  }
  if (input.numero !== max) {
    const later = input.jornadas.filter((j) => j.numero > input.numero);
    const withData = later.filter((j) => j.hasData).map((j) => j.numero);
    if (withData.length > 0) {
      return {
        ok: false,
        error: `Hay jornadas posteriores con datos (${withData.join(", ")}). No se borra nada: ajústalas antes de marcar la final.`,
      };
    }
    return {
      ok: false,
      error:
        "La jornada final tiene que ser la última del calendario. Retira las jornadas posteriores vacías o elige la última.",
    };
  }
  return { ok: true };
}

/** Reemplaza los puntos de la jornada. Nunca suma el valor viejo con el nuevo. */
export function replaceJornadaAwards(
  awards: readonly FlexAward[],
  jornadaNumero: number,
  next: readonly FlexAward[]
): FlexAward[] {
  return [
    ...awards.filter((a) => a.jornadaNumero !== jornadaNumero),
    ...next.map((a) => ({ ...a, jornadaNumero })),
  ];
}

export function assertFlexSeasonCloseable(input: {
  jornadasPlaneadas: number;
  jornadas: readonly { numero: number; estado: string; hasPosiciones: boolean }[];
}): { ok: true } | { ok: false; error: string } {
  if (input.jornadasPlaneadas !== 12 || input.jornadas.length !== 12) {
    return { ok: false, error: "La temporada oficial es de 12 jornadas. No se cierra una temporada incompleta." };
  }
  for (let numero = 1; numero <= 12; numero += 1) {
    const row = input.jornadas.find((jornada) => jornada.numero === numero);
    if (!row || row.estado !== "completed" || !row.hasPosiciones) {
      return {
        ok: false,
        error: `La jornada ${numero} todavía no está terminada con puntos oficiales.`,
      };
    }
  }
  return { ok: true };
}

export function seasonMovement(
  before: readonly { jugadorId: string; posicion: number }[],
  after: readonly { jugadorId: string; posicion: number; puntosJornada: number }[],
  jugadorId: string
): { puntos: number; posicion: number; delta: number } | null {
  const now = after.find((r) => r.jugadorId === jugadorId);
  if (!now) return null;
  const prev = before.find((r) => r.jugadorId === jugadorId);
  const delta = prev ? prev.posicion - now.posicion : 0;
  return { puntos: now.puntosJornada, posicion: now.posicion, delta };
}
