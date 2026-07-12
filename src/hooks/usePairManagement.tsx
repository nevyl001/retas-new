import { useCallback, useRef, useState } from "react";
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
  selectedTournament: { id: string } | null | undefined,
  setSelectedPlayers: (players: Player[]) => void,
  setError: (error: string) => void,
  showToast: (message: string, type?: "success" | "error" | "info") => void,
  userId?: string
) => {
  const [isCreatingPair, setIsCreatingPair] = useState(false);
  const creatingRef = useRef(false);

  const deletePair = async (pairId: string) => {
    try {
      setError("");
      await deletePairFromDB(pairId);
      setPairs(pairs.filter((p) => p.id !== pairId));
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
    } catch (err) {
      console.error("Error actualizando pareja:", err);
      setError("Error al actualizar la pareja: " + (err as Error).message);
    }
  };

  const addPair = useCallback(
    async (player1: Player, player2: Player) => {
      if (!selectedTournament?.id) {
        setError("No hay reta seleccionada");
        return;
      }

      if (creatingRef.current) {
        return;
      }

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

      creatingRef.current = true;
      setIsCreatingPair(true);
      setError("");

      try {
        const newPair = await createPair(
          selectedTournament.id,
          player1.id,
          player2.id,
          userId
        );
        setPairs([...pairs, newPair]);
        setSelectedPlayers([]);
        showToast("Pareja creada", "success");
      } catch (err) {
        console.error("Error creating pair:", err);
        const message =
          err && typeof err === "object" && "message" in err
            ? String((err as { message: unknown }).message)
            : (err as Error).message;
        setError("Error al crear la pareja: " + message);
        // Conservar selección: no limpiar selectedPlayers
      } finally {
        creatingRef.current = false;
        setIsCreatingPair(false);
      }
    },
    [
      pairs,
      selectedTournament,
      setPairs,
      setSelectedPlayers,
      setError,
      showToast,
      userId,
    ]
  );

  return {
    deletePair,
    updatePairPlayers,
    addPair,
    isCreatingPair,
  };
};
