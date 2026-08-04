/**
 * Orquesta la generación del siguiente bloque de "Equipos con alineación
 * dinámica": lee el rendimiento acumulado, balancea las nuevas parejas
 * dentro de cada equipo (`dynamicTeamLineups.ts`), las persiste como filas
 * reales de `pairs`/`matches` (mismas funciones que usa Equipos clásico), y
 * confirma el bloque vía los RPC idempotentes de
 * `dynamicTeamBlocksApi.ts`. Capa separada de `CircleRoundRobinScheduler` --
 * no lo modifica. Solo genera rondas dinámicas (bloque 2 en adelante) -- el
 * bloque 1 (Round Robin inicial) se genera en `useTournamentActions.tsx` al
 * iniciar la reta.
 */
import type { Tournament, Pair, Match } from "../database";
import { createPair, createMatch, getTournamentGames } from "../database";
import { computePairsWithStats } from "../standingsUtils";
import {
  computePlayerPerformance,
  computePartnerCounts,
  computeIndividualOpponentCounts,
  generateDynamicTeamsBlock,
  canGenerateNextDynamicBlock,
  type TeamPairingResult,
  type PlayerPair,
} from "./dynamicTeamLineups";
import {
  beginDynamicTeamBlock,
  commitDynamicTeamBlock,
  getDynamicTeamBlocks,
  retryDynamicTeamBlock,
} from "./dynamicTeamBlocksApi";

export type GenerateNextDynamicBlockResult =
  | { status: "generated"; blockNumber: number }
  | { status: "not_eligible"; reason?: string }
  | { status: "already_claimed" }
  | { status: "not_dynamic" }
  | { status: "error"; message: string };

async function createLineupPairs(
  tournamentId: string,
  lineup: TeamPairingResult,
  userId: string
): Promise<Pair[]> {
  const created: Pair[] = [];
  for (const [player1Id, player2Id] of lineup.pairs) {
    created.push(await createPair(tournamentId, player1Id, player2Id, userId));
  }
  return created;
}

function findPairIdForPlayerPair(playerPair: PlayerPair, candidates: Pair[]): string {
  const found = candidates.find(
    (p) =>
      (p.player1_id === playerPair[0] && p.player2_id === playerPair[1]) ||
      (p.player1_id === playerPair[1] && p.player2_id === playerPair[0])
  );
  if (!found) {
    throw new Error("No se encontró la pareja creada para el cruce del bloque.");
  }
  return found.id;
}

