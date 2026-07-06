#!/usr/bin/env node
/**
 * Auditoría de integridad de carrera Riviera ID.
 *
 * Uso:
 *   npm run audit:career-integrity
 *   npm run audit:career-integrity -- --fix
 *   npm run audit:career-integrity -- --offline
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const HACKPADEL = "e724de97-3552-4a01-a269-f621e6f1ed26";
const TARGET_PLAYERS = ["Daniel N", "Sebastian", "TestplayerCT1", "TestplaCT2", "Nevyl"];

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

function fail(msg) {
  console.error(`✗ ${msg}`);
  return false;
}

function pass(msg) {
  console.log(`✓ ${msg}`);
  return true;
}

function readSrc(relPath) {
  return readFileSync(resolve(root, relPath), "utf8");
}

function runOfflineChecks() {
  console.log("\n── Checks offline (código) ──\n");
  let ok = true;

  const rankingPts = readSrc("src/components/jugadores/RankingPtsDisplay.tsx");
  if (!rankingPts.includes("buildJugadorPuntosBreakdown")) {
    ok = fail("RankingPtsDisplay no usa buildJugadorPuntosBreakdown");
  } else {
    ok = pass("RankingPtsDisplay → buildJugadorPuntosBreakdown") && ok;
  }

  const ficha = readSrc("src/components/jugadores/JugadorPuntosBreakdown.tsx");
  if (!ficha.includes("buildJugadorPuntosBreakdown")) {
    ok = fail("JugadorPuntosBreakdown no usa buildJugadorPuntosBreakdown");
  } else {
    ok = pass("JugadorPuntosBreakdown → buildJugadorPuntosBreakdown") && ok;
  }

  const identity = readSrc("src/lib/rivieraJugadores/playerIdentityService.ts");
  if (!identity.includes("resolvePlayerPointsBreakdown")) {
    ok = fail("getPublicPlayerProfileData no usa resolvePlayerPointsBreakdown");
  } else {
    ok = pass("playerIdentityService → resolvePlayerPointsBreakdown") && ok;
  }

  const resolver = readSrc("src/lib/rivieraJugadores/jugadorIdResolver.ts");
  if (!resolver.includes("requireOfficialProfileLinkForParticipacion")) {
    ok = fail("resolveJugadorIdForParticipacion sin requireOfficialProfileLink");
  } else {
    ok = pass("resolveJugadorIdForParticipacion exige link antes de participar") && ok;
  }

  const pipeline = readSrc(
    "src/lib/rivieraJugadores/careerEventPipeline/pipeline.ts"
  );
  if (!pipeline.includes("validateCareerEventPreClose")) {
    ok = fail("finalizeCareerEvent sin validateCareerEventPreClose");
  } else {
    ok = pass("finalizeCareerEvent valida pre-cierre") && ok;
  }

  if (existsSync(resolve(root, "supabase/career-profile-link-integrity.sql"))) {
    ok = pass("Existe supabase/career-profile-link-integrity.sql") && ok;
  } else {
    ok = fail("Falta supabase/career-profile-link-integrity.sql") && ok;
  }

  for (const sql of [
    "supabase/diagnose-orphan-career-profiles.sql",
    "supabase/repair-orphan-career-profile-links.sql",
    "supabase/diagnose-career-event-host-organizer.sql",
    "supabase/repair-career-event-host-organizer.sql",
    "supabase/diagnose-historical-orphan-parent-participaciones.sql",
    "supabase/repair-historical-orphan-parent-participaciones.sql",
    "supabase/career-event-host-manual-overrides.sql",
    "supabase/seed-career-event-host-manual-overrides.sql",
  ]) {
    if (!existsSync(resolve(root, sql))) {
      ok = fail(`Falta ${sql}`);
    } else {
      ok = pass(`Existe ${sql}`) && ok;
    }
  }

  return ok;
}

function groupPointsByOrg(rows, homeById) {
  const byOrg = new Map();
  for (const row of rows) {
    const meta = String(row.metadata?.organizador_id ?? "").trim();
    const home = homeById.get(row.jugador_id) ?? "";
    const org = meta || home;
    if (!org) continue;
    byOrg.set(org, (byOrg.get(org) ?? 0) + Number(row.puntos_obtenidos ?? 0));
  }
  const total = [...byOrg.values()].reduce((s, n) => s + n, 0);
  return { byOrg, total };
}

async function runOnlineChecks(sb, fix) {
  console.log("\n── Checks online (Supabase) ──\n");
  let ok = true;

  const { data: orphans, error: orphanErr } = await sb.rpc(
    "_riviera_orphan_profile_audit"
  );
  if (orphanErr) {
    if (orphanErr.message?.includes("does not exist")) {
      ok = fail(
        "RPC _riviera_orphan_profile_audit no desplegado — ejecutar career-profile-link-integrity.sql"
      );
    } else {
      ok = fail(`orphan audit: ${orphanErr.message}`);
    }
  } else {
    const high = (orphans ?? []).filter((r) => r.confidence === "HIGH");
    const withPts = (orphans ?? []).filter((r) => Number(r.total_puntos) > 0);
    if (high.length > 0) {
      ok =
        fail(
          `${high.length} perfiles huérfanos HIGH con puntos: ${high
            .map((r) => r.orphan_nombre)
            .join(", ")}`
        ) && ok;
      if (fix) {
        const { data: repairResult, error: repairErr } = await sb.rpc(
          "riviera_repair_orphan_profile_links_high"
        );
        if (repairErr) {
          ok = fail(`repair orphans: ${repairErr.message}`) && ok;
        } else {
          pass(`repair orphans: ${JSON.stringify(repairResult)}`);
        }
      }
    } else {
      ok = pass("Sin perfiles huérfanos HIGH pendientes") && ok;
    }
    if (withPts.length > 0 && high.length === 0) {
      const review = withPts.filter((r) => r.confidence === "REVIEW");
      if (review.length) {
        console.warn(
          `⚠ ${review.length} huérfanos en REVIEW (revisión manual):`,
          review.map((r) => r.orphan_nombre).join(", ")
        );
      }
    }
  }

  const { data: metaBad, error: metaErr } = await sb
    .from("jugador_participaciones")
    .select("id, evento_nombre, puntos_obtenidos, metadata")
    .gt("puntos_obtenidos", 0)
    .limit(500);
  if (metaErr) {
    ok = fail(`participaciones: ${metaErr.message}`) && ok;
  } else {
    const isHistoricalOrphanDebt = (metadata) => {
      const status = String(metadata?.integrity_status ?? "");
      return (
        status === "orphan_parent_review" ||
        status === "repaired_orphan_parent" ||
        metadata?.repaired_from_orphan_parent === true ||
        metadata?.repaired_from_orphan_parent === "true"
      );
    };

    const missingOrgCritical = (metaBad ?? []).filter((r) => {
      if (String(r.metadata?.organizador_id ?? "").trim()) return false;
      if (isHistoricalOrphanDebt(r.metadata)) return false;
      return true;
    });
    const missingOrgHistorical = (metaBad ?? []).filter(
      (r) =>
        !String(r.metadata?.organizador_id ?? "").trim() &&
        isHistoricalOrphanDebt(r.metadata)
    );
    const missingClub = (metaBad ?? []).filter(
      (r) =>
        String(r.metadata?.organizador_id ?? "").trim() &&
        !String(r.metadata?.club_name ?? "").trim()
    );
    if (missingOrgCritical.length > 0) {
      ok =
        fail(
          `${missingOrgCritical.length} participaciones con puntos sin metadata.organizador_id`
        ) && ok;
      if (fix) {
        console.log(
          "  → Ejecutar supabase/repair-historical-orphan-parent-participaciones.sql"
        );
      }
    } else {
      ok = pass("Participaciones con puntos tienen metadata.organizador_id") && ok;
    }
    if (missingOrgHistorical.length > 0) {
      console.warn(
        `⚠ REVIEW_HISTORICO: ${missingOrgHistorical.length} participaciones orphan_parent_review sin org`
      );
    }
    if (missingClub.length > 0) {
      console.warn(
        `⚠ ${missingClub.length} participaciones con puntos sin metadata.club_name (no crítico si tienen org)`
      );
    }
  }

  const { data: dupLinks } = await sb
    .from("riviera_official_player_profile_link")
    .select("riviera_jugador_id");
  if (dupLinks) {
    const seen = new Set();
    let dups = 0;
    for (const row of dupLinks) {
      if (seen.has(row.riviera_jugador_id)) dups++;
      seen.add(row.riviera_jugador_id);
    }
    if (dups > 0) ok = fail(`${dups} duplicados en profile_link`) && ok;
    else ok = pass("Sin duplicados riviera_official_player_profile_link") && ok;
  }

  for (const nombre of TARGET_PLAYERS) {
    const { data: profiles } = await sb
      .from("riviera_jugadores")
      .select("id, nombre, organizador_id")
      .eq("nombre", nombre)
      .eq("estado", "activo");

    if (!profiles?.length) continue;

    const profileIds = profiles.map((p) => p.id);
    const { data: links } = await sb
      .from("riviera_official_player_profile_link")
      .select("riviera_jugador_id")
      .in("riviera_jugador_id", profileIds);
    const linkedSet = new Set((links ?? []).map((l) => l.riviera_jugador_id));
    const anchor =
      profiles.find((p) => linkedSet.has(p.id)) ?? profiles[0];

    const { data: careerIds, error: idsErr } = await sb.rpc(
      "get_public_career_jugador_ids",
      { p_jugador_id: anchor.id }
    );
    if (idsErr) {
      ok = fail(`${nombre}: get_public_career_jugador_ids — ${idsErr.message}`) && ok;
      continue;
    }

    const ids = [...new Set((careerIds ?? []).map(String))];
    const { data: careerRows, error: careerErr } = await sb.rpc(
      "riviera_list_career_participaciones_public",
      { p_jugador_id: anchor.id, p_limit: 500 }
    );
    if (careerErr) {
      ok = fail(`${nombre}: career RPC — ${careerErr.message}`) && ok;
      continue;
    }

    const { data: homeRows } = await sb
      .from("riviera_jugadores")
      .select("id, organizador_id")
      .in("id", ids.length ? ids : [anchor.id]);
    const homeById = new Map(
      (homeRows ?? []).map((r) => [r.id, r.organizador_id])
    );

    const { byOrg, total } = groupPointsByOrg(careerRows ?? [], homeById);
    const hackPts = byOrg.get(HACKPADEL) ?? 0;

    ok =
      pass(
        `${nombre}: career merge ${careerRows?.length ?? 0} filas, HackPadel=${hackPts}, total=${total}`
      ) && ok;

    if (nombre === "Daniel N" && hackPts < 75) {
      ok = fail(`Daniel N: esperado HackPadel≥75, obtuvo ${hackPts}`) && ok;
    }
    if (nombre === "Sebastian" && hackPts < 25) {
      ok = fail(`Sebastian: esperado HackPadel≥25, obtuvo ${hackPts}`) && ok;
    }
    if (nombre === "TestplayerCT1" && hackPts !== 50) {
      ok = fail(`TestplayerCT1: esperado HackPadel=50, obtuvo ${hackPts}`) && ok;
    }
    if (nombre === "TestplaCT2" && hackPts !== 50) {
      ok = fail(`TestplaCT2: esperado HackPadel=50, obtuvo ${hackPts}`) && ok;
    }
  }

  return ok;
}

async function main() {
  const args = process.argv.slice(2);
  const fix = args.includes("--fix");
  const forceOffline = args.includes("--offline");

  console.log("=== AUDITORÍA CAREER INTEGRITY ===");
  if (fix) console.log("Modo: --fix (reparación limitada vía RPC)");

  const offlineOk = runOfflineChecks();
  let onlineOk = true;

  const hasEnv = !forceOffline && loadEnv();
  if (hasEnv) {
    const sb = createClient(
      process.env.REACT_APP_SUPABASE_URL,
      process.env.REACT_APP_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    onlineOk = await runOnlineChecks(sb, fix);
  } else {
    console.log(
      "\n⚠ Sin .env o --offline: solo checks offline. Para prod ejecutar con credenciales.\n"
    );
  }

  const allOk = offlineOk && (forceOffline || !hasEnv || onlineOk);
  console.log(allOk ? "\n✓ AUDITORÍA OK" : "\n✗ AUDITORÍA FALLÓ");
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
