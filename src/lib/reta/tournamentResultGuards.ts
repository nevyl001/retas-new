import type { Game, Match } from "../database";

export type TournamentResultSnapshot = {
  /** Partidos con status finished o score agregado en matches. */
  matchLevelScored: number;
  /** Partidos que tienen al menos una fila en games (marcador parcial o completo). */
  gamesLevelScored: number;
  /** Unión: partidos con cualquier evidencia de resultado. */
  scoredMatchIds: string[];
  /** Filas de games consideradas con contenido de marcador. */
  scoredGameRows: number;
};

/**
 * Cualquier fila en `games` protege el partido: incluye parciales 0-0 / set
 * abierto aunque `matches.status` aún no sea `finished`.
 */
export function gameHasRecordedScore(
  _game: Pick<
    Game,
    | "pair1_games"
    | "pair2_games"
    | "is_tie_break"
    | "tie_break_pair1_points"
    | "tie_break_pair2_points"
  >
): boolean {
  return true;
}

export function matchHasAggregateScore(
  match: Pick<Match, "status" | "pair1_score" | "pair2_score">
): boolean {
  if (match.status === "finished") return true;
  if (match.pair1_score != null || match.pair2_score != null) return true;
  return false;
}

/**
 * Une evidencia de `matches` y de `games` (parciales aunque status ≠ finished).
 */
export function inspectTournamentResults(
  matches: Array<
    Pick<Match, "id" | "status" | "pair1_score" | "pair2_score">
  >,
  games: Array<
    Pick<
      Game,
      | "match_id"
      | "pair1_games"
      | "pair2_games"
      | "is_tie_break"
      | "tie_break_pair1_points"
      | "tie_break_pair2_points"
    >
  >
): TournamentResultSnapshot {
  const scored = new Set<string>();
  let matchLevelScored = 0;
  for (const m of matches) {
    if (matchHasAggregateScore(m)) {
      matchLevelScored += 1;
      scored.add(m.id);
    }
  }

  const matchIdsWithGames = new Set<string>();
  let scoredGameRows = 0;
  for (const g of games) {
    if (!g.match_id) continue;
    if (gameHasRecordedScore(g)) {
      scoredGameRows += 1;
      matchIdsWithGames.add(g.match_id);
      scored.add(g.match_id);
    }
  }

  return {
    matchLevelScored,
    gamesLevelScored: matchIdsWithGames.size,
    scoredMatchIds: Array.from(scored),
    scoredGameRows,
  };
}

export function buildResultsProtectionMessage(
  snapshot: TournamentResultSnapshot
): string {
  return [
    `Hay ${snapshot.scoredMatchIds.length} partido(s) con resultado (matches=${snapshot.matchLevelScored}, con games=${snapshot.gamesLevelScored}, filas games=${snapshot.scoredGameRows}).`,
    "No se regeneró el calendario para no perder resultados ni referencias.",
    "Plan de migración propuesto:",
    "1) Exportar respaldo JSON del calendario, matches y games actuales.",
    "2) Congelar partidos ya jugados (IDs estables de matches/games).",
    "3) Reprogramar solo rondas futuras sin marcador, o esperar OK para un replace total archivando primero.",
    "4) No reasignar IDs de partidos con games/scores asociados.",
  ].join("\n");
}