export async function generateNextDynamicBlock(params: {
  tournament: Tournament;
  pairs: Pair[];
  matches: Match[];
  userId: string;
}): Promise<GenerateNextDynamicBlockResult> {
  const { tournament, pairs, matches, userId } = params;
  const dyn = tournament.team_config?.dynamicLineups;
  if (!dyn?.enabled) return { status: "not_dynamic" };

  const blocks = await getDynamicTeamBlocks(tournament.id);
  const completedBlocks = blocks
    .filter((b) => b.status === "completed")
    .sort((a, b) => a.block_number - b.block_number);
  const currentBlock = completedBlocks[completedBlocks.length - 1];
  if (!currentBlock) return { status: "not_eligible", reason: "no_blocks" };

  const nextBlockNumber = currentBlock.block_number + 1;
  const existingNextBlock = blocks.find((b) => b.block_number === nextBlockNumber);
  const currentBlockMatches = matches.filter(
    (m) =>
      (m.round ?? 0) >= currentBlock.round_start &&
      (m.round ?? 0) <= currentBlock.round_end
  );

  // Auto-recuperación: si el intento anterior reclamó el bloque pero nunca
  // llegó a crear partidos (pestaña cerrada a mitad de la generación), se
  // libera automáticamente antes de reintentar -- así la única acción visible
  // en la UI ("Generar siguiente bloque") siempre es segura de repetir.
  let nextAlreadyGenerated = existingNextBlock != null;
  if (existingNextBlock?.status === "generating") {
    const hasMatches = matches.some(
      (m) =>
        (m.round ?? 0) >= existingNextBlock.round_start &&
        (m.round ?? 0) <= existingNextBlock.round_end
    );
    if (!hasMatches) {
      await retryDynamicTeamBlock({
        tournamentId: tournament.id,
        blockNumber: nextBlockNumber,
      });
      nextAlreadyGenerated = false;
    }
  }

  const check = canGenerateNextDynamicBlock({
    tournamentFinished: tournament.is_finished,
    totalRounds: dyn.totalRounds,
    pairsPerTeam: dyn.pairsPerTeam,
    currentBlockNumber: currentBlock.block_number,
    currentBlockMatches,
    nextBlockAlreadyGenerated: nextAlreadyGenerated,
  });
  if (!check.canGenerate) return { status: "not_eligible", reason: check.reason };

  const allGames = await getTournamentGames(tournament.id);
  const pairsWithStats = computePairsWithStats(pairs, matches, allGames);
  const performance = computePlayerPerformance(pairsWithStats);
  const opponentCounts = computeIndividualOpponentCounts(pairs, matches);

  const teamIndexes = Array.from(new Set(Object.values(dyn.playerToTeam))).sort(
    (a, b) => a - b
  );
  const [teamAIndex, teamBIndex] = teamIndexes;
  const teamAPlayers = Object.entries(dyn.playerToTeam)
    .filter(([, t]) => t === teamAIndex)
    .map(([id]) => id);
  const teamBPlayers = Object.entries(dyn.playerToTeam)
    .filter(([, t]) => t === teamBIndex)
    .map(([id]) => id);
  const teamAPlayerIds = new Set(teamAPlayers);
  const teamBPlayerIds = new Set(teamBPlayers);

  const partnerCountsFor = (playerIds: Set<string>) =>
    computePartnerCounts(
      pairs.filter((p) => playerIds.has(p.player1_id) && playerIds.has(p.player2_id))
    );

  const previousRoundPairKeysFor = (teamIdx: number): string[] => {
    const lineup = currentBlock.teams.find((t) => t.teamIndex === teamIdx)?.lineup;
    if (!lineup) return [];
    return lineup.pairs.map((p) => [...p].sort().join("+"));
  };

  const roundStart = currentBlock.round_end + 1;
  const begin = await beginDynamicTeamBlock({
    tournamentId: tournament.id,
    blockNumber: nextBlockNumber,
    roundStart,
    roundEnd: roundStart,
    stage: "dynamic_round",
  });
  if (begin.status !== "claimed") {
    if (begin.status === "already_claimed") return { status: "already_claimed" };
    return { status: "error", message: begin.status };
  }

  const plan = generateDynamicTeamsBlock({
    blockNumber: nextBlockNumber,
    pairsPerTeam: dyn.pairsPerTeam,
    courts: tournament.courts,
    performance,
    opponentCounts,
    teamA: {
      teamIndex: teamAIndex,
      players: teamAPlayers,
      partnerCounts: partnerCountsFor(teamAPlayerIds),
      previousRoundPairKeys: previousRoundPairKeysFor(teamAIndex),
    },
    teamB: {
      teamIndex: teamBIndex,
      players: teamBPlayers,
      partnerCounts: partnerCountsFor(teamBPlayerIds),
      previousRoundPairKeys: previousRoundPairKeysFor(teamBIndex),
    },
  });

  const teamACreated = await createLineupPairs(tournament.id, plan.teamA.lineup, userId);
  const teamBCreated = await createLineupPairs(tournament.id, plan.teamB.lineup, userId);
  const createdPairs = [...teamACreated, ...teamBCreated];

  for (const cross of plan.crossMatches) {
    await createMatch(
      tournament.id,
      findPairIdForPlayerPair(cross.teamAPair, createdPairs),
      findPairIdForPlayerPair(cross.teamBPair, createdPairs),
      cross.court,
      cross.round,
      userId
    );
  }

  const pairToTeamDelta: Record<string, number> = {};
  teamACreated.forEach((p) => {
    pairToTeamDelta[p.id] = teamAIndex;
  });
  teamBCreated.forEach((p) => {
    pairToTeamDelta[p.id] = teamBIndex;
  });

  const commitResult = await commitDynamicTeamBlock({
    blockId: begin.blockId,
    teams: [plan.teamA, plan.teamB],
    pairToTeamDelta,
  });

  // Auditoría 2026-08-04 (ventana begin -> commit): el resultado de
  // commitDynamicTeamBlock NO se validaba -- si el commit era rechazado
  // (bloque borrado, error de red respondido como error explícito, etc.),
  // esta función igual devolvía "generated", reportando éxito falso a la UI
  // aunque el bloque quedara sin confirmar en BD (pairToTeam sin actualizar,
  // partidos ya creados pero no contabilizados en standings). Los partidos
  // y parejas YA se crearon en este punto -- no se revierten aquí (ver
  // riesgos documentados: requiere recuperación administrativa manual, no
  // automática, si el bloque queda "generating" con partidos reales).
  if (commitResult.status === "error") {
    return { status: "error", message: commitResult.message };
  }
  if (commitResult.status === "not_found") {
    return {
      status: "error",
      message: "No se pudo confirmar el bloque generado (registro no encontrado).",
    };
  }

  return { status: "generated", blockNumber: nextBlockNumber };
}
