import { BRACKET_FASE_SLOTS } from "./bracketTypes";
import { deserializeBracketSlots } from "./bracketPersistence";
import type {
  TorneoExpressFaseEliminacion,
  TorneoExpressEliminatoriaPartido,
} from "./types";

export function eliminatoriaBracketSize(
  fase: TorneoExpressFaseEliminacion,
  bracketSlots?: unknown
): number {
  const slots = deserializeBracketSlots(bracketSlots);
  if (slots.length > 0) return slots.length;
  return BRACKET_FASE_SLOTS[fase];
}

export function totalRondasEliminatoria(
  fase: TorneoExpressFaseEliminacion,
  bracketSlotCount?: number
): number {
  const slots = bracketSlotCount ?? BRACKET_FASE_SLOTS[fase];
  let rounds = 0;
  let matches = slots / 2;
  while (matches >= 1) {
    rounds += 1;
    matches = matches / 2;
  }
  return rounds;
}

export function labelRondaEliminatoria(
  fase: TorneoExpressFaseEliminacion,
  ronda: number,
  totalRondas?: number,
  bracketSlotCount?: number
): string {
  const slots = bracketSlotCount ?? BRACKET_FASE_SLOTS[fase];
  const total = totalRondas ?? totalRondasEliminatoria(fase, slots);
  if (ronda === total) return "Final";

  const matchesInRound = Math.max(1, slots / 2 ** ronda);
  if (matchesInRound >= 8) return "Octavos de final";
  if (matchesInRound >= 4) return "Cuartos de final";
  if (matchesInRound >= 2) return "Semifinal";
  return `Ronda ${ronda}`;
}

export function partidosDeRonda(
  partidos: TorneoExpressEliminatoriaPartido[],
  ronda: number
): TorneoExpressEliminatoriaPartido[] {
  return partidos
    .filter((p) => p.ronda === ronda)
    .sort((a, b) => a.orden - b.orden);
}

export function rondaCompleta(
  partidos: TorneoExpressEliminatoriaPartido[],
  ronda: number
): boolean {
  const inRound = partidosDeRonda(partidos, ronda);
  if (inRound.length === 0) return false;
  return inRound.every((p) => p.estado === "jugado");
}

export function ganadoresPorCruce(
  partidos: TorneoExpressEliminatoriaPartido[],
  ronda: number
): Map<number, string> {
  const map = new Map<number, string>();
  partidosDeRonda(partidos, ronda).forEach((p) => {
    if (p.ganador_id) map.set(p.cruce_index, p.ganador_id);
  });
  return map;
}

export type EliminatoriaPartidoInsert = Omit<
  TorneoExpressEliminatoriaPartido,
  "id" | "created_at"
>;

/** Genera filas para la siguiente ronda a partir de ganadores de la ronda actual. */
export function buildSiguienteRondaPartidos(
  torneoId: string,
  rondaActual: number,
  partidos: TorneoExpressEliminatoriaPartido[]
): EliminatoriaPartidoInsert[] {
  const winners = ganadoresPorCruce(partidos, rondaActual);
  const cruces = Array.from(winners.keys()).sort((a, b) => a - b);
  const nextRonda = rondaActual + 1;
  const inserts: EliminatoriaPartidoInsert[] = [];

  for (let i = 0; i < cruces.length; i += 2) {
    const cruceA = cruces[i];
    const cruceB = cruces[i + 1];
    if (cruceB === undefined) continue;

    const localId = winners.get(cruceA);
    const visitId = winners.get(cruceB);
    if (!localId || !visitId) continue;

    inserts.push({
      torneo_id: torneoId,
      ronda: nextRonda,
      orden: inserts.length + 1,
      cruce_index: cruceA / 2,
      pareja_local_id: localId,
      pareja_visitante_id: visitId,
      puntos_local: null,
      puntos_visitante: null,
      ganador_id: null,
      estado: "pendiente",
      es_bye: false,
    });
  }

  return inserts;
}

export function maxRondaActual(
  partidos: TorneoExpressEliminatoriaPartido[]
): number {
  if (partidos.length === 0) return 0;
  return Math.max(...partidos.map((p) => p.ronda));
}

/** True cuando todos los partidos de la última ronda están jugados. */
export function eliminatoriaUltimaRondaCompleta(
  partidos: TorneoExpressEliminatoriaPartido[],
  fase: TorneoExpressFaseEliminacion,
  bracketSlotCount?: number
): boolean {
  const total = totalRondasEliminatoria(fase, bracketSlotCount);
  return rondaCompleta(partidos, total);
}
