import { BRACKET_FASE_SLOTS } from "./bracketTypes";
import { deserializeBracketSlots } from "./bracketPersistence";
import type {
  PartidoSetScore,
  TorneoExpressFaseEliminacion,
  TorneoExpressEliminatoriaPartido,
} from "./types";

/** Ronda especial (no cuenta en totalRondasEliminatoria): juego por el 3.er lugar. */
export const RONDA_TERCER_LUGAR = 90;

export function isRondaTercerLugar(ronda: number): boolean {
  return ronda === RONDA_TERCER_LUGAR;
}

/** Semifinales listas y hay final (y normalmente también partido por el 3.er lugar). */
export function isFinaleEliminatoriaStage(
  partidos: TorneoExpressEliminatoriaPartido[],
  totalRondas: number
): boolean {
  if (totalRondas < 2) return false;
  const semiRonda = totalRondas - 1;
  if (!rondaCompleta(partidos, semiRonda)) return false;
  const hasFinal = partidos.some(
    (p) => p.ronda === totalRondas && !p.es_bye
  );
  const hasTercer = partidos.some((p) => isRondaTercerLugar(p.ronda));
  return hasFinal || hasTercer;
}

export function eliminatoriaIncluyeTercerLugar(
  fase: TorneoExpressFaseEliminacion,
  bracketSlotCount?: number
): boolean {
  return totalRondasEliminatoria(fase, bracketSlotCount) >= 2;
}

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
  if (isRondaTercerLugar(ronda)) return "Tercer lugar";

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

/** Perdedores de semifinal (o penúltima ronda) juegan por el 3.er lugar. */
export function buildTercerLugarPartido(
  torneoId: string,
  partidos: TorneoExpressEliminatoriaPartido[],
  semiRonda: number
): EliminatoriaPartidoInsert | null {
  const semiMatches = partidosDeRonda(partidos, semiRonda).filter(
    (p) =>
      !p.es_bye &&
      p.pareja_local_id &&
      p.pareja_visitante_id &&
      p.estado === "jugado" &&
      p.ganador_id
  );

  if (semiMatches.length < 2) return null;

  const losers: string[] = [];
  for (const p of semiMatches) {
    const local = p.pareja_local_id!;
    const visit = p.pareja_visitante_id!;
    const loser = p.ganador_id === local ? visit : local;
    if (!losers.includes(loser)) losers.push(loser);
  }

  if (losers.length !== 2) return null;

  return {
    torneo_id: torneoId,
    ronda: RONDA_TERCER_LUGAR,
    orden: 1,
    cruce_index: 0,
    pareja_local_id: losers[0],
    pareja_visitante_id: losers[1],
    puntos_local: null,
    puntos_visitante: null,
    ganador_id: null,
    estado: "pendiente",
    es_bye: false,
  };
}

export function maxRondaActual(
  partidos: TorneoExpressEliminatoriaPartido[]
): number {
  if (partidos.length === 0) return 0;
  return Math.max(...partidos.map((p) => p.ronda));
}

/** Slot en la siguiente ronda para el ganador de un cruce. */
export function nextRoundSlotForCruce(cruceIndex: number): {
  nextCruceIndex: number;
  side: "local" | "visitante";
} {
  return {
    nextCruceIndex: Math.floor(cruceIndex / 2),
    side: cruceIndex % 2 === 0 ? "local" : "visitante",
  };
}

export type EliminatoriaPartidoPatch = {
  id: string;
  pareja_local_id?: string | null;
  pareja_visitante_id?: string | null;
  puntos_local?: number | null;
  puntos_visitante?: number | null;
  ganador_id?: string | null;
  estado?: "pendiente" | "jugado";
  sets_resultado?: PartidoSetScore[] | null;
};

function resetResultFields(
  id: string
): Pick<
  EliminatoriaPartidoPatch,
  | "id"
  | "puntos_local"
  | "puntos_visitante"
  | "ganador_id"
  | "estado"
  | "sets_resultado"
> {
  return {
    id,
    puntos_local: null,
    puntos_visitante: null,
    ganador_id: null,
    estado: "pendiente",
    sets_resultado: null,
  };
}

function mergePatch(
  map: Map<string, EliminatoriaPartidoPatch>,
  patch: EliminatoriaPartidoPatch
): void {
  const prev = map.get(patch.id);
  map.set(patch.id, prev ? { ...prev, ...patch } : patch);
}

/**
 * Si cambia el ganador de un partido, actualiza el participante downstream
 * y reinicia resultados de rondas posteriores (evita llaves inconsistentes).
 * También corrige el partido por el 3.er lugar cuando aplica.
 */
