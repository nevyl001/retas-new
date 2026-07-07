#!/usr/bin/env node
/**
 * Verifica si riviera-career-global-identity-fix.sql está desplegado en la DB del .env
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) throw new Error("No .env");
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
}

loadEnv();
const url = process.env.REACT_APP_SUPABASE_URL;
const key = process.env.REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const host = new URL(url).hostname;

async function checkRpc(name, params) {
  const { data, error } = await supabase.rpc(name, params);
  const missing =
    error &&
    (error.code === "PGRST202" ||
      error.code === "42883" ||
      String(error.message).includes(name));
  return { name, deployed: !missing, error: error?.message ?? null, rowCount: data?.length ?? 0 };
}

async function main() {
  console.log(`DB host (.env): ${host}\n`);

  const checks = await Promise.all([
    checkRpc("riviera_list_participaciones_for_jugador_ids", {
      p_jugador_ids: ["00000000-0000-0000-0000-000000000001"],
      p_limit: 1,
    }),
    checkRpc("resolve_public_player_identity", { p_riviera_id: "RIV-00000041" }),
    checkRpc("get_public_career_jugador_ids", {
      p_jugador_id: "00000000-0000-0000-0000-000000000001",
    }),
    checkRpc("riviera_list_career_participaciones_public", {
      p_jugador_id: "00000000-0000-0000-0000-000000000001",
      p_limit: 1,
    }),
  ]);

  for (const c of checks) {
    console.log(
      `${c.deployed ? "✓" : "✗"} ${c.name}: ${c.deployed ? "desplegado" : "NO desplegado"}${c.error ? ` (${c.error})` : ""}`
    );
  }

  const newRpc = checks[0];
  const fixDeployed = newRpc.deployed;

  console.log("\n── Diagnóstico fix SQL ──\n");
  if (fixDeployed) {
    console.log(
      "riviera_list_participaciones_for_jugador_ids EXISTE → riviera-career-global-identity-fix.sql fue ejecutado (al menos parcialmente)."
    );
  } else {
    console.log(
      "riviera_list_participaciones_for_jugador_ids NO EXISTE → riviera-career-global-identity-fix.sql NO fue ejecutado en esta DB."
    );
  }

  // Victor L / David R probe
  for (const rid of ["RIV-00000071", "RIV-00000041", "RIV-00000003"]) {
    const { data: rows } = await supabase.rpc("resolve_public_player_identity", {
      p_riviera_id: rid,
    });
    const linked = Array.from(
      new Set((rows ?? []).map((r) => r.linked_jugador_id).filter(Boolean))
    );
    const anchor = rows?.[0]?.anchor_jugador_id;
    let careerIds = [];
    if (anchor) {
      const { data: ids } = await supabase.rpc("get_public_career_jugador_ids", {
        p_jugador_id: anchor,
      });
      careerIds = (ids ?? []).map((x) => (typeof x === "string" ? x : x));
    }
    console.log(
      `\n${rid}: perfiles_identity=${linked.length} career_ids=${careerIds.length} anchor=${anchor ?? "null"}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
