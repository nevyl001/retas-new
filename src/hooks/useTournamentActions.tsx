import { useState } from "react";
import {
  Tournament,
  Pair,
  deleteMatchesByTournamentSafely,
  getTournamentById,
  updateTournament,
  upsertTournamentPublicConfig,
} from "../lib/database";
import { CircleRoundRobinScheduler } from "../components/CircleRoundRobinScheduler";
import {
  persistTournamentGameMode,
  persistTournamentMode,
  isAmericanoTournament,
} from "../lib/gameModeMapping";
import { debugLog } from "../lib/debug/debugLog";
import { closeOpenGameRegistration } from "../lib/retaAbierta/retaAbiertaService";
import { buildInitialDynamicLineupBlock, type PlayerPair } from "../lib/reta/dynamicTeamLineups";
import {
  beginDynamicTeamBlock,
  commitDynamicTeamBlock,
  retryDynamicTeamBlock,
} from "../lib/reta/dynamicTeamBlocksApi";
import {
  ensureTournamentStartedIfMatchesExist,
  recoverAlreadyClaimedDynamicStart,
} from "../lib/reta/syncTournamentStartedState";

type DynamicLineupsStartOpts = {
  enabled: boolean;
  totalRounds: number;
};

/**
 * Arranque de "Equipos con alineación dinámica" (bloque 1 = Round Robin
 * inicial de las parejas originales): reclama el block_number 1
 * (idempotente, ver 0010_dynamic_team_lineup_blocks.sql), genera el
 * calendario del Round Robin inicial reutilizando
 * `CircleRoundRobinScheduler.scheduleTournamentTeams` (ya genera
 * exactamente `pairsPerTeam` rondas con `pairsPerTeam` parejas por equipo —
 * la misma fórmula de rotación se usa para Equipos clásico), y persiste la
 * config estática de alineación dinámica junto con `team_config` (mismo
 * flujo que Equipos clásico, sin alterarlo). `pairsPerTeam` se deriva de
 * cuántas parejas trae cada equipo — no es un valor que el organizador elija
 * aparte.
 */
