import type { Game, Match, Pair, Tournament } from "./db/types";
import {
  createMatch,
  getGames,
  getMatches,
  getTournamentPublicConfigExtended,
} from "./database";
import { assignCourtsInChunk } from "./circleRoundRobinSchedule";
import {
  computePairsWithStats,
  sortPairsForStandings,
} from "./standingsUtils";

/** Rondas de campeonato usan round >= este offset (no colisionan con RR regular). */
export const CHAMPIONSHIP_ROUND_OFFSET = 10_000;

const CONFIG_KEY_PREFIX = "rivieraapp_championship_";
const MATCH_TYPE_KEY_PREFIX = "rivieraapp_match_type_";

export type RoundRobinMatchType = "roundrobin" | "championship";

export interface RoundRobinChampionshipConfig {
  championshipEnabled: boolean;
  championshipRounds: number;
  championshipRoundsGenerated: number;
  /** Última ronda del RR regular; partidos con round > este valor son remontada. */
  regularRoundsMax?: number;
}

const DEFAULT_CONFIG: RoundRobinChampionshipConfig = {
  championshipEnabled: false,
  championshipRounds: 2,
  championshipRoundsGenerated: 0,
};

export function parseChampionshipConfig(
  raw: unknown
): RoundRobinChampionshipConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as Partial<RoundRobinChampionshipConfig>;
  if (!parsed.championshipEnabled) return null;
  return {
    championshipEnabled: true,
    championshipRounds: clampChampionshipRounds(
      parsed.championshipRounds ?? DEFAULT_CONFIG.championshipRounds
    ),
    championshipRoundsGenerated: Math.max(
      0,
      Math.floor(parsed.championshipRoundsGenerated ?? 0)
    ),
    regularRoundsMax:
      parsed.regularRoundsMax != null
        ? Math.max(0, Math.floor(parsed.regularRoundsMax))
        : undefined,
  };
}

