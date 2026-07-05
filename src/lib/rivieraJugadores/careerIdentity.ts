import { supabase } from "../supabaseClient";
import type { RivieraIdentityEnsureResult } from "./careerIdentity.types";

export type { RivieraIdentityEnsureResult } from "./careerIdentity.types";

function parseEnsureResult(raw: unknown): RivieraIdentityEnsureResult | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;

  const officialPlayerKey =
    typeof row.official_player_key === "string" ? row.official_player_key : null;
  const rivieraJugadorId =
    typeof row.riviera_jugador_id === "string" ? row.riviera_jugador_id : null;
  const registrationJugadorId =
    typeof row.registration_jugador_id === "string"
      ? row.registration_jugador_id
      : null;

  if (!officialPlayerKey || !rivieraJugadorId || !registrationJugadorId) {
    return null;
  }

  return {
    officialPlayerKey,
    rivieraId:
      typeof row.riviera_id === "string" ? row.riviera_id : null,
    rivieraIdSerial:
      typeof row.riviera_id_serial === "number"
        ? row.riviera_id_serial
        : typeof row.riviera_id_serial === "string"
          ? Number(row.riviera_id_serial)
          : null,
    rivieraJugadorId,
    registrationJugadorId,
    debutOrganizerId:
      typeof row.debut_organizer_id === "string"
        ? row.debut_organizer_id
        : null,
    debutAt: typeof row.debut_at === "string" ? row.debut_at : null,
    linkSource:
      typeof row.link_source === "string" ? row.link_source : null,
    identityCreated: row.identity_created === true,
    linkCreated: row.link_created === true,
    rivieraIdAssigned: row.riviera_id_assigned === true,
    debutAssigned: row.debut_assigned === true,
  };
}

/**
 * Punto de entrada único de la app para crear o reutilizar Carrera Deportiva + Riviera ID.
 * Delega en public.ensure_riviera_identity (SECURITY DEFINER).
 */
export async function ensureRivieraIdentity(
  rivieraJugadorId: string
): Promise<RivieraIdentityEnsureResult | null> {
  const id = rivieraJugadorId?.trim();
  if (!id) return null;

  const { data, error } = await supabase.rpc("ensure_riviera_identity", {
    p_riviera_jugador_id: id,
  });

  if (error) throw error;
  return parseEnsureResult(data);
}
