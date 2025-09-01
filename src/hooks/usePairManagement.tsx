import {
  Player,
  Pair,
  createPair,
  updatePair,
  deletePair as deletePairFromDB,
} from "../lib/database";

export const usePairManagement = (
  pairs: Pair[],
  setPairs: (pairs: Pair[]) => void,
  selectedTournament: any,
  setSelectedPlayers: (players: Player[]) => void,
  setError: (error: string) => void,
  showToast: (message: string, type?: "success" | "error" | "info") => void
) => {
  const deletePair = async (pairId: string) => {
    try {
      setError("");
      console.log("Eliminando pareja:", pairId);

      await deletePairFromDB(pairId);
      setPairs(pairs.filter((p) => p.id !== pairId));

      console.log("Pareja eliminada exitosamente");
      showToast("Pareja eliminada exitosamente", "success");
    } catch (err) {
      console.error("Error eliminando pareja:", err);
      showToast("Error al eliminar la pareja", "error");
    }
  };

  const updatePairPlayers = async (
    pairId: string,
    player1: Player,
    player2: Player
  ) => {
    try {
      setError("");
      console.log("Actualizando pareja:", pairId);
      console.log("Nuevos jugadores:", player1.name, "+", player2.name);

      await updatePair(pairId, {
        player1_id: player1.id,
        player2_id: player2.id,
      });

      setPairs(
        pairs.map((pair) => {
          if (pair.id === pairId) {
            return {
              ...pair,
              player1_id: player1.id,
              player2_id: player2.id,
              player1: player1,
              player2: player2,
            };
          }
          return pair;
        })
      );

      console.log("Pareja actualizada exitosamente");
    } catch (err) {
      console.error("Error actualizando pareja:", err);
      setError("Error al actualizar la pareja: " + (err as Error).message);
    }
  };

  const addPair = async (player1: Player, player2: Player) => {
    if (!selectedTournament) {
      setError("No hay reta seleccionada");
      return;
    }

    try {
      setError("");

      const existingPairLocal = pairs.find((pair) => {
        const sameIds =
          (pair.player1_id === player1.id && pair.player2_id === player2.id) ||
          (pair.player1_id === player2.id && pair.player2_id === player1.id);

        const sameNames =
          (pair.player1?.name.toLowerCase() === player1.name.toLowerCase() &&
            pair.player2?.name.toLowerCase() === player2.name.toLowerCase()) ||
          (pair.player1?.name.toLowerCase() === player2.name.toLowerCase() &&
            pair.player2?.name.toLowerCase() === player1.name.toLowerCase());

        return sameIds || sameNames;
      });

      if (existingPairLocal) {
        setError(
          `La pareja ${player1.name} / ${player2.name} ya está registrada`
        );
        return;
      }

      const newPair = await createPair(
        selectedTournament.id,
        player1.id,
        player2.id
      );
      setPairs([...pairs, newPair]);
      setSelectedPlayers([]);

      console.log("Pair added successfully");
    } catch (err) {
      console.error("Error creating pair:", err);
      setError("Error al crear la pareja: " + (err as Error).message);
    }
  };

  return {
    deletePair,
    updatePairPlayers,
    addPair,
  };
};
