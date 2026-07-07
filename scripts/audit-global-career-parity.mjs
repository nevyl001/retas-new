#!/usr/bin/env node
/**
 * Auditoría de paridad carrera global: admin vs público vs datos reales.
 *
 * Uso:
 *   npm run audit:global-career-parity
 *   npm run audit:global-career-parity -- --offline
 *   npm run audit:global-career-parity -- --riviera-id RIV-00000003
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const REQUIRED_RIVIERA_IDS = [
  "RIV-00000071", // Victor L
  "RIV-00000003", // Alejandro R
  "RIV-00000031", // Edgardo T
  "RIV-00000011", // Nevyl
  "RIV-00000009", // Daniel N
  "RIV-00000024", // Sebastian
  "RIV-00000019", // Irving
  "RIV-00000041", // David R
];

function loadEnv() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return false;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const val = m[2].replace(/^["']|["']$/g, "").trim();
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
  return Boolean(
    process.env.REACT_APP_SUPABASE_URL && process.env.REACT_APP_SUPABASE_ANON_KEY
  );
}

function readSrc(relPath) {
  return readFileSync(resolve(root, relPath), "utf8");
}

function runOfflineChecks() {
  console.log("\n── Checks offline (código) ──\n");
  let ok = true;
  const fail = (msg) => {
    console.error(`✗ ${msg}`);
    ok = false;
  };
  const pass = (msg) => {
    console.log(`✓ ${msg}`);
  };

  const ficha = readSrc("src/components/jugadores/JugadorFicha.tsx");
  if (ficha.includes("loadOrganizerScopedPlayerView")) {
    fail("JugadorFicha aún usa loadOrganizerScopedPlayerView");
  } else {
    pass("JugadorFicha → getAdminPlayerProfileData");
  }

  if (!ficha.includes("getAdminPlayerProfileData")) {
    fail("JugadorFicha no importa getAdminPlayerProfileData");
  }

  const adminMotor = readSrc("src/lib/rivieraJugadores/playerIdentityService.ts");
  if (!adminMotor.includes("getAdminPlayerProfileData")) {
    fail("playerIdentityService sin getAdminPlayerProfileData");
  } else {
    pass("playerIdentityService.getAdminPlayerProfileData definido");
  }

  if (!adminMotor.includes("mergeLocalJugadorWithGlobalCareer")) {
    fail("Falta mergeLocalJugadorWithGlobalCareer");
  } else {
    pass("mergeLocalJugadorWithGlobalCareer definido");
  }

  const publicFicha = readSrc("src/components/jugadores/JugadorPublicFicha.tsx");
  if (!publicFicha.includes("getPublicPlayerProfileData")) {
    fail("JugadorPublicFicha no usa getPublicPlayerProfileData");
  } else {
    pass("JugadorPublicFicha → getPublicPlayerProfileData");
  }

  if (!existsSync(resolve(root, "supabase/audit-global-career-parity.sql"))) {
    fail("Falta supabase/audit-global-career-parity.sql");
  } else {
    pass("SQL audit-global-career-parity.sql presente");
  }

  return ok;
}

async function fetchCareerIds(supabase, anchorJugadorId) {
  const { data, error } = await supabase.rpc("get_public_career_jugador_ids", {
    p_jugador_id: anchorJugadorId,
  });
  if (error) throw error;
  return (data ?? []).map((row) =>
    typeof row === "string" ? row : String(row?.jugador_id ?? row)
  );
}

async function countParticipaciones(supabase, jugadorIds) {
  if (jugadorIds.length === 0) return 0;
  const { count, error } = await supabase
    .from("jugador_participaciones")
    .select("id", { count: "exact", head: true })
    .in("jugador_id", jugadorIds);
  if (error) throw error;
  return count ?? 0;
}

async function runLiveAudit(filterRivieraId) {
  const url = process.env.REACT_APP_SUPABASE_URL;
  const key = process.env.REACT_APP_SUPABASE_ANON_KEY;
  const supabase = createClient(url, key);

  console.log("\n── Auditoría live (Supabase) ──\n");

  const { data: identities, error: idErr } = await supabase
    .from("riviera_official_player_identity")
    .select("riviera_id, official_player_key, canonical_riviera_jugador_id");
  if (idErr) throw idErr;

  const targets = (identities ?? []).filter((row) => {
    if (!filterRivieraId) return true;
    return String(row.riviera_id) === filterRivieraId;
  });

  const discrepancies = [];

  for (const identity of targets) {
    const rivieraId = String(identity.riviera_id);
    const officialKey = String(identity.official_player_key);

    const { data: links } = await supabase
      .from("riviera_official_player_profile_link")
      .select("riviera_jugador_id")
      .eq("official_player_key", officialKey);

    const profileIds = (links ?? []).map((l) => String(l.riviera_jugador_id));
    if (profileIds.length <= 1) continue;

    const anchor =
      identity.canonical_riviera_jugador_id?.trim() || profileIds[0];
    const careerIds = await fetchCareerIds(supabase, anchor);
    const globalCount = await countParticipaciones(supabase, careerIds);

    let maxAdminLegacy = 0;
    let minAdminLegacy = Infinity;

    for (const profileId of profileIds) {
      const { data: profile } = await supabase
        .from("riviera_jugadores")
        .select("organizador_id")
        .eq("id", profileId)
        .maybeSingle();
      const orgId = String(profile?.organizador_id ?? "");

      const { data: rows } = await supabase
        .from("jugador_participaciones")
        .select("id, metadata")
        .eq("jugador_id", profileId);

      const adminCount = (rows ?? []).filter((row) => {
        const metaOrg = String(row.metadata?.organizador_id ?? "").trim();
        return (metaOrg || orgId) === orgId;
      }).length;

      maxAdminLegacy = Math.max(maxAdminLegacy, adminCount);
      minAdminLegacy = Math.min(minAdminLegacy, adminCount);
    }

    const faltantes = globalCount - maxAdminLegacy;
    const alerta =
      faltantes > 0
        ? "CARRERA_PARCIAL_EN_ADMIN_LEGACY"
        : maxAdminLegacy !== minAdminLegacy
        ? "HISTORIAL_CAMBIA_POR_CLUB_LEGACY"
        : "OK_POST_FIX";

    if (alerta !== "OK_POST_FIX") {
      discrepancies.push({ rivieraId, alerta, globalCount, maxAdminLegacy, faltantes });
    }

    const marker = REQUIRED_RIVIERA_IDS.includes(rivieraId) ? "★" : " ";
    console.log(
      `${marker} ${rivieraId}: global=${globalCount} admin_legacy_max=${maxAdminLegacy} faltantes=${faltantes} → ${alerta}`
    );
  }

  console.log("\n── Casos obligatorios ──\n");
  for (const rid of REQUIRED_RIVIERA_IDS) {
    const found = discrepancies.find((d) => d.rivieraId === rid);
    if (found) {
      console.log(`✗ ${rid}: ${found.alerta} (faltantes=${found.faltantes})`);
    } else {
      console.log(`✓ ${rid}: sin discrepancia admin_legacy vs global`);
    }
  }

  console.log(
    `\nTotal discrepancias admin_legacy vs global: ${discrepancies.length}`
  );
  console.log(
    "Nota: tras el fix de código, admin y público usan mergeCareerParticipacionesForIdentity."
  );
  console.log(
    "Este reporte compara datos reales vs motor legacy (pre-fix) para evidencia."
  );

  return discrepancies.length === 0;
}

async function main() {
  const args = process.argv.slice(2);
  const offline = args.includes("--offline");
  const rivIdx = args.indexOf("--riviera-id");
  const filterRivieraId = rivIdx >= 0 ? args[rivIdx + 1] : null;

  const offlineOk = runOfflineChecks();
  if (!offlineOk) process.exit(1);

  if (offline) {
    console.log("\n✓ Auditoría offline completada.");
    process.exit(0);
  }

  if (!loadEnv()) {
    console.error("\n✗ Sin .env — usar --offline o configurar Supabase.");
    process.exit(1);
  }

  const liveOk = await runLiveAudit(filterRivieraId);
  process.exit(liveOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
