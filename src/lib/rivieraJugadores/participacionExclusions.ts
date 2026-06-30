import { supabase } from "../supabaseClient";

function isMissingExclusionRpc(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "42883" ||
    error.code === "PGRST202" ||
    msg.includes("is_jugador_participacion_excluded") ||
    msg.includes("jugador_participacion_exclusiones")
  );
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
      if (isMissingExclusionRpc(error)) return false;
      console.warn("[riviera-jugadores] isParticipacionExcluded:", error);
      return false;
    }
    return data === true;
  } catch (e) {
    console.warn("[riviera-jugadores] isParticipacionExcluded:", e);
    return false;
  }
}