async function startDynamicLineupsTournament(params: {
  selectedTournament: Tournament;
  pairs: Pair[];
  userId: string;
  teamNames: string[];
  pairToTeam: Record<string, number>;
  dynamicLineups: DynamicLineupsStartOpts;
  setSelectedTournament: (tournament: Tournament | null) => void;
  loadTournamentData: (tournament?: Tournament) => void | Promise<void>;
  showToast: (message: string, type?: "success" | "error" | "info") => void;
  setError: (error: string) => void;
}): Promise<void> {
  const {
    selectedTournament,
    pairs,
    userId,
    teamNames,
    pairToTeam,
    dynamicLineups,
    setSelectedTournament,
    loadTournamentData,
    showToast,
    setError,
  } = params;

  const teamIndexes = Array.from(new Set(Object.values(pairToTeam))).sort(
    (a, b) => a - b
  );
  const teamAPairs = pairs.filter((p) => pairToTeam[p.id] === teamIndexes[0]);
  const teamBPairs = pairs.filter((p) => pairToTeam[p.id] === teamIndexes[1]);
  const pairsPerTeam = teamAPairs.length;
  if (
    teamIndexes.length !== 2 ||
    pairsPerTeam < 2 ||
    teamBPairs.length !== pairsPerTeam
  ) {
    const msg =
      "Alineación dinámica requiere exactamente 2 equipos con la misma cantidad de parejas (2 o más) cada uno.";
    setError(msg);
    showToast(msg, "error");
    return;
  }
  if (selectedTournament.courts < pairsPerTeam) {
    const msg = `Alineación dinámica requiere al menos ${pairsPerTeam} cancha(s) para que el Round Robin inicial dure exactamente ${pairsPerTeam} ronda(s).`;
    setError(msg);
    showToast(msg, "error");
    return;
  }
  const [teamAIndex, teamBIndex] = teamIndexes;

  const playerToTeam: Record<string, number> = {};
  teamAPairs.forEach((p) => {
    playerToTeam[p.player1_id] = teamAIndex;
    playerToTeam[p.player2_id] = teamAIndex;
  });
  teamBPairs.forEach((p) => {
    playerToTeam[p.player1_id] = teamBIndex;
    playerToTeam[p.player2_id] = teamBIndex;
  });

  const begin = await beginDynamicTeamBlock({
    tournamentId: selectedTournament.id,
    blockNumber: 1,
    roundStart: 1,
    roundEnd: pairsPerTeam,
    stage: "initial_round_robin",
  });

  if (begin.status === "already_claimed") {
    showToast("La reta ya estaba iniciada. Cargando partidos…", "info");
    const recovery = await recoverAlreadyClaimedDynamicStart(
      selectedTournament.id,
      selectedTournament
    );
    if (recovery.status !== "recovered") {
      const msg =
        recovery.status === "inconsistent"
          ? recovery.message
          : "No se pudo recuperar la reta ya iniciada.";
      setError(msg);
      showToast(msg, "error");
      return;
    }
    setError("");
    setSelectedTournament(recovery.tournament);
    persistTournamentGameMode(selectedTournament.id, "reta-equipos");
    persistTournamentMode(selectedTournament.id, "teams");
    await loadTournamentData(recovery.tournament);
    return;
  }

  if (begin.status !== "claimed") {
    const msg = "No se pudo iniciar la reta con alineación dinámica.";
    setError(msg);
    showToast(msg, "error");
    return;
  }

  const scheduleResult = await CircleRoundRobinScheduler.scheduleTournamentTeams(
    selectedTournament.id,
    pairs,
    selectedTournament.courts,
    userId,
    2,
    pairToTeam
  );
  if (!scheduleResult.success) {
    await retryDynamicTeamBlock({
      tournamentId: selectedTournament.id,
      blockNumber: 1,
    }).catch(() => undefined);
    setError(scheduleResult.message);
    showToast(scheduleResult.message, "error");
    return;
  }

  const asPlayerPair = (p: Pair): PlayerPair => [p.player1_id, p.player2_id];
  const plan = buildInitialDynamicLineupBlock({
    pairsPerTeam,
    teamA: { teamIndex: teamAIndex, pairs: teamAPairs.map(asPlayerPair) },
    teamB: { teamIndex: teamBIndex, pairs: teamBPairs.map(asPlayerPair) },
  });

  const commit = await commitDynamicTeamBlock({
    blockId: begin.blockId,
    teams: [plan.teamA, plan.teamB],
    pairToTeamDelta: pairToTeam,
  });
  if (commit.status !== "completed" && commit.status !== "unchanged") {
    const msg =
      commit.status === "error"
        ? commit.message
        : "No se pudo confirmar el bloque inicial de alineación dinámica.";
    setError(msg);
    showToast(msg, "error");
    return;
  }

  const teamConfigPayload = {
    team_config: {
      teamNames,
      pairToTeam,
      dynamicLineups: {
        enabled: true,
        totalRounds: dynamicLineups.totalRounds,
        pairsPerTeam,
        playerToTeam,
      },
    },
  };

  const updatePayload: Parameters<typeof updateTournament>[1] = {
    is_started: true,
    format: "teams",
    ...teamConfigPayload,
  };

  try {
    await updateTournament(selectedTournament.id, updatePayload);
  } catch (updateErr: unknown) {
    const msg =
      updateErr && typeof (updateErr as Error).message === "string"
        ? (updateErr as Error).message
        : "";
    if (
      msg.includes("format") ||
      msg.includes("team_config") ||
      msg.includes("PGRST204") ||
      msg.includes("schema")
    ) {
      await updateTournament(selectedTournament.id, { is_started: true });
      console.warn(
        "Columnas format/team_config no existen en la BD; alineación dinámica requiere esas columnas."
      );
    } else {
      throw updateErr;
    }
  }

  await closeOpenGameRegistration(
    isAmericanoTournament(selectedTournament) ? "americano" : "reta",
    selectedTournament.id
  );

  try {
    localStorage.setItem(
      `rivieraapp_teams_${selectedTournament.id}`,
      JSON.stringify({ teamNames, pairToTeam })
    );
  } catch (e) {
    console.warn("No se pudo guardar configuración de equipos en localStorage", e);
  }
  await upsertTournamentPublicConfig(
    selectedTournament.id,
    "teams",
    teamConfigPayload.team_config
  );

  persistTournamentGameMode(selectedTournament.id, "reta-equipos");
  persistTournamentMode(selectedTournament.id, "teams");

  const fresh = await getTournamentById(selectedTournament.id);
  let updatedTournament: Tournament = {
    ...selectedTournament,
    ...(fresh ?? {}),
    is_started: true,
    format: "teams",
    ...teamConfigPayload,
  };
  updatedTournament = await ensureTournamentStartedIfMatchesExist(updatedTournament);
  setSelectedTournament(updatedTournament);

  await loadTournamentData(updatedTournament);
  showToast(
    `Reta programada con alineación dinámica. Round Robin inicial (rondas 1-${pairsPerTeam}) listo.`,
    "success"
  );
}

