import { Player, Pair } from "../lib/database";

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

    // Validación: Verificar si algún jugador ya está en una pareja
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

      // Mantener selección visible mientras se crea (o si falla)
      setSelectedPlayers(players);

      if (player1.id === player2.id) {
        setError("No puedes emparejar un jugador consigo mismo");
        return;
      }

      if (player1.name.toLowerCase() === player2.name.toLowerCase()) {
        setError("No puedes seleccionar dos jugadores con el mismo nombre");
        return;
      }

      const existingPair = pairs.find((pair) => {
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

      if (existingPair) {
        setError(
          `La pareja ${player1.name} / ${player2.name} ya existe en la reta`
        );
        return;
      }

      // Solo addPair limpia la selección tras éxito real
      void addPair(player1, player2);
      return;
    }

    setSelectedPlayers(players);
  };

  return { validatePlayerSelection };
};
