import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { secretsEqual } from "./webhookAuth.ts";

/**
 * Lectura de credenciales de Edge Functions.
 * RIVIERA_API_KEY_MODE=legacy (valor inicial y ausente) ignora sb_* aunque existan,
 * incluida RIVIERA_SUPABASE_SECRET_KEY. Agregarla como secreto no cambia producción.
 * RIVIERA_API_KEY_MODE=new usa SUPABASE_SECRET_KEYS.default si empieza por sb_secret_.
 * Si esa entrada no está, usa RIVIERA_SUPABASE_SECRET_KEY con el mismo prefijo.
 * Si las dos están y no coinciden, el arranque se detiene.
 * No vuelve a SUPABASE_SERVICE_ROLE_KEY.
 * Cualquier otro modo detiene el arranque.
 * Nunca registra el valor.
 *
 * Retirar RIVIERA_SUPABASE_SECRET_KEY solo cuando SUPABASE_SECRET_KEYS.default
 * ya sea sb_secret_ y el arranque en modo new haya pasado con las dos presentes.
 * Entonces borrar el secreto personalizado y republicar. No borrarlo mientras
 * default siga vacío.
 *
 * La comprobación de JWT debe mantenerse igual que src/lib/supabaseApiKey.ts.
 */

export function isJwtCredential(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 3 || !parts[0].startsWith("eyJ")) return false;
  return parts.every((part) => part.length > 0 && !/\s/.test(part));
}

export function sanitizeCredentialHeaders(apiKey: string, headers: Headers): Headers {
  const next = new Headers(headers);
  if (!next.has("apikey")) next.set("apikey", apiKey);
  const authorization = next.get("Authorization");
  if (!authorization) return next;
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!isJwtCredential(token)) next.delete("Authorization");
  return next;
}

function readNamedKey(envName: string, prefix: string): string | null {
  const raw = Deno.env.get(envName);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const value = (parsed as Record<string, unknown>).default;
    if (typeof value === "string" && value.startsWith(prefix)) return value;
  } catch {
    return null;
  }
  return null;
}

export function readApiKeyMode(): "legacy" | "new" {
  const raw = (Deno.env.get("RIVIERA_API_KEY_MODE") ?? "legacy").trim().toLowerCase();
  if (raw === "legacy" || raw === "new") return raw;
  throw new Error("Invalid RIVIERA_API_KEY_MODE.");
}

function readCustomSecret(): string | null {
  const raw = (Deno.env.get("RIVIERA_SUPABASE_SECRET_KEY") ?? "").trim();
  if (!raw) return null;
  if (!raw.startsWith("sb_secret_")) {
    throw new Error("RIVIERA_SUPABASE_SECRET_KEY must start with sb_secret_.");
  }
  return raw;
}

export function readSecretCredential(): string {
  if (readApiKeyMode() === "new") {
    const injected = readNamedKey("SUPABASE_SECRET_KEYS", "sb_secret_");
    const custom = readCustomSecret();
    if (injected && custom && !secretsEqual(injected, custom)) {
      throw new Error("RIVIERA_SUPABASE_SECRET_KEY does not match SUPABASE_SECRET_KEYS.default.");
    }
    const selected = injected ?? custom;
    if (!selected) throw new Error("Missing sb_secret_ for RIVIERA_API_KEY_MODE=new.");
    return selected;
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!legacy) throw new Error("Missing Supabase service credential.");
  return legacy;
}

export type CredentialKind = "sb_secret" | "sb_publishable" | "legacy_jwt" | "other";

export function credentialKind(value: string): CredentialKind {
  if (value.startsWith("sb_secret_")) return "sb_secret";
  if (value.startsWith("sb_publishable_")) return "sb_publishable";
  if (isJwtCredential(value)) return "legacy_jwt";
  return "other";
}

/** Informe de arranque. Solo modo y tipo; el valor no entra en el objeto. */
export function credentialSelectionReport(input: {
  module: string;
  secret: string;
  publishable?: string;
}): {
  event: "credential_selection";
  module: string;
  mode: "legacy" | "new";
  secretKind: CredentialKind;
  publishableKind: CredentialKind | "unused";
} {
  const mode = readApiKeyMode();
  const secretKind = credentialKind(input.secret);
  const publishableKind = input.publishable ? credentialKind(input.publishable) : "unused";
  if (mode === "new" && secretKind !== "sb_secret") {
    throw new Error("Invalid secret selection for RIVIERA_API_KEY_MODE=new.");
  }
  if (mode === "new" && publishableKind !== "unused" && publishableKind !== "sb_publishable") {
    throw new Error("Invalid publishable selection for RIVIERA_API_KEY_MODE=new.");
  }
  return {
    event: "credential_selection",
    module: input.module,
    mode,
    secretKind,
    publishableKind,
  };
}

export function logCredentialSelection(input: {
  module: string;
  secret: string;
  publishable?: string;
}): void {
  const report = credentialSelectionReport(input);
  const line = JSON.stringify(report);
  if (line.includes(input.secret) || (input.publishable && line.includes(input.publishable))) {
    throw new Error("credential selection log would expose a secret");
  }
  console.log(line);
}

export function readPublishableCredential(): string {
  if (readApiKeyMode() === "new") {
    const modern = readNamedKey("SUPABASE_PUBLISHABLE_KEYS", "sb_publishable_");
    if (!modern) {
      throw new Error("Missing sb_publishable_ default for RIVIERA_API_KEY_MODE=new.");
    }
    return modern;
  }
  const legacy = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!legacy) throw new Error("Missing Supabase publishable credential.");
  return legacy;
}

export function createCredentialClient(
  url: string,
  apiKey: string,
  authorization?: string,
) {
  const headers: Record<string, string> = {};
  if (authorization) headers.Authorization = authorization;
  return createClient(url, apiKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers,
      fetch: (input, init) => {
        const next = sanitizeCredentialHeaders(apiKey, new Headers(init?.headers));
        return fetch(input, { ...init, headers: next });
      },
    },
  });
}
