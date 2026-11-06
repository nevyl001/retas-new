/**
 * Identidad histórica de la Liga Individual.
 *
 * La plaza (inscripción) cambia de ocupante en una sustitución.
 * El partido conserva al jugador que realmente lo disputó
 * (`liga_jornada_parejas.jugador1_id` / `jugador2_id`).
 * Un partido ya disputado no se reescribe por el número de jornada.
 */

export type SustitucionPlaza = {
  fromJugadorId: string;
  toJugadorId: string;
  /** Inclusiva: desde esta jornada el entrante ocupa la plaza. */
  ingresoJornadaNumero: number;
};

export type SlotHistorico = {
  jornadaNumero: number;
  /** Jugador persistido en la pareja de esa jornada. */
  storedJugadorId: string;
  /** Hay marcador o el partido ya se disputó. */
  played: boolean;
};

export function collectMissingJugadorIds(
  ids: Array<string | null | undefined>,
  knownIds: ReadonlySet<string>
): string[] {
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id || knownIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    missing.push(id);
  }
  return missing;
}

/**
 * Ocupante de la plaza en una jornada aún no disputada.
 * Las sustituciones se aplican en orden de ingreso. Una cadena
 * A→B (J4) y B→C (J7) deja a C desde la jornada 7.
 */
export function occupantForUnplayedJornada(
  originalJugadorId: string,
  jornadaNumero: number,
  chain: readonly SustitucionPlaza[]
): string {
  const ordered = chain
    .slice()
    .sort((a, b) => a.ingresoJornadaNumero - b.ingresoJornadaNumero);
  let current = originalJugadorId;
  for (const step of ordered) {
    if (step.ingresoJornadaNumero > jornadaNumero) continue;
    if (current === step.fromJugadorId) current = step.toJugadorId;
  }
  return current;
}

/**
 * Fuente de verdad de un slot:
 * - partido disputado → el id persistido, aunque la jornada de ingreso
 *   diga otra cosa;
 * - partido futuro sin disputar → el ocupante vigente de la plaza.
 */
export function resolveSlotPlayerId(
  slot: SlotHistorico,
  originalJugadorId: string,
  chain: readonly SustitucionPlaza[]
): string {
  if (slot.played) return slot.storedJugadorId;
  return occupantForUnplayedJornada(
    originalJugadorId,
    slot.jornadaNumero,
    chain
  );
}

export type PlazaPuntos = {
  /** Total que sigue en la clasificación, ya con la herencia incluida. */
  plaza: number;
  /** Puntos que la sustitución NO suma otra vez al saliente ni al entrante. */
  duplicado: number;
};

/**
 * La herencia ya está dentro del total de la plaza.
 * No se vuelve a sumar ni se copia al historial personal del entrante.
 */
export function inheritedPointsStayOnPlaza(
  plazaPoints: number,
  inherited: number
): PlazaPuntos {
  return {
    plaza: plazaPoints,
    duplicado: inherited < 0 ? inherited : 0,
  };
}

export type MatchAttribution = {
  jugadorId: string;
  victorias: number;
  derrotas: number;
};

/** Cada partido cuenta solo para el jugador persistido en ese partido. */
export function attributeMatches(
  slots: ReadonlyArray<{ jugadorId: string; won: boolean }>
): MatchAttribution[] {
  const byId = new Map<string, MatchAttribution>();
  for (const slot of slots) {
    const row = byId.get(slot.jugadorId) ?? {
      jugadorId: slot.jugadorId,
      victorias: 0,
      derrotas: 0,
    };
    if (slot.won) row.victorias += 1;
    else row.derrotas += 1;
    byId.set(slot.jugadorId, row);
  }
  return Array.from(byId.values());
}
