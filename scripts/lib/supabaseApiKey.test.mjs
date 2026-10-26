import assert from "node:assert/strict";
import test from "node:test";
import {
  createSupabaseAuditClient,
  isJwtCredential,
  sanitizeSupabaseFetch,
} from "./supabaseApiKey.mjs";

const LEGACY = "eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYW5vbiJ9.signature";
const USER_JWT = "eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.signature";

test("un JWT de usuario se conserva y sb_publishable_ no va como Bearer", async () => {
  assert.equal(isJwtCredential(LEGACY), true);
  assert.equal(isJwtCredential("sb_publishable_default"), false);
  const calls = [];
  const wrapped = sanitizeSupabaseFetch("sb_publishable_default", async (input, init) => {
    calls.push(new Headers(init.headers));
    return new Response("ok");
  });
  await wrapped("https://example.test/rest/v1/users", {
    headers: {
      apikey: "sb_publishable_default",
      Authorization: "Bearer sb_publishable_default",
    },
  });
  await wrapped("https://example.test/auth/v1/user", {
    headers: {
      apikey: "sb_publishable_default",
      Authorization: `Bearer ${USER_JWT}`,
    },
  });
  assert.equal(calls[0].get("Authorization"), null);
  assert.equal(calls[0].get("apikey"), "sb_publishable_default");
  assert.equal(calls[1].get("Authorization"), `Bearer ${USER_JWT}`);
});

test("sb_secret_ tampoco va como Bearer", async () => {
  const calls = [];
  const wrapped = sanitizeSupabaseFetch("sb_secret_default", async (input, init) => {
    calls.push(new Headers(init.headers));
    return new Response("ok");
  });
  await wrapped("https://example.test/rest/v1/rpc/audit", {
    headers: { Authorization: "Bearer sb_secret_default" },
  });
  assert.equal(calls[0].get("Authorization"), null);
  assert.equal(calls[0].get("apikey"), "sb_secret_default");
});

test("modo new rechaza una clave legacy y no crea el cliente", () => {
  const previous = process.env.RIVIERA_API_KEY_MODE;
  process.env.RIVIERA_API_KEY_MODE = "new";
  try {
    assert.throws(
      () => createSupabaseAuditClient("https://example.supabase.co", LEGACY),
      /sb_publishable_ o sb_secret_/
    );
  } finally {
    if (previous === undefined) delete process.env.RIVIERA_API_KEY_MODE;
    else process.env.RIVIERA_API_KEY_MODE = previous;
  }
});
