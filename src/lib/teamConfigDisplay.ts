import type { Tournament, TournamentTeamConfig } from "./db/types";
import {
  getTournamentById,
  getTournamentPublicConfigExtended,
} from "./database";
import { isTeamsTournament } from "./gameModeMapping";
import { getTeamConfigFromStorage } from "./standingsUtils";

export type TeamConfigLike = Pick<
  TournamentTeamConfig,
  "teamNames" | "pairToTeam" | "dynamicLineups"
>;

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
  config: TeamConfigLike | null | undefined,
  pairPlayers?: { player1_id?: string | null; player2_id?: string | null } | null
): number | null {
  if (!config?.teamNames?.length) return null;

  const direct = config.pairToTeam?.[pairId];
  if (
    typeof direct === "number" &&
    direct >= 0 &&
    direct < config.teamNames.length
  ) {
    return direct;
  }

  // Alineación dinámica: el jugador nunca cambia de equipo; si la pareja es
  // nueva y aún no está en pairToTeam (o el estado local está desfasado),
  // resolvemos por playerToTeam.
  const playerToTeam = config.dynamicLineups?.playerToTeam;
  if (!playerToTeam || !pairPlayers) return null;

  const t1 = pairPlayers.player1_id
    ? playerToTeam[pairPlayers.player1_id]
    : undefined;
  const t2 = pairPlayers.player2_id
    ? playerToTeam[pairPlayers.player2_id]
    : undefined;
  const resolved =
    typeof t1 === "number" && typeof t2 === "number" && t1 === t2
      ? t1
      : typeof t1 === "number"
        ? t1
        : typeof t2 === "number"
          ? t2
          : null;
  if (
    resolved == null ||
    resolved < 0 ||
    resolved >= config.teamNames.length
  ) {
    return null;
  }
  return resolved;
}

export function getPairTeamName(
  pairId: string,
  config: TeamConfigLike | null | undefined,
  pairPlayers?: { player1_id?: string | null; player2_id?: string | null } | null
): string | null {
  const idx = getPairTeamIndex(pairId, config, pairPlayers);
  if (idx == null || !config) return null;
  const name = config.teamNames[idx]?.trim();
  return name || `Equipo ${idx + 1}`;
}

/** Parejas candidatas a "descansan" acotadas al set de un bloque/ronda. */
export function pairsAppearingInMatches(
  pairs: PairLike[],
  scopeMatches: { pair1_id: string; pair2_id: string }[]
): PairLike[] {
  if (!scopeMatches.length) return [];
  const ids = new Set<string>();
  scopeMatches.forEach((m) => {
    ids.add(m.pair1_id);
    ids.add(m.pair2_id);
  });
  return pairs.filter((p) => ids.has(p.id));
}

type PairLike = { id: string };
