import type { GrupoAssignmentDraft } from "./types";
import {
  expectedMatchCount,
  generateBalancedRoundRobin,
  unorderedMatchupKey,
} from "./roundRobin";

export type ReorganizacionCode =
  | "PAIR_DUPLICATED"
  | "PAIR_WITHOUT_GROUP"
  | "UNKNOWN_PAIR"
  | "INVALID_GROUP"
  | "ROUND_ROBIN_MISMATCH";

export type ReorganizacionResult =
  | { ok: true }
  | { ok: false; code: ReorganizacionCode };

export type ReorgMatchup = {
  groupKey: number;
  localId: string;
  visitanteId: string;
};

const MIN_PAIRS_PER_GROUP = 2;

function cleanIds(ids: string[]): string[] {
  return ids.map((id) => id.trim()).filter(Boolean);
}

/**
 * Cada pareja de la categoría queda en exactamente un grupo.
 * No acepta huérfanas, duplicados ni ids ajenos. Mínimo real del motor: 2.
 */
export function validateReorganizacionGrupos(input: {
  parejaIds: string[];
  grupos: GrupoAssignmentDraft[];
}): ReorganizacionResult {
  const categoria = cleanIds(input.parejaIds);
  const categoriaSet = new Set(categoria);
  if (categoriaSet.size !== categoria.length) {
    return { ok: false, code: "PAIR_DUPLICATED" };
  }
  if (input.grupos.length === 0) {
    return { ok: false, code: "INVALID_GROUP" };
  }

  const ordenes = new Set<number>();
  const nombres = new Set<string>();
  const assigned: string[] = [];

  for (const grupo of input.grupos) {
    const nombre = grupo.nombre.trim();
    if (!nombre) return { ok: false, code: "INVALID_GROUP" };
    const nombreKey = nombre.toLowerCase();
    if (nombres.has(nombreKey)) return { ok: false, code: "INVALID_GROUP" };
    nombres.add(nombreKey);

    if (!Number.isInteger(grupo.orden) || grupo.orden < 1) {
      return { ok: false, code: "INVALID_GROUP" };
    }
    if (ordenes.has(grupo.orden)) return { ok: false, code: "INVALID_GROUP" };
    ordenes.add(grupo.orden);

    const parejaIds = cleanIds(grupo.parejaIds);
    if (parejaIds.length < MIN_PAIRS_PER_GROUP) {
      return { ok: false, code: "INVALID_GROUP" };
    }
    if (new Set(parejaIds).size !== parejaIds.length) {
      return { ok: false, code: "PAIR_DUPLICATED" };
    }
    for (const parejaId of parejaIds) {
      if (!categoriaSet.has(parejaId)) {
        return { ok: false, code: "UNKNOWN_PAIR" };
      }
      assigned.push(parejaId);
    }
  }

  if (new Set(assigned).size !== assigned.length) {
    return { ok: false, code: "PAIR_DUPLICATED" };
  }
  if (assigned.length !== categoriaSet.size) {
    return { ok: false, code: "PAIR_WITHOUT_GROUP" };
  }

  return { ok: true };
}

/**
 * Los enfrentamientos propuestos son exactamente el round robin actual
 * (`generateBalancedRoundRobin`) de cada grupo. A-B y B-A cuentan como uno.
 */
export function reorgMatchupsMatchEngine(
  grupos: GrupoAssignmentDraft[],
  matches: ReorgMatchup[]
): boolean {
  const structure = validateReorganizacionGrupos({
    parejaIds: grupos.flatMap((grupo) => grupo.parejaIds),
    grupos,
  });
  if (!structure.ok) return false;

  const expected = new Map<number, Set<string>>();
  for (const grupo of grupos) {
    const generated = generateBalancedRoundRobin(cleanIds(grupo.parejaIds));
    if (generated.length !== expectedMatchCount(cleanIds(grupo.parejaIds).length)) {
      return false;
    }
    expected.set(
      grupo.orden,
      new Set(
        generated.map((match) =>
          unorderedMatchupKey(match.localId, match.visitanteId)
        )
      )
    );
  }

  const seen = new Map<number, Set<string>>();
  for (const match of matches) {
    const key = unorderedMatchupKey(match.localId, match.visitanteId);
    const bucket = seen.get(match.groupKey) ?? new Set<string>();
    if (bucket.has(key)) return false;
    bucket.add(key);
    seen.set(match.groupKey, bucket);
  }

  if (seen.size !== expected.size) return false;
  for (const [groupKey, keys] of Array.from(expected.entries())) {
    const actual = seen.get(groupKey);
    if (!actual || actual.size !== keys.size) return false;
    for (const key of Array.from(keys)) {
      if (!actual.has(key)) return false;
    }
  }

  return true;
}
