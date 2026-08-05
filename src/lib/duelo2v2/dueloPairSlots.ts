import type { CreateDuelo2v2Input, Duelo2v2 } from "./types";

/** Los 8 campos de parejas que exige iniciar un duelo. */
export type DueloPairSlots = Pick<
  CreateDuelo2v2Input,
  | "pareja_a_j1_id"
  | "pareja_a_j2_id"
  | "pareja_a_j1_nombre"
  | "pareja_a_j2_nombre"
  | "pareja_b_j1_id"
  | "pareja_b_j2_id"
  | "pareja_b_j1_nombre"
  | "pareja_b_j2_nombre"
>;

type PersistedDuelo = Pick<
  Duelo2v2,
  | "pareja_a_j1_id"
  | "pareja_a_j2_id"
  | "pareja_a_j1_nombre"
  | "pareja_a_j2_nombre"
  | "pareja_b_j1_id"
  | "pareja_b_j2_id"
  | "pareja_b_j1_nombre"
  | "pareja_b_j2_nombre"
>;

/**
 * Parejas ya guardadas en el duelo, listas para iniciar.
 *
 * Cuando la convocatoria alcanza los 4 confirmados, el adaptador
 * `_open_reg_sync_duelo_slots` llena los 4 slots del duelo mientras el estado
 * sigue en `configuracion`. Antes el botón "Iniciar juego" solo miraba el
 * borrador local del constructor de parejas, que arranca vacío y no se
 * hidrataba: el duelo quedaba imposible de iniciar (incidente 2026-08-05).
 *
 * Devuelve null si falta cualquier id/nombre o si los 4 jugadores no son
 * distintos — mismas condiciones que valida `startDuelo2v2`.
 */
export function resolvePersistedDueloPairs(
  duelo: PersistedDuelo
): DueloPairSlots | null {
  const slots = {
    pareja_a_j1_id: duelo.pareja_a_j1_id?.trim() || "",
    pareja_a_j2_id: duelo.pareja_a_j2_id?.trim() || "",
    pareja_a_j1_nombre: duelo.pareja_a_j1_nombre?.trim() || "",
    pareja_a_j2_nombre: duelo.pareja_a_j2_nombre?.trim() || "",
    pareja_b_j1_id: duelo.pareja_b_j1_id?.trim() || "",
    pareja_b_j2_id: duelo.pareja_b_j2_id?.trim() || "",
    pareja_b_j1_nombre: duelo.pareja_b_j1_nombre?.trim() || "",
    pareja_b_j2_nombre: duelo.pareja_b_j2_nombre?.trim() || "",
  };

  if (Object.values(slots).some((value) => !value)) return null;

  const ids = [
    slots.pareja_a_j1_id,
    slots.pareja_a_j2_id,
    slots.pareja_b_j1_id,
    slots.pareja_b_j2_id,
  ];
  if (new Set(ids).size !== 4) return null;

  return slots;
}
