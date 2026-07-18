import { Player, Pair } from "../lib/database";
import { unorderedPairIdKey } from "../lib/rivieraJugadores/playerNameKey";

export const usePlayerValidation = () => {
  const validatePlayerSelection = (
    players: Player[],
    pairs: Pair[],
    setError: (error: string) => void,
    addPair: (player1: Player, player2: Player) => void | Promise<void>,
    setSelectedPlayers: (players: Player[]) => void,
    options?: { isCreatingPair?: boolean }
  ) => {
    if (options?.isCreatingPair) {
      return;
    }

    const playersInPairs = players.filter((player) => {
      return pairs.some(
        (pair) => pair.player1_id === player.id || pair.player2_id === player.id
      );
    });

    if (playersInPairs.length > 0) {
      const playerNames = playersInPairs.map((p) => p.name).join(", ");
      setError(
        `Los jugadores ${playerNames} ya están en parejas existentes. Debes eliminar sus parejas actuales antes de poder seleccionarlos nuevamente.`
      );
      return;
    }

    if (players.length === 2) {
      const player1 = players[0];
      const player2 = players[1];

      setSelectedPlayers(players);

      if (player1.id === player2.id) {
        setError("No puedes emparejar un jugador consigo mismo");
        return;
      }

      const pairKey = unorderedPairIdKey(player1.id, player2.id);
      const existingPair = pairs.find((pair) => {
        return (
          unorderedPairIdKey(pair.player1_id, pair.player2_id) === pairKey
        );
      });

      if (existingPair) {
        setError(
          `La pareja ${player1.name} / ${player2.name} ya existe en la reta`
        );
        return;
      }

      void addPair(player1, player2);
      return;
    }

    setSelectedPlayers(players);
  };

  return { validatePlayerSelection };
};