export function computeWinnerChangePropagation(
  partidos: TorneoExpressEliminatoriaPartido[],
  changedPartido: Pick<
    TorneoExpressEliminatoriaPartido,
    "id" | "ronda" | "cruce_index" | "ganador_id" | "es_bye"
  >,
  newGanadorId: string,
  options?: {
    totalRondas?: number;
  }
): EliminatoriaPartidoPatch[] {
  if (changedPartido.es_bye) return [];
  if (isRondaTercerLugar(changedPartido.ronda)) return [];

  const byId = new Map(partidos.map((p) => [p.id, { ...p }]));
  const patches = new Map<string, EliminatoriaPartidoPatch>();

  const applyLocal = (id: string, fields: Omit<EliminatoriaPartidoPatch, "id">) => {
    const cur = byId.get(id);
    if (!cur) return;
    const next = { ...cur, ...fields } as TorneoExpressEliminatoriaPartido;
    byId.set(id, next);
    mergePatch(patches, { id, ...fields });
  };

  /** Reinicia un partido y propaga eliminación del ganador anterior hacia abajo. */
  const clearCascadeFrom = (partidoId: string) => {
    const p = byId.get(partidoId);
    if (!p || isRondaTercerLugar(p.ronda)) return;
    const oldWinner = p.ganador_id;
    const wasPlayed = p.estado === "jugado";
    if (wasPlayed || p.puntos_local != null || p.ganador_id != null) {
      applyLocal(partidoId, resetResultFields(partidoId));
    }
    if (!oldWinner || !wasPlayed) return;

    const { nextCruceIndex, side } = nextRoundSlotForCruce(p.cruce_index);
    const next = Array.from(byId.values()).find(
      (x) =>
        x.ronda === p.ronda + 1 &&
        x.cruce_index === nextCruceIndex &&
        !isRondaTercerLugar(x.ronda)
    );
    if (!next) return;

    const sideId =
      side === "local" ? next.pareja_local_id : next.pareja_visitante_id;
    if (sideId === oldWinner) {
      applyLocal(next.id, {
        ...(side === "local"
          ? { pareja_local_id: null }
          : { pareja_visitante_id: null }),
      });
      clearCascadeFrom(next.id);
    }
  };

  // Propagar nuevo ganador a la siguiente ronda (si ya existe).
  const { nextCruceIndex, side } = nextRoundSlotForCruce(
    changedPartido.cruce_index
  );
  const nextMatch = Array.from(byId.values()).find(
    (x) =>
      x.ronda === changedPartido.ronda + 1 &&
      x.cruce_index === nextCruceIndex &&
      !isRondaTercerLugar(x.ronda)
  );

  if (nextMatch) {
    const currentSideId =
      side === "local"
        ? nextMatch.pareja_local_id
        : nextMatch.pareja_visitante_id;

    if (currentSideId !== newGanadorId) {
      clearCascadeFrom(nextMatch.id);
      applyLocal(nextMatch.id, {
        ...(side === "local"
          ? { pareja_local_id: newGanadorId }
          : { pareja_visitante_id: newGanadorId }),
        ...resetResultFields(nextMatch.id),
      });
    }
  }

  // Tercer lugar: si cambió una semi, actualizar perdedores.
  const totalRondas = options?.totalRondas;
  if (
    totalRondas != null &&
    totalRondas >= 2 &&
    changedPartido.ronda === totalRondas - 1
  ) {
    const tercer = Array.from(byId.values()).find((p) =>
      isRondaTercerLugar(p.ronda)
    );
    if (tercer) {
      const semis = Array.from(byId.values()).filter(
        (p) =>
          p.ronda === totalRondas - 1 &&
          !p.es_bye &&
          p.pareja_local_id &&
          p.pareja_visitante_id
      );
      // Aplicar ganador nuevo al partido cambiado en el snapshot local.
      const changed = byId.get(changedPartido.id);
      if (changed) {
        byId.set(changedPartido.id, {
          ...changed,
          ganador_id: newGanadorId,
          estado: "jugado",
        });
      }

      const losers: string[] = [];
      for (const s of semis) {
        const snap = byId.get(s.id) ?? s;
        const ganador =
          snap.id === changedPartido.id ? newGanadorId : snap.ganador_id;
        const played =
          snap.id === changedPartido.id || snap.estado === "jugado";
        if (!played || !ganador) continue;
        const local = snap.pareja_local_id!;
        const visit = snap.pareja_visitante_id!;
        const loser = ganador === local ? visit : local;
        if (!losers.includes(loser)) losers.push(loser);
      }

      if (losers.length === 2) {
        const samePair =
          (tercer.pareja_local_id === losers[0] &&
            tercer.pareja_visitante_id === losers[1]) ||
          (tercer.pareja_local_id === losers[1] &&
            tercer.pareja_visitante_id === losers[0]);
        if (!samePair) {
          applyLocal(tercer.id, {
            pareja_local_id: losers[0],
            pareja_visitante_id: losers[1],
            ...resetResultFields(tercer.id),
          });
        }
      }
    }
  }

  return Array.from(patches.values()).filter((p) => p.id !== changedPartido.id);
}

/** True cuando la final y (si aplica) el partido por el 3.er lugar están jugados. */
export function eliminatoriaUltimaRondaCompleta(
  partidos: TorneoExpressEliminatoriaPartido[],
  fase: TorneoExpressFaseEliminacion,
  bracketSlotCount?: number
): boolean {
  const total = totalRondasEliminatoria(fase, bracketSlotCount);
  if (!rondaCompleta(partidos, total)) return false;

  if (!eliminatoriaIncluyeTercerLugar(fase, bracketSlotCount)) {
    return true;
  }

  const tercerRows = partidos.filter((p) => isRondaTercerLugar(p.ronda));
  if (tercerRows.length === 0) return false;

  return rondaCompleta(partidos, RONDA_TERCER_LUGAR);
}
