import type { Duelo2v2 } from "../duelo2v2/types";
import {
  formatRivalPair,
  resultadoFromScores,
  type PartidoDetalle,
  type PartidoDetalleResultado,
} from "../shared/buildPartidosDetalle";

function sumGamesFromSets(
  detalle: Duelo2v2["detalle_sets"],
  side: "a" | "b"
): number {
  if (!detalle?.length) return 0;
  return detalle.reduce(
    (acc, s) => acc + (side === "a" ? s.a : s.b),
    0
  );
}

/**
 * El ganador oficial del duelo manda. Sumar juegos puede dar más puntos
 * a la pareja que perdió por sets.
 */
function resultadoOficialDuelo(
  ganador: Duelo2v2["ganador"],
  esParejaA: boolean,
  favor: number,
  contra: number
): PartidoDetalleResultado {
  if (ganador === "a" || ganador === "b") {
    const ganaEstaPareja = esParejaA ? ganador === "a" : ganador === "b";
    return ganaEstaPareja ? "win" : "loss";
  }
  return resultadoFromScores(favor, contra);
}

/** Un duelo = un partido por jugador (games acumulados de sets). */
export function buildDuelo2vs2PartidosDetalle(params: {
  duelo: Duelo2v2;
  esParejaA: boolean;
}): PartidoDetalle[] {
  const { duelo, esParejaA } = params;
  const gamesA =
    sumGamesFromSets(duelo.detalle_sets, "a") ||
    duelo.sets_pareja_a;
  const gamesB =
    sumGamesFromSets(duelo.detalle_sets, "b") ||
    duelo.sets_pareja_b;

  const favor = esParejaA ? gamesA : gamesB;
  const contra = esParejaA ? gamesB : gamesA;
  const rival = esParejaA
    ? formatRivalPair(duelo.pareja_b_j1_nombre, duelo.pareja_b_j2_nombre)
    : formatRivalPair(duelo.pareja_a_j1_nombre, duelo.pareja_a_j2_nombre);

  const fecha =
    duelo.finalizado_at ??
    duelo.updated_at ??
    duelo.created_at ??
    "";

  return [
    {
      id: duelo.id,
      ronda: 1,
      fase: "Duelo",
      rival,
      games_favor: favor,
      games_contra: contra,
      resultado: resultadoOficialDuelo(duelo.ganador, esParejaA, favor, contra),
      fecha,
    },
  ];
}
