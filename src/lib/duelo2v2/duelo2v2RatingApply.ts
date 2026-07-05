import {
  aplicarRatingDuelo2v2,
  resolveDuelo2v2RatingPlayerIds,
} from "../rivieraJugadores/aplicarRatingPartido";
import { supabase } from "../supabaseClient";
import type { Duelo2v2 } from "./types";

export function duelo2v2PartidoRef(dueloId: string): string {
  return `duelo2v2:${dueloId.trim()}`;
}

async function countRatingRowsForPartido(partidoRef: string): Promise<number> {
  const { count, error } = await supabase
    .from("rating_historial")
    .select("id", { count: "exact", head: true })
    .eq("partido_ref", partidoRef);

  if (error) return 0;
  return count ?? 0;
}

/**
 * Aplica rating si el duelo ya está finalizado pero no hay filas en rating_historial
 * (p. ej. falló al finalizar antes del parche SQL o permisos de grantee).
 */
export async function ensureDuelo2v2RatingApplied(
  organizadorId: string,
  duelo: Pick<
    Duelo2v2,
    | "id"
    | "estado"
    | "ganador"
    | "nombre"
    | "pareja_a_j1_id"
    | "pareja_a_j2_id"
    | "pareja_b_j1_id"
    | "pareja_b_j2_id"
  >
): Promise<boolean> {
  if (duelo.estado !== "finalizado" || !duelo.ganador) return false;

  const partidoRef = duelo2v2PartidoRef(duelo.id);
  const existing = await countRatingRowsForPartido(partidoRef);
  if (existing >= 4) return true;
  if (existing > 0) {
    console.warn(
      `[rating] duelo ${duelo.id}: historial incompleto (${existing}/4); no se re-aplica automáticamente`
    );
    return false;
  }

  const resolvedIds = await resolveDuelo2v2RatingPlayerIds(organizadorId, duelo);
  if (!resolvedIds) {
    console.warn("[rating] duelo 2v2: no se pudieron resolver ids para rating", duelo.id);
    return false;
  }

  try {
    return await aplicarRatingDuelo2v2({
      id: duelo.id,
      nombre: duelo.nombre,
      ganador: duelo.ganador,
      ...resolvedIds,
    });
  } catch (e) {
    console.warn("[rating] ensureDuelo2v2RatingApplied:", e);
    return false;
  }
}