export const useTournamentActions = (
  setSelectedTournament: (tournament: Tournament | null) => void,
  setMatches: (matches: any[]) => void,
  loadTournamentData: (tournament?: Tournament) => void | Promise<void>,
  showToast: (message: string, type?: "success" | "error" | "info") => void,
  setError: (error: string) => void
) => {
  const [loading, setLoading] = useState(false);

  const startTournament = async (
    selectedTournament: Tournament,
    pairs: Pair[],
    userId: string,
    opts?: {
      format: "roundRobin" | "teams";
      teamsCount?: number;
      teamNames?: string[];
      pairToTeam?: Record<string, number>;
      dynamicLineups?: DynamicLineupsStartOpts;
    }
  ) => {
    if (!selectedTournament || pairs.length < 2) {
      const msg = "Se necesitan al menos 2 parejas para iniciar la reta";
      setError(msg);
      showToast(msg, "error");
      return;
    }

    try {
      setLoading(true);
      setError("");

      debugLog("[tournament-actions] iniciando reta:", {
        nombre: selectedTournament.name,
        parejas: pairs.length,
        canchas: selectedTournament.courts,
        formato: opts?.format || "roundRobin",
      });

      const format = opts?.format || "roundRobin";

      if (
        format === "teams" &&
        opts?.dynamicLineups?.enabled &&
        opts?.teamNames?.length &&
        opts?.pairToTeam &&
        Object.keys(opts.pairToTeam).length > 0
      ) {
        await startDynamicLineupsTournament({
          selectedTournament,
          pairs,
          userId,
          teamNames: opts.teamNames,
          pairToTeam: opts.pairToTeam,
          dynamicLineups: opts.dynamicLineups,
          setSelectedTournament,
          loadTournamentData,
          showToast,
          setError,
        });
        return;
      }
      const result = await CircleRoundRobinScheduler.scheduleByFormat(
        selectedTournament.id,
        pairs,
        selectedTournament.courts,
        userId,
        format,
        format === "teams"
          ? {
              teamsCount: opts?.teamsCount ?? 2,
              teamNames: opts?.teamNames,
              pairToTeam: opts?.pairToTeam,
            }
          : undefined
      );

      if (result.success) {
        const updatePayload: Parameters<typeof updateTournament>[1] = {
          is_started: true,
          format: format === "teams" ? "teams" : "round_robin",
        };
        const teamConfigPayload =
          format === "teams" && opts?.teamNames?.length && opts?.pairToTeam && Object.keys(opts.pairToTeam).length > 0
            ? { team_config: { teamNames: opts.teamNames, pairToTeam: opts.pairToTeam } }
            : null;

        if (teamConfigPayload) {
          Object.assign(updatePayload, teamConfigPayload);
        }

        try {
          await updateTournament(selectedTournament.id, updatePayload);
        } catch (updateErr: unknown) {
          const msg = updateErr && typeof (updateErr as Error).message === "string" ? (updateErr as Error).message : "";
          if (msg.includes("format") || msg.includes("team_config") || msg.includes("PGRST204") || msg.includes("schema")) {
            await updateTournament(selectedTournament.id, { is_started: true });
            if (teamConfigPayload) {
              console.warn("Columnas format/team_config no existen en la BD; la config de equipos se guarda solo en localStorage.");
            }
          } else {
            throw updateErr;
          }
        }

        await closeOpenGameRegistration(
          isAmericanoTournament(selectedTournament) ? "americano" : "reta",
          selectedTournament.id
        );

        const updatedTournament: Tournament = {
          ...selectedTournament,
          is_started: true,
          format: format === "teams" ? "teams" : "round_robin",
          ...(teamConfigPayload || {}),
        };
        setSelectedTournament(updatedTournament);

        if (teamConfigPayload) {
          try {
            localStorage.setItem(
              `rivieraapp_teams_${selectedTournament.id}`,
              JSON.stringify({ teamNames: teamConfigPayload.team_config.teamNames, pairToTeam: teamConfigPayload.team_config.pairToTeam })
            );
          } catch (e) {
            console.warn("No se pudo guardar configuración de equipos en localStorage", e);
          }
          await upsertTournamentPublicConfig(selectedTournament.id, "teams", teamConfigPayload.team_config);
        }

        persistTournamentGameMode(
          selectedTournament.id,
          format === "teams" ? "reta-equipos" : "round-robin"
        );
        persistTournamentMode(
          selectedTournament.id,
          format === "teams" ? "teams" : "round_robin"
        );

        await loadTournamentData(updatedTournament);
        showToast(result.message, "success");
      } else {
        setError(result.message);
        showToast(result.message, "error");
      }
    } catch (error) {
      console.error("Error starting tournament:", error);
      showToast("Error al iniciar la reta", "error");
    } finally {
      setLoading(false);
    }
  };

  const resetTournament = async (
    selectedTournament: Tournament,
    pairs: Pair[]
  ) => {
    if (
      window.confirm(
        "¿Estás seguro de que quieres resetear la reta? Esto eliminará todos los partidos existentes y reseteará las estadísticas de todas las parejas."
      )
    ) {
      try {
        setLoading(true);

        const deleteGate = await deleteMatchesByTournamentSafely(
          selectedTournament.id,
          (prompt) => window.confirm(prompt)
        );
        if (deleteGate.outcome === "cancelled") {
          showToast(
            deleteGate.warning ??
              "Reset cancelado para preservar el detalle de partidos.",
            "info"
          );
          return;
        }
        if (deleteGate.outcome === "deleted" && deleteGate.warning) {
          showToast(deleteGate.warning, "info");
        }

        await updateTournament(selectedTournament.id, { is_started: false });

        setSelectedTournament({ ...selectedTournament, is_started: false });
        setMatches([]);

        await loadTournamentData();

        showToast("¡Reta reseteada exitosamente!", "success");
        debugLog("[tournament-actions] reset completado:", selectedTournament.id);
      } catch (error) {
        console.error("❌ Error al resetear la reta:", error);
        setError("Error al resetear la reta: " + (error as Error).message);
        showToast("Error al resetear la reta", "error");
      } finally {
        setLoading(false);
      }
    }
  };

  return {
    startTournament,
    resetTournament,
    loading,
  };
};
