import { resolveJugadorIdForRating } from "../rivieraJugadores/organizerPlayerAccess";
import type { RatingMovimientoPartido } from "../rivieraJugadores/types";
import { fetchRatingMovimientosByPartidoRef } from "../rivieraJugadores/rivieraJugadoresService";
import { duelo2v2PartidoRef } from "./duelo2v2RatingApply";

/** Mapea movimientos de rating (p. ej. perfil origen) a los ids del duelo en pantalla. */
export async function mapRatingMovimientosToDueloSlots(
  organizadorId: string,
  slotIds: (string | null | undefined)[],
  moves: RatingMovimientoPartido[]
): Promise<Record<string, RatingMovimientoPartido>> {
  const byJugadorId = new Map(moves.map((m) => [m.jugadorId, m]));
  const result: Record<string, RatingMovimientoPartido> = {};

  for (const slotId of slotIds) {
    const id = slotId?.trim();
    if (!id) continue;
    const forRating = await resolveJugadorIdForRating(organizadorId, id);
    const move = byJugadorId.get(forRating) ?? byJugadorId.get(id);
    if (move) result[id] = move;
  }

  return result;
}

/** Rating post-partido indexado por id de pareja del duelo (gestión + vista pública). */
export async function fetchDuelo2v2RatingBySlot(
  organizadorId: string,
  dueloId: string,
  slotIds: (string | null | undefined)[]
): Promise<Record<string, RatingMovimientoPartido>> {
  const moves = await fetchRatingMovimientosByPartidoRef(
    duelo2v2PartidoRef(dueloId)
  );
  if (moves.length === 0) return {};
  return mapRatingMovimientosToDueloSlots(organizadorId, slotIds, moves);
}