export function loadChampionshipConfig(
  tournamentId: string | undefined | null
): RoundRobinChampionshipConfig | null {
  if (!tournamentId) return null;
  try {
    const raw = localStorage.getItem(`${CONFIG_KEY_PREFIX}${tournamentId}`);
    if (!raw) return null;
    return parseChampionshipConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Trae config de remontada desde Supabase si falta o está desactualizada en localStorage. */
export async function syncChampionshipConfigFromPublic(
  tournamentId: string
): Promise<RoundRobinChampionshipConfig | null> {
  const local = loadChampionshipConfig(tournamentId);
  try {
    const pub = await getTournamentPublicConfigExtended(tournamentId);
    const remote = parseChampionshipConfig(pub?.championship_config);
    if (!remote) return local;

    if (!local) {
      saveChampionshipConfig(tournamentId, remote);
      return remote;
    }

    if (
      !local.championshipEnabled &&
      remote.championshipEnabled
    ) {
      const merged: RoundRobinChampionshipConfig = {
        ...local,
        championshipEnabled: true,
        championshipRounds: remote.championshipRounds,
        regularRoundsMax: local.regularRoundsMax ?? remote.regularRoundsMax,
      };
      saveChampionshipConfig(tournamentId, merged);
      return merged;
    }

    return local;
  } catch {
    return local;
  }
}

function countChampionshipRoundsGenerated(
  championship: Match[],
  regular: Match[],
  cfg: RoundRobinChampionshipConfig
): number {
  if (!championship.length) return 0;
  const regularMax = resolveRegularRoundsMax(regular, cfg);
  const indices = new Set<number>();
  for (const m of championship) {
    const idx = championshipRoundIndex(m.round ?? 0, regularMax);
    if (idx > 0) indices.add(idx);
  }
  return indices.size > 0 ? Math.max(...Array.from(indices)) : 0;
}

function reconcileChampionshipConfig(
  tournamentId: string,
  cfg: RoundRobinChampionshipConfig,
  regular: Match[],
  championship: Match[]
): RoundRobinChampionshipConfig {
  const actualGenerated = countChampionshipRoundsGenerated(
    championship,
    regular,
    cfg
  );
  if (actualGenerated === cfg.championshipRoundsGenerated) {
    return cfg;
  }
  const fixed: RoundRobinChampionshipConfig = {
    ...cfg,
    championshipRoundsGenerated: actualGenerated,
    regularRoundsMax:
      cfg.regularRoundsMax ?? resolveRegularRoundsMax(regular, cfg),
  };
  saveChampionshipConfig(tournamentId, fixed);
  console.info(
    `[remontada-final] Contador de rondas corregido: ${cfg.championshipRoundsGenerated} → ${actualGenerated}`
  );
  return fixed;
}

let warnedMissingChampionshipColumn = false;

/** Publica config de remontada para la vista pública (anon). */
export async function syncChampionshipConfigPublic(
  tournamentId: string,
  config: RoundRobinChampionshipConfig
): Promise<void> {
  if (!config.championshipEnabled) return;

  try {
    const { supabase } = await import("./supabaseClient");
    const { data: existing } = await supabase
      .from("tournament_public_config")
      .select("*")
      .eq("tournament_id", tournamentId)
      .maybeSingle();

    const basePayload = {
      tournament_id: tournamentId,
      format: (existing?.format as string) || "round_robin",
      team_config: existing?.team_config ?? null,
    };

    const { error: baseError } = await supabase
      .from("tournament_public_config")
      .upsert(basePayload, { onConflict: "tournament_id" });

    if (baseError) {
      console.warn("[remontada-final] sync public config (base):", baseError.message);
      return;
    }

    const { data: row, error: readError } = await supabase
      .from("tournament_public_config")
      .select("*")
      .eq("tournament_id", tournamentId)
      .maybeSingle();

    if (readError || !row || !("championship_config" in row)) {
      if (!warnedMissingChampionshipColumn) {
        warnedMissingChampionshipColumn = true;
        console.info(
          "[remontada-final] La columna championship_config no está en Supabase; la remontada sigue en localStorage. Ejecuta supabase/tournament-public-config-championship.sql si quieres publicarla."
        );
      }
      return;
    }

    const { error: champError } = await supabase
      .from("tournament_public_config")
      .update({
        championship_config: {
          championshipEnabled: config.championshipEnabled,
          championshipRounds: config.championshipRounds,
          championshipRoundsGenerated: config.championshipRoundsGenerated,
          regularRoundsMax: config.regularRoundsMax,
        },
      })
      .eq("tournament_id", tournamentId);

    if (champError) {
      console.warn("[remontada-final] sync championship_config:", champError.message);
    }
  } catch (e) {
    console.warn("[remontada-final] sync public config:", e);
  }
}

export function saveChampionshipConfig(
  tournamentId: string,
  config: RoundRobinChampionshipConfig
): void {
  localStorage.setItem(
    `${CONFIG_KEY_PREFIX}${tournamentId}`,
    JSON.stringify({
      championshipEnabled: config.championshipEnabled,
      championshipRounds: clampChampionshipRounds(config.championshipRounds),
      championshipRoundsGenerated: Math.max(
        0,
        Math.floor(config.championshipRoundsGenerated)
      ),
      regularRoundsMax: config.regularRoundsMax,
    })
  );
  void syncChampionshipConfigPublic(tournamentId, config);
}

export function initChampionshipConfig(
  tournamentId: string,
  opts: { enabled: boolean; rounds: number }
): RoundRobinChampionshipConfig {
  const config: RoundRobinChampionshipConfig = {
    championshipEnabled: opts.enabled,
    championshipRounds: clampChampionshipRounds(opts.rounds),
    championshipRoundsGenerated: 0,
  };
  saveChampionshipConfig(tournamentId, config);
  return config;
}

export function clampChampionshipRounds(value: number): number {
  return Math.min(10, Math.max(1, Math.floor(value) || 2));
}

export function isChampionshipRoundNumber(round: number | undefined): boolean {
  return (round ?? 0) >= CHAMPIONSHIP_ROUND_OFFSET;
}

export function resolveRegularRoundsMax(
  regular: Match[],
  cfg: RoundRobinChampionshipConfig | null | undefined
): number {
  if (cfg?.regularRoundsMax != null && cfg.regularRoundsMax > 0) {
    return cfg.regularRoundsMax;
  }
  if (!regular.length) return 0;
  return Math.max(...regular.map((m) => m.round ?? 1));
}

export function championshipRoundIndex(
  round: number,
  regularRoundsMax?: number
): number {
  if (regularRoundsMax != null && regularRoundsMax > 0) {
    return round - regularRoundsMax;
  }
  if (isChampionshipRoundNumber(round)) {
    return round - CHAMPIONSHIP_ROUND_OFFSET;
  }
  return round;
}

export function championshipRoundDbNumber(
  index: number,
  regular: Match[],
  cfg: RoundRobinChampionshipConfig | null | undefined
): number {
  return resolveRegularRoundsMax(regular, cfg) + index;
}

export function getMatchType(
  match: Match & { match_type?: string | null },
  cfg?: RoundRobinChampionshipConfig | null
): RoundRobinMatchType {
  if (match.match_type === "championship") return "championship";
  if (isChampionshipRoundNumber(match.round)) return "championship";
  if (
    cfg?.regularRoundsMax != null &&
    (match.round ?? 0) > cfg.regularRoundsMax
  ) {
    return "championship";
  }
  try {
    const stored = localStorage.getItem(`${MATCH_TYPE_KEY_PREFIX}${match.id}`);
    if (stored === "championship") return "championship";
  } catch {
    /* ignore */
  }
  return "roundrobin";
}

export function persistMatchType(
  matchId: string,
  type: RoundRobinMatchType
): void {
  try {
    localStorage.setItem(`${MATCH_TYPE_KEY_PREFIX}${matchId}`, type);
  } catch {
    /* ignore */
  }
}

/** Infiere regularRoundsMax para vista pública (sin localStorage). */
export function enrichChampionshipConfigForPartition(
  matches: Match[],
  cfg: RoundRobinChampionshipConfig | null | undefined
): RoundRobinChampionshipConfig | null | undefined {
  if (!matches.length) return cfg;

  if (cfg?.regularRoundsMax != null && cfg.regularRoundsMax > 0) {
    return cfg;
  }

  const withExplicitType = matches.filter(
    (m) =>
      m.match_type === "championship" || isChampionshipRoundNumber(m.round)
  );
  if (withExplicitType.length > 0) {
    const minChampRound = Math.min(
      ...withExplicitType.map((m) => m.round ?? CHAMPIONSHIP_ROUND_OFFSET)
    );
    let regularRoundsMax = minChampRound - 1;
    if (isChampionshipRoundNumber(minChampRound)) {
      const regularOnly = matches.filter(
        (m) => !isChampionshipRoundNumber(m.round)
      );
      regularRoundsMax = regularOnly.length
        ? Math.max(...regularOnly.map((m) => m.round ?? 1))
        : 0;
    }
    if (regularRoundsMax > 0) {
      return {
        championshipEnabled: true,
        championshipRounds:
          cfg?.championshipRounds ?? DEFAULT_CONFIG.championshipRounds,
        championshipRoundsGenerated:
          cfg?.championshipRoundsGenerated ??
          new Set(withExplicitType.map((m) => m.round)).size,
        regularRoundsMax,
      };
    }
  }

  if (cfg?.championshipEnabled && (cfg.championshipRoundsGenerated ?? 0) > 0) {
    const maxRound = Math.max(...matches.map((m) => m.round ?? 1));
    const inferred = maxRound - cfg.championshipRoundsGenerated;
    if (inferred > 0) {
      return { ...cfg, regularRoundsMax: inferred };
    }
  }

  const pairIds = new Set<string>();
  for (const m of matches) {
    pairIds.add(m.pair1_id);
    pairIds.add(m.pair2_id);
  }
  const pairCount = pairIds.size;
  if (pairCount >= 2) {
    const expectedRegularRounds = pairCount - 1;
    const maxRound = Math.max(...matches.map((m) => m.round ?? 1));
    if (maxRound > expectedRegularRounds) {
      return {
        championshipEnabled: true,
        championshipRounds: maxRound - expectedRegularRounds,
        championshipRoundsGenerated: maxRound - expectedRegularRounds,
        regularRoundsMax: expectedRegularRounds,
      };
    }
  }

  return cfg;
}

export function partitionMatches(
  matches: Match[],
  tournamentId?: string | null,
  configOverride?: RoundRobinChampionshipConfig | null
): {
  regular: Match[];
  championship: Match[];
} {
  const rawCfg =
    configOverride !== undefined
      ? configOverride
      : tournamentId
        ? loadChampionshipConfig(tournamentId)
        : null;
  const cfg = enrichChampionshipConfigForPartition(matches, rawCfg);
  const regular: Match[] = [];
  const championship: Match[] = [];
  for (const m of matches) {
    if (getMatchType(m, cfg) === "championship") championship.push(m);
    else regular.push(m);
  }
  return { regular, championship };
}

export function areAllMatchesFinished(list: Match[]): boolean {
  return list.length > 0 && list.every((m) => m.status === "finished");
}

export function isRoundRobinChampionshipActive(
  tournament: Tournament | null | undefined
): boolean {
  if (!tournament?.id) return false;
  if (tournament.format === "teams") return false;
  const cfg = loadChampionshipConfig(tournament.id);
  return Boolean(cfg?.championshipEnabled);
}

export function isRoundRobinTournamentComplete(
  matches: Match[],
  tournament: Tournament | null | undefined,
  configOverride?: RoundRobinChampionshipConfig | null
): boolean {
  if (!matches.length || !tournament?.id) return false;

  const cfg =
    configOverride !== undefined
      ? configOverride
      : loadChampionshipConfig(tournament.id);
  const { regular, championship } = partitionMatches(
    matches,
    tournament.id,
    cfg
  );

  if (!cfg?.championshipEnabled) {
    return areAllMatchesFinished(regular.length ? regular : matches);
  }

  if (!areAllMatchesFinished(regular)) return false;
  if (cfg.championshipRoundsGenerated < cfg.championshipRounds) return false;
  return areAllMatchesFinished(championship);
}

export function buildChampionshipMatchups(
  rankedPairIds: string[]
): Array<[string, string]> {
  const matchups: Array<[string, string]> = [];
  if (rankedPairIds.length >= 2) {
    matchups.push([rankedPairIds[0], rankedPairIds[1]]);
  }
  if (rankedPairIds.length >= 4) {
    matchups.push([rankedPairIds[2], rankedPairIds[3]]);
  }
  return matchups;
}

async function loadAllGames(matches: Match[]): Promise<Game[]> {
  const all: Game[] = [];
  for (const m of matches) {
    try {
      const g = await getGames(m.id);
      all.push(...g);
    } catch {
      /* partido sin juegos */
    }
  }
  return all;
}

export async function maybeGenerateChampionshipRound(params: {
  tournament: Tournament;
  matches?: Match[];
  pairs: Pair[];
  userId: string;
}): Promise<Match[]> {
  const { tournament, pairs, userId } = params;
  if (!userId) {
    console.warn("[remontada-final] Sin userId; no se puede generar ronda.");
    return [];
  }

  await syncChampionshipConfigFromPublic(tournament.id);
  let cfg = loadChampionshipConfig(tournament.id);
  if (!cfg?.championshipEnabled) return [];
  if (pairs.length < 2) return [];

  const matches = await getMatches(tournament.id);
  let { regular, championship } = partitionMatches(
    matches,
    tournament.id,
    cfg
  );
  cfg = reconcileChampionshipConfig(
    tournament.id,
    cfg,
    regular,
    championship
  );

  if (cfg.championshipRoundsGenerated >= cfg.championshipRounds) {
    return [];
  }

  if (!areAllMatchesFinished(regular)) {
    const pending = regular.filter((m) => m.status !== "finished").length;
    console.log(
      `[remontada-final] RR aún en curso (${pending} partido(s) pendiente(s)).`
    );
    return [];
  }

  const regularMax = resolveRegularRoundsMax(regular, cfg);

  if (cfg.championshipRoundsGenerated > 0) {
    const lastRoundNum = championshipRoundDbNumber(
      cfg.championshipRoundsGenerated,
      regular,
      cfg
    );
    const lastRoundMatches = championship.filter(
      (m) => (m.round ?? 0) === lastRoundNum
    );
    if (!areAllMatchesFinished(lastRoundMatches)) return [];
  }

  const allGames = await loadAllGames(matches);
  const withStats = computePairsWithStats(pairs, matches, allGames);
  const ranked = sortPairsForStandings(withStats, matches, allGames);
  const matchups = buildChampionshipMatchups(ranked.map((p) => p.id));
  if (!matchups.length) return [];

  const nextIndex = cfg.championshipRoundsGenerated + 1;
  const roundNum = championshipRoundDbNumber(nextIndex, regular, cfg);
  const courts = Math.max(1, tournament.courts || 1);
  const created: Match[] = [];

  const pairById = new Map(pairs.map((p) => [p.id, p]));
  const chunk = matchups
    .map(([p1, p2]) => ({
      pair1: pairById.get(p1)!,
      pair2: pairById.get(p2)!,
    }))
    .filter((m) => m.pair1 && m.pair2);
  const courtsForChunk = assignCourtsInChunk(
    chunk,
    nextIndex,
    courts,
    ranked[0]?.id
  );

  for (let i = 0; i < matchups.length; i += 1) {
    const [p1, p2] = matchups[i];
    const court = courtsForChunk[i] ?? (i % courts) + 1;
    const row = await createMatch(
      tournament.id,
      p1,
      p2,
      court,
      roundNum,
      userId,
      "championship"
    );
    persistMatchType(row.id, "championship");
    created.push(row as Match);
  }

  saveChampionshipConfig(tournament.id, {
    ...cfg,
    championshipRoundsGenerated: nextIndex,
    regularRoundsMax: cfg.regularRoundsMax ?? regularMax,
  });

  console.log(
    `[remontada-final] Ronda ${nextIndex} generada: ${created.length} partido(s) (round DB ${roundNum}).`
  );

  return created;
}

export function groupChampionshipByRound(
  championshipMatches: Match[],
  regularRoundsMax?: number
): Record<number, Match[]> {
  const acc: Record<number, Match[]> = {};
  for (const m of championshipMatches) {
    const idx = championshipRoundIndex(
      m.round ?? CHAMPIONSHIP_ROUND_OFFSET,
      regularRoundsMax
    );
    if (!acc[idx]) acc[idx] = [];
    acc[idx].push(m);
  }
  return acc;
}

export async function resolveChampionPair(
  pairs: Pair[],
  matches: Match[]
): Promise<Pair | null> {
  if (!pairs.length || !matches.length) return null;
  const allGames = await loadAllGames(matches);
  const withStats = computePairsWithStats(pairs, matches, allGames);
  const ranked = sortPairsForStandings(withStats, matches, allGames);
  return ranked[0] ?? null;
}
