#!/usr/bin/env node
/**
 * Nivel A del webhook. Solo peticiones que no crean ni modifican filas.
 * No corre salvo WEBHOOK_NIVEL_A=1. No imprime el secreto.
 * No inserta, no actualiza, no borra y no envía correo.
 * El UUID es fijo y no pertenece a la cola.
 * Confirmar las 509 filas y el log de envíos es una lectura aparte; este script no la hace.
 */
const NIL_ID = "00000000-0000-4000-8000-000000000000";

if (process.env.WEBHOOK_NIVEL_A !== "1") {
  console.log("SKIP verify-webhook-nivel-a: WEBHOOK_NIVEL_A no es 1");
  process.exit(0);
}

const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
const webhookSecret = process.env.NOTIFICACIONES_WEBHOOK_SECRET || "";

if (!url || !publishable) {
  console.error("FAIL faltan URL o apikey para el nivel A");
  process.exit(1);
}

const endpoint = `${url}/functions/v1/procesar-notificaciones-evento`;

async function post(headers, body) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { apikey: publishable, "Content-Type": "application/json", ...headers },
    body,
  });
  const text = await response.text();
  if (/eyJ|sb_secret_|sb_publishable_/.test(text)) {
    throw new Error("la respuesta incluye material de credencial");
  }
  return { status: response.status, text };
}

function assertFunctionUnauthorized(result, label) {
  const gateway = result.text.includes("UNAUTHORIZED_NO_AUTH_HEADER");
  const functionBody = result.text.includes("\"error\":\"Unauthorized\"");
  if (result.status !== 401 || gateway || !functionBody) {
    console.error(`FAIL ${label}: la respuesta no es el 401 de la función`);
    process.exit(1);
  }
}

const missing = await post({}, "{}");
const wrong = await post({ "x-notificaciones-secret": "nivel-a-secreto-incorrecto" }, "{}");
console.log(`sin secreto status=${missing.status}`);
console.log(`secreto incorrecto status=${wrong.status}`);
assertFunctionUnauthorized(missing, "sin secreto");
assertFunctionUnauthorized(wrong, "secreto incorrecto");

if (!webhookSecret) {
  console.log("SKIP uuid inexistente: falta NOTIFICACIONES_WEBHOOK_SECRET");
  process.exit(2);
}

const skipped = await post(
  { "x-notificaciones-secret": webhookSecret },
  JSON.stringify({ record: { id: NIL_ID } }),
);
console.log(`uuid inexistente status=${skipped.status} body=${skipped.text}`);
if (skipped.status !== 200 || !skipped.text.includes("\"skipped\":true")) process.exit(1);
