import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Evita reenviar el mismo tipo a la misma pareja en un torneo (inscripción, grupo, etc.). */
export async function notifAlreadySentForPair(
  supabase: SupabaseClient,
  torneoExpressId: string,
  pairId: string,
  tipo: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("notificaciones_log")
    .select("id")
    .eq("torneo_express_id", torneoExpressId)
    .eq("pair_id", pairId)
    .eq("tipo", tipo)
    .eq("estado", "enviado")
    .limit(1);
  if (error) {
    console.warn(
      JSON.stringify({
        event: "notif_dedup_check_error",
        error: error.message,
        torneoExpressId,
        pairId,
        tipo,
      }),
    );
    return false;
  }
  return (data?.length ?? 0) > 0;
}
