import type { Duelo2v2Ganador, Duelo2v2SetDetalle } from "./types";

export type SetOutcome = "incompleto" | "empate" | "a" | "b";

export interface SetRowDraft {
  a: string;
  b: string;
}

export interface DueloScoreSummary {
  detalle: Duelo2v2SetDetalle[];
  setsWonA: number;
  setsWonB: number;
  ganador: Duelo2v2Ganador | null;
  setOutcomes: SetOutcome[];
  canFinalize: boolean;
  gamesTotalA: number;
  gamesTotalB: number;
}

export function parseSetGames(value: string): number {
  const n = parseInt(value.trim(), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(99, n);
}

export function setOutcome(a: number, b: number): SetOutcome {
  if (a <= 0 && b <= 0) return "incompleto";
  if (a === b) return "empate";
  return a > b ? "a" : "b";
}

export function computeDueloScore(
  detalle: Duelo2v2SetDetalle[]
): DueloScoreSummary {
  let setsWonA = 0;
  let setsWonB = 0;
  let gamesTotalA = 0;
  let gamesTotalB = 0;
  const setOutcomes: SetOutcome[] = [];

  for (const row of detalle) {
    const a = Math.max(0, Math.floor(row.a));
    const b = Math.max(0, Math.floor(row.b));
    gamesTotalA += a;
    gamesTotalB += b;

    const outcome = setOutcome(a, b);
    setOutcomes.push(outcome);

    if (outcome === "a") setsWonA += 1;
    else if (outcome === "b") setsWonB += 1;
  }

  let ganador: Duelo2v2Ganador | null = null;
  if (setsWonA >= 2 && setsWonA > setsWonB) ganador = "a";
  else if (setsWonB >= 2 && setsWonB > setsWonA) ganador = "b";

  return {
    detalle,
    setsWonA,
    setsWonB,
    ganador,
    setOutcomes,
    canFinalize: ganador !== null,
    gamesTotalA,
    gamesTotalB,
  };
}

export function draftRowsToDetalle(rows: SetRowDraft[]): Duelo2v2SetDetalle[] {
  return rows
    .map((row) => ({
      a: parseSetGames(row.a),
      b: parseSetGames(row.b),
    }))
    .filter((row) => row.a > 0 || row.b > 0);
}

export const DUEL0_MAX_SETS = 5;
export const DUEL0_SETS_TO_WIN = 2;

export function canAddAnotherDueloSet(rows: SetRowDraft[]): boolean {
  if (rows.length >= DUEL0_MAX_SETS) return false;
  return summarizeDraftRows(rows).ganador === null;
}

export function canRemoveLastDueloSet(rowCount: number): boolean {
  return rowCount > 1;
}

export function detalleToDraftRows(
  detalle: Duelo2v2SetDetalle[],
  minRows = 1
): SetRowDraft[] {
  const rows: SetRowDraft[] = detalle.map((s) => ({
    a: s.a > 0 ? String(s.a) : "",
    b: s.b > 0 ? String(s.b) : "",
  }));
  while (rows.length < minRows) {
    rows.push({ a: "", b: "" });
  }
  return rows;
}

export function summarizeDraftRows(rows: SetRowDraft[]): DueloScoreSummary {
  return computeDueloScore(draftRowsToDetalle(rows));
}

/** Mensaje de ayuda / error según el estado del marcador. */
export function dueloScoreHint(summary: DueloScoreSummary): string {
  if (summary.canFinalize) {
    const name = summary.ganador === "a" ? "Pareja 1" : "Pareja 2";
    return `${name} gana el encuentro (${summary.setsWonA}–${summary.setsWonB} en sets). Puedes finalizar.`;
  }

  const decisive = summary.setOutcomes.filter(
    (o) => o === "a" || o === "b"
  ).length;
  const ties = summary.setOutcomes.filter((o) => o === "empate").length;

  if (summary.setsWonA === 1 && summary.setsWonB === 1) {
    if (ties > 0) {
      return "Van 1–1 en sets. El set decisivo no puede quedar empatado: registra un ganador en el Set 3.";
    }
    return "Van 1–1 en sets. Completa el Set 3 con ganador para declarar al campeón.";
  }

  if (ties > 0 && decisive < 2) {
    return "Un set empatado no suma al marcador. Gana el encuentro quien gane 2 sets decididos (al mejor de 3).";
  }

  if (decisive === 0) {
    return "Registra los juegos de cada set (ej. 6–4). Gana el encuentro quien gane 2 de 3 sets.";
  }

  return `Sets ganados: ${summary.setsWonA}–${summary.setsWonB}. Falta que una pareja llegue a 2 sets ganados.`;
}

export function formatSetScoreLine(
  index: number,
  row: Duelo2v2SetDetalle,
  outcome: SetOutcome
): string {
  const label = `Set ${index + 1}`;
  if (outcome === "incompleto") return `${label}: —`;
  if (outcome === "empate") return `${label}: ${row.a}–${row.b} (empate)`;
  return `${label}: ${row.a}–${row.b}`;
}

export interface TeamSetResult {
  setNumber: number;
  gamesFor: number;
  gamesAgainst: number;
  won: boolean;
}

/** Sets jugados desde la perspectiva de una pareja (a o b). */
export function getTeamSetResults(
  detalle: Duelo2v2SetDetalle[],
  side: "a" | "b"
): TeamSetResult[] {
  const summary = computeDueloScore(detalle);
  const results: TeamSetResult[] = [];

  detalle.forEach((row, index) => {
    const outcome = summary.setOutcomes[index] ?? "incompleto";
    if (outcome === "incompleto") return;

    const gamesFor = side === "a" ? row.a : row.b;
    const gamesAgainst = side === "a" ? row.b : row.a;
    results.push({
      setNumber: index + 1,
      gamesFor,
      gamesAgainst,
      won: outcome === side,
    });
  });

  return results;
}

export function getWonSetsForSide(
  detalle: Duelo2v2SetDetalle[],
  side: "a" | "b"
): TeamSetResult[] {
  return getTeamSetResults(detalle, side).filter((r) => r.won);
}
