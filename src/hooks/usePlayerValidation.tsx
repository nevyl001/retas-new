import { Player, Pair } from "../lib/database";

export const usePlayerValidation = () => {
  const validatePlayerSelection = (
    players: Player[],
    pairs: Pair[],
    setError: (error: string) => void,
    addPair: (player1: Player, player2: Player) => void,
    setSelectedPlayers: (players: Player[]) => void
  ) => {
    console.log("=== SELECCIÓN DE JUGADORES ===");
    console.log("Players selected:", players.length);
    players.forEach((player, index) => {
      console.log(`Player ${index + 1}:`, player.name, "(ID:", player.id + ")");
    });

    // Validación: Verificar si algún jugador ya está en una pareja
    const playersInPairs = players.filter((player) => {
      const isInPair = pairs.some(
        (pair) => pair.player1_id === player.id || pair.player2_id === player.id
      );

      if (isInPair) {
        const existingPair = pairs.find(
          (pair) =>
            pair.player1_id === player.id || pair.player2_id === player.id
        );
        console.log(
          `🚨 JUGADOR YA EN PAREJA: ${player.name} está en pareja con ${
            existingPair?.player1?.id === player.id
              ? existingPair?.player2?.name
              : existingPair?.player1?.name
          }`
        );
      }

      return isInPair;
    });

    if (playersInPairs.length > 0) {
      const playerNames = playersInPairs.map((p) => p.name).join(", ");
      console.log("🚨 ERROR: Jugadores ya están en parejas:", playerNames);
      setError(
        `Los jugadores ${playerNames} ya están en parejas existentes. Debes eliminar sus parejas actuales antes de poder seleccionarlos nuevamente.`
      );
      return;
    }

    // Validación: No permitir jugadores con nombres iguales
    if (players.length === 2) {
      const player1 = players[0];
      const player2 = players[1];

      if (player1.name.toLowerCase() === player2.name.toLowerCase()) {
        console.log("🚨 ERROR: Jugadores con nombres iguales detectados");
        console.log("Player 1:", player1.name, "(ID:", player1.id + ")");
        console.log("Player 2:", player2.name, "(ID:", player2.id + ")");
        setError("No puedes seleccionar dos jugadores con el mismo nombre");
        return;
      }

      // Validación: Verificar si ya existe una pareja con estos jugadores
      const existingPair = pairs.find((pair) => {
        const sameIds =
          (pair.player1_id === player1.id && pair.player2_id === player2.id) ||
          (pair.player1_id === player2.id && pair.player2_id === player1.id);

        const sameNames =
          (pair.player1?.name.toLowerCase() === player1.name.toLowerCase() &&
            pair.player2?.name.toLowerCase() === player2.name.toLowerCase()) ||
          (pair.player1?.name.toLowerCase() === player2.name.toLowerCase() &&
            pair.player2?.name.toLowerCase() === player1.name.toLowerCase());

        if (sameIds || sameNames) {
          console.log(
            "🚨 PAREJA DUPLICADA DETECTADA:",
            player1.name,
            "+",
            player2.name
          );
          console.log("Existing pair:", pair);
        }

        return sameIds || sameNames;
      });

      if (existingPair) {
        console.log("🚨 ERROR: Pareja ya existe en la base de datos");
        setError(
          `La pareja ${player1.name} / ${player2.name} ya existe en la reta`
        );
        return;
      }

      // Si llegamos aquí, la pareja es válida
      console.log("✅ PAREJA VÁLIDA:", player1.name, "+", player2.name);
      addPair(player1, player2);
      setSelectedPlayers([]); // Limpiar selección después de crear la pareja
    } else {
      setSelectedPlayers(players);
    }
  };

  return { validatePlayerSelection };
};
