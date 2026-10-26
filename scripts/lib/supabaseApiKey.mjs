/**
 * La auditoría Node usa el mismo criterio que el navegador:
 * sb_publishable_ y sb_secret_ van solo en apikey.
 * Authorization conserva un JWT real y descarta cualquier otra credencial.
 */
import { createClient } from "@supabase/supabase-js";

export function isJwtCredential(value) {
  const parts = String(value ?? "").split(".");
  if (parts.length !== 3 || !parts[0].startsWith("eyJ")) return false;
  return parts.every((part) => part.length > 0 && !/\s/.test(part));
}

export function sanitizeSupabaseFetch(apiKey, baseFetch = fetch) {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (apiKey && !headers.has("apikey")) headers.set("apikey", apiKey);
    const authorization = headers.get("Authorization");
    if (authorization) {
      const token = authorization.replace(/^Bearer\s+/i, "").trim();
      if (!isJwtCredential(token)) headers.delete("Authorization");
    }
    return baseFetch(input, { ...init, headers });
  };
}

export function resolveAuditKeyMode() {
  const raw = (process.env.RIVIERA_API_KEY_MODE || "legacy").trim().toLowerCase();
  if (raw !== "legacy" && raw !== "new") {
    throw new Error("Invalid RIVIERA_API_KEY_MODE.");
  }
  return raw;
}

function assertKeyForMode(apiKey) {
  if (resolveAuditKeyMode() !== "new") return;
  if (apiKey.startsWith("sb_publishable_") || apiKey.startsWith("sb_secret_")) return;
  throw new Error("RIVIERA_API_KEY_MODE=new exige sb_publishable_ o sb_secret_.");
}

export function createSupabaseAuditClient(url, apiKey) {
  if (!url || !apiKey) throw new Error("Faltan URL o clave de auditoría.");
  assertKeyForMode(apiKey);
  return createClient(url, apiKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: sanitizeSupabaseFetch(apiKey) },
  });
}
