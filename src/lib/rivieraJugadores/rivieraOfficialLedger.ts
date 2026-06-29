import { supabase } from "../supabaseClient";

/** ROMC-2: intenta escribir al ledger oficial Riviera (idempotente, best-effort). */
export async function tryWriteRivieraOfficialLedger(
  participacionId: string | null | undefined
): Promise<void> {
  if (!participacionId) return;
  try {
    const { error } = await supabase.rpc("try_write_riviera_official_ledger", {
      p_participacion_id: participacionId,
    });
    if (error) {
      console.error("[riviera-official-ledger] try_write:", error);
    }
  } catch (e) {
    console.error("[riviera-official-ledger] try_write:", e);
  }
}
