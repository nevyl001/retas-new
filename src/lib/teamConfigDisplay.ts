import type { Tournament, TournamentTeamConfig } from "./db/types";
import {
  getTournamentById,
  getTournamentPublicConfigExtended,
} from "./database";
import { isTeamsTournament } from "./gameModeMapping";
import { getTeamConfigFromStorage } from "./standingsUtils";

export type TeamConfigLike = Pick<TournamentTeamConfig, "teamNames" | "pairToTeam">;

export function isCompleteTeamConfigLike(
  config: TeamConfigLike | TournamentTeamConfig | null | undefined
): config is TeamConfigLike {
  return !!(
    config?.teamNames?.length &&
    config?.pairToTeam &&
    Object.keys(config.pairToTeam).length > 0
  );
}

function pickFirstCompleteTeamConfig(
  ...sources: (TeamConfigLike | TournamentTeamConfig | null | undefined)[]
): TeamConfigLike | null {
  for (const source of sources) {
    if (isCompleteTeamConfigLike(source)) return source;
  }
  return null;
}

/** Síncrono: torneo en memoria → localStorage (solo si no es round robin explícito). */
export function resolveEffectiveTeamConfig(
  tournament: Pick<Tournament, "id" | "format" | "team_config"> | null | undefined
): TeamConfigLike | null {
  if (!tournament) return null;

  if (isCompleteTeamConfigLike(tournament.team_config)) {
    return tournament.team_config;
  }

  const stored = getTeamConfigFromStorage(tournament.id);
  if (isCompleteTeamConfigLike(stored) && tournament.format !== "round_robin") {
    return stored;
  }

  if (isTeamsTournament(tournament) && isCompleteTeamConfigLike(stored)) {
    return stored;
  }

  return null;
}

/** Admin / organizador: misma fuente que la vista pública (config pública + BD + localStorage). */
export async function loadTeamConfigForTournament(
  tournament: Pick<Tournament, "id" | "format" | "team_config"> | null | undefined
): Promise<TeamConfigLike | null> {
  if (!tournament?.id) return null;

  const sync = resolveEffectiveTeamConfig(tournament);
  if (sync) return sync;

  try {
    const [publicCfg, freshTournament] = await Promise.all([
      getTournamentPublicConfigExtended(tournament.id),
      getTournamentById(tournament.id),
    ]);

    return pickFirstCompleteTeamConfig(
      publicCfg?.team_config,
      freshTournament?.team_config,
      getTeamConfigFromStorage(tournament.id)
    );
  } catch {
    return getTeamConfigFromStorage(tournament.id);
  }
}

export function getPairTeamIndex(
  pairId: string,
  config: TeamConfigLike | null | undefined
): number | null {
  if (!config?.pairToTeam || !config.teamNames?.length) return null;
  const idx = config.pairToTeam[pairId];
  if (typeof idx !== "number" || idx < 0 || idx >= config.teamNames.length) {
    return null;
  }
  return idx;
}

export function getPairTeamName(
  pairId: string,
  config: TeamConfigLike | null | undefined
): string | null {
  const idx = getPairTeamIndex(pairId, config);
  if (idx == null || !config) return null;
  const name = config.teamNames[idx]?.trim();
  return name || `Equipo ${idx + 1}`;
}
