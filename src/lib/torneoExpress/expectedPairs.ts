import type {
  ExpectedPairs,
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "./types";

type ParejaRoster = Pick<
  TorneoExpressGrupoPareja,
  "pareja_id" | "player1_id" | "player2_id"
>;

function sideFromPareja(pareja: ParejaRoster | undefined) {
  if (!pareja?.player1_id || !pareja.player2_id) return null;
  return {
    pair_id: pareja.pareja_id,
    player1_id: pareja.player1_id,
    player2_id: pareja.player2_id,
  };
}

/**
 * Copia los ids que el usuario está viendo. El objeto devuelto no sigue
 * al arreglo de parejas si ese arreglo cambia después.
 */
export function captureExpectedPairs(
  partido: Pick<TorneoExpressPartido, "pareja_local_id" | "pareja_visitante_id">,
  parejas: ParejaRoster[]
): ExpectedPairs | null {
  const local = sideFromPareja(
    parejas.find((pareja) => pareja.pareja_id === partido.pareja_local_id)
  );
  const visitante = sideFromPareja(
    parejas.find((pareja) => pareja.pareja_id === partido.pareja_visitante_id)
  );
  if (!local || !visitante) return null;
  return { local, visitante };
}
