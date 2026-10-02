import { isConsistentPairShape } from "./pairIdentity";
import type {
  ExpectedPairSide,
  ExpectedPairs,
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "./types";

type ParejaRoster = Pick<
  TorneoExpressGrupoPareja,
  "pareja_id" | "player1_id" | "player2_id" | "is_virtual"
>;

function sideFromPareja(pareja: ParejaRoster | undefined): ExpectedPairSide | null {
  if (!pareja?.pareja_id) return null;
  const isVirtual = pareja.is_virtual === true;
  const player1Id = pareja.player1_id ?? null;
  const player2Id = pareja.player2_id ?? null;
  if (!isConsistentPairShape(isVirtual, player1Id, player2Id)) return null;
  return {
    pair_id: pareja.pareja_id,
    player1_id: isVirtual ? null : player1Id,
    player2_id: isVirtual ? null : player2Id,
    is_virtual: isVirtual,
  };
}

/**
 * Copia la composición que el usuario está viendo al abrir el modal.
 * El objeto devuelto no sigue al arreglo de parejas si ese arreglo cambia después.
 * Un id null solo es válido cuando ese lado es virtual.
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
