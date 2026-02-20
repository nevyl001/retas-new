import { useState } from "react";
import {
  Tournament,
  Pair,
  deleteMatchesByTournament,
  updateTournament,
  upsertTournamentPublicConfig,
} from "../lib/database";
import { CircleRoundRobinScheduler } from "../components/CircleRoundRobinScheduler";

export const useTournamentActions = (
  setSelectedTournament: (tournament: Tournament | null) => void,
  setMatches: (matches: any[]) => void,
  loadTournamentData: () => void,
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
    }
  ) => {
    if (!selectedTournament || pairs.length < 2) {
      setError("Se necesitan al menos 2 parejas para iniciar la reta");
      return;
    }

    try {
      setLoading(true);
      setError("");

      console.log("🚀 Iniciando reta:", selectedTournament.name);
      console.log("📊 Parejas:", pairs.length);
      console.log("🏟️ Canchas:", selectedTournament.courts);
      console.log("🧩 Formato:", opts?.format || "roundRobin");

      const format = opts?.format || "roundRobin";
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
        const updatePayload: Parameters<typeof updateTournament>[1] = { is_started: true };
        const teamConfigPayload =
          format === "teams" && opts?.teamNames?.length && opts?.pairToTeam && Object.keys(opts.pairToTeam).length > 0
            ? { format: "teams" as const, team_config: { teamNames: opts.teamNames, pairToTeam: opts.pairToTeam } }
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

        setSelectedTournament({
          ...selectedTournament,
          is_started: true,
          ...(teamConfigPayload || {}),
        });

        if (teamConfigPayload) {
          try {
            localStorage.setItem(
              `retapadel_teams_${selectedTournament.id}`,
              JSON.stringify({ teamNames: teamConfigPayload.team_config.teamNames, pairToTeam: teamConfigPayload.team_config.pairToTeam })
            );
          } catch (e) {
            console.warn("No se pudo guardar configuración de equipos en localStorage", e);
          }
          await upsertTournamentPublicConfig(selectedTournament.id, "teams", teamConfigPayload.team_config);
        }

        await loadTournamentData();
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
    console.log("🔄 Botón de reset clickeado");
    if (
      window.confirm(
        "¿Estás seguro de que quieres resetear la reta? Esto eliminará todos los partidos existentes y reseteará las estadísticas de todas las parejas."
      )
    ) {
      try {
        console.log("🔄 Iniciando proceso de reset...");
        setLoading(true);

        console.log("🗑️ Eliminando partidos...");
        await deleteMatchesByTournament(selectedTournament.id);
        console.log("✅ Partidos eliminados");

        console.log("🔄 Marcando reta como no iniciada...");
        await updateTournament(selectedTournament.id, { is_started: false });
        console.log("✅ Reta marcada como no iniciada");

        setSelectedTournament({ ...selectedTournament, is_started: false });
        setMatches([]);

        console.log("🔄 Recargando datos de la reta...");
        await loadTournamentData();
        console.log("✅ Datos recargados");

        showToast("¡Reta reseteada exitosamente!", "success");
        console.log("🎉 Reset completado exitosamente");
      } catch (error) {
        console.error("❌ Error al resetear la reta:", error);
        setError("Error al resetear la reta: " + (error as Error).message);
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
