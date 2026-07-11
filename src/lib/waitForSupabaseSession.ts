import { supabase } from "./supabaseClient";

export type WaitForSupabaseSessionOptions = {
  maxAttempts?: number;
  delayMs?: number;
};

/**
 * Espera a que el cliente REST tenga access_token (evita 401/403 por sync prematuro).
 */
export async function waitForSupabaseSession(
  options?: WaitForSupabaseSessionOptions
): Promise<boolean> {
  const maxAttempts = options?.maxAttempts ?? 4;
  const delayMs = options?.delayMs ?? 150;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      return true;
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return false;
}
