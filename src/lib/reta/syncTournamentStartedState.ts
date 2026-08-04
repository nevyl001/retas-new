/**
 * Recupera `is_started` cuando la competencia ya existe en BD pero el flag
 * quedó en false (p.ej. begin already_claimed / commit parcial / fallo al
 * persistir format+team_config). Misma fuente canónica que Equipos clásico:
 * `tournaments.is_started`, alineada con partidos reales.
 */
import {
  getMatches,
  getTournamentById,
  getTournamentPublicConfig,
  updateTournament,
  type Tournament,
  type TournamentTeamConfig,
} from "../database";
import { getDynamicTeamBlocks } from "./dynamicTeamBlocksApi";

export type DynamicStartRecovery =
  | {
      status: "recovered";
      tournament: Tournament;
    }
  /** Bloque 1 existe pero sin partidos: hay que liberarlo y regenerar. */
  | { status: "orphan_block" }
  | { status: "inconsistent"; message: string };

function resolveTeamConfig(
  tournament: Tournament | null | undefined,
  publicTeamConfig: TournamentTeamConfig | null | undefined
): TournamentTeamConfig | undefined {
  if (
    tournament?.team_config?.teamNames?.length &&
    tournament.team_config.pairToTeam &&
    Object.keys(tournament.team_config.pairToTeam).length > 0
  ) {
    return tournament.team_config;
  }
  if (
    publicTeamConfig?.teamNames?.length &&
    publicTeamConfig.pairToTeam &&
    Object.keys(publicTeamConfig.pairToTeam).length > 0
  ) {
    return publicTeamConfig;
  }
  return tournament?.team_config ?? publicTeamConfig ?? undefined;
}

/**
 * Si hay partidos y el torneo aún no está marcado iniciado, persiste
 * `is_started: true` (y rehidrata format/team_config si hace falta).
 * Usado al abrir una reta y al recuperar already_claimed.
 */
export async function ensureTournamentStartedIfMatchesExist(
  tournament: Tournament
): Promise<Tournament> {
  if (tournament.is_started) {
    const fresh = await getTournamentById(tournament.id);
    if (!fresh) return tournament;
    const pub = await getTournamentPublicConfig(tournament.id);
    const team_config = resolveTeamConfig(fresh, pub?.team_config ?? null);
    return {
      ...tournament,
      ...fresh,
      ...(team_config ? { format: "teams" as const, team_config } : {}),
    };
  }

  const matches = await getMatches(tournament.id);
  if (matches.length === 0) return tournament;

  const fresh = await getTournamentById(tournament.id);
  const pub = await getTournamentPublicConfig(tournament.id);
  const team_config = resolveTeamConfig(
    fresh ?? tournament,
    pub?.team_config ?? null
  );

  const updates: Partial<Tournament> = { is_started: true };
  if (team_config) {
    updates.format = "teams";
    updates.team_config = team_config;
  } else if (fresh?.format === "teams" || pub?.format === "teams") {
    updates.format = "teams";
  }

  try {
    const saved = await updateTournament(tournament.id, updates);
    return {
      ...tournament,
      ...(fresh ?? {}),
      ...saved,
      is_started: true,
      ...(team_config ? { format: "teams" as const, team_config } : {}),
    };
  } catch {
    return {
      ...tournament,
      ...(fresh ?? {}),
      is_started: true,
      ...(team_config ? { format: "teams" as const, team_config } : {}),
    };
  }
}

/**
 * Recuperación cuando begin_dynamic_team_block responde already_claimed.
 * - Con partidos: entra a competencia.
 * - Sin partidos (bloque huérfano tras reset): el llamador debe liberar y regenerar.
 */
export async function recoverAlreadyClaimedDynamicStart(
  tournamentId: string,
  fallback: Tournament
): Promise<DynamicStartRecovery> {
  const [blocks, matches, fresh, pub] = await Promise.all([
    getDynamicTeamBlocks(tournamentId),
    getMatches(tournamentId),
    getTournamentById(tournamentId),
    getTournamentPublicConfig(tournamentId),
  ]);

  const block1 = blocks.find((b) => b.block_number === 1);
  const team_config = resolveTeamConfig(fresh ?? fallback, pub?.team_config ?? null);

  if (!block1) {
    return {
      status: "inconsistent",
      message:
        "El bloque 1 está reservado pero no se encontró en la base. No se puede recuperar automáticamente.",
    };
  }

  if (matches.length === 0) {
    return { status: "orphan_block" };
  }

  const base: Tournament = {
    ...fallback,
    ...(fresh ?? {}),
    format: "teams",
    ...(team_config ? { team_config } : {}),
  };

  const recovered = await ensureTournamentStartedIfMatchesExist({
    ...base,
    is_started: false,
  });
  return {
    status: "recovered",
    tournament: { ...recovered, is_started: true },
  };
}
