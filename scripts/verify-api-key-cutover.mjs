#!/usr/bin/env node
/**
 * Pruebas no destructivas para cuando RIVIERA_API_KEY_MODE=new
 * y existan sb_publishable_ / sb_secret_.
 * No imprime claves, no crea clases y no toca saldos ni ledger.
 * Sin ese modo termina en SKIP.
 */
const mode = (process.env.RIVIERA_API_KEY_MODE || "legacy").trim().toLowerCase();

function prefix(value) {
  if (!value) return "missing";
  if (value.startsWith("sb_publishable_")) return "sb_publishable";
  if (value.startsWith("sb_secret_")) return "sb_secret";
  if (value.startsWith("eyJ")) return "jwt";
  return "other";
}

function namedDefault(raw, expectedPrefix) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const value = parsed?.default;
    if (typeof value === "string" && value.startsWith(expectedPrefix)) return value;
  } catch {
    return null;
  }
  return null;
}

if (mode !== "new") {
  console.log("SKIP verify-api-key-cutover: RIVIERA_API_KEY_MODE no es new");
  process.exit(0);
}

const url = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const publishable =
  (process.env.SUPABASE_PUBLISHABLE_KEY || "").startsWith("sb_publishable_")
    ? process.env.SUPABASE_PUBLISHABLE_KEY
    : namedDefault(process.env.SUPABASE_PUBLISHABLE_KEYS, "sb_publishable_");
const secret =
  (process.env.SUPABASE_SECRET_KEY || "").startsWith("sb_secret_")
    ? process.env.SUPABASE_SECRET_KEY
    : namedDefault(process.env.SUPABASE_SECRET_KEYS, "sb_secret_");
const legacyService = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!url || !publishable || !secret) {
  console.error("FAIL faltan URL o claves sb_ con el modo new");
  process.exit(1);
}

console.log(
  `keys publishable=${prefix(publishable)} secret=${prefix(secret)} legacy_service=${prefix(legacyService)}`,
);

const checks = [];

async function check(name, run) {
  try {
    const result = await run();
    checks.push({ name, ...result });
    console.log(`${result.ok ? "PASS" : "FAIL"} ${name} status=${result.status}`);
  } catch (error) {
    checks.push({ name, ok: false, status: "error" });
    console.log(`FAIL ${name} ${error instanceof Error ? error.message : "error"}`);
  }
}

await check("rest-publishable", async () => {
  const response = await fetch(`${url}/rest/v1/organizador_game_modes?select=organizador_id&limit=1`, {
    headers: { apikey: publishable, Accept: "application/json" },
  });
  return { ok: response.status === 200, status: response.status };
});

await check("auth-settings", async () => {
  const response = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: publishable },
  });
  return { ok: response.status === 200, status: response.status };
});

await check("student-login-without-password", async () => {
  const response = await fetch(`${url}/functions/v1/coaching-activate-student`, {
    method: "POST",
    headers: { apikey: publishable, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "student_login" }),
  });
  return { ok: response.status === 400 || response.status === 401, status: response.status };
});

await check("webhook-without-secret", async () => {
  const response = await fetch(`${url}/functions/v1/procesar-notificaciones-evento`, {
    method: "POST",
    headers: { apikey: publishable, "Content-Type": "application/json" },
    body: "{}",
  });
  const text = await response.text();
  return {
    ok: response.status === 401 && !/eyJ|sb_secret_|sb_publishable_/.test(text),
    status: response.status,
  };
});

if (legacyService) {
  await check("legacy-service-not-used-as-browser-key", async () => {
    return { ok: !legacyService.startsWith("sb_publishable_"), status: "local" };
  });
}

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) process.exit(1);
