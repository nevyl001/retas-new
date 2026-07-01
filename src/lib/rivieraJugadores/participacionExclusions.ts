import { supabase } from "../supabaseClient";

function isMissingExclusionFeature(
  error: { message?: string; code?: string; status?: number } | null
): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.status === 404 ||
    error.status === 405 ||
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "42883" ||
    error.code === "PGRST202" ||
    error.code === "25006" ||
    msg.includes("is_jugador_participacion_excluded") ||
    msg.includes("jugador_participacion_exclusiones") ||
    msg.includes("read-only transaction")
  );
}

async function isParticipacionExcludedLocal(
  jugadorId: string,
  tipoEvento: string,
  eventoId: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from("jugador_participacion_exclusiones")
    .select("id", { count: "exact", head: true })
    .eq("scope_jugador_id", jugadorId)
    .eq("tipo_evento", tipoEvento)
    .eq("evento_id", eventoId);

  if (error) {
    if (isMissingExclusionFeature(error)) return false;
    return false;
  }
  return (count ?? 0) > 0;
}

/** True si el organizador eliminó este evento y no debe re-importarse. */
export async function isParticipacionExcluded(
  jugadorId: string,
  tipoEvento: string,
  eventoId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("is_jugador_participacion_excluded", {
      p_jugador_id: jugadorId,
      p_tipo_evento: tipoEvento,
      p_evento_id: eventoId,
    });

    if (error) {
      if (isMissingExclusionFeature(error)) {
        return isParticipacionExcludedLocal(jugadorId, tipoEvento, eventoId);
      }
      return isParticipacionExcludedLocal(jugadorId, tipoEvento, eventoId);
    }

    return data === true;
  } catch {
    return isParticipacionExcludedLocal(jugadorId, tipoEvento, eventoId);
  }
}
