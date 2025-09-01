import { useState } from "react";
import {
  Tournament,
  Pair,
  deleteMatchesByTournament,
  updateTournament,
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
    pairs: Pair[]
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

      const result = await CircleRoundRobinScheduler.scheduleTournament(
        selectedTournament.id,
        pairs,
        selectedTournament.courts
      );

      if (result.success) {
        await updateTournament(selectedTournament.id, { is_started: true });
        setSelectedTournament({ ...selectedTournament, is_started: true });

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
