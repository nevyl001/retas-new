#!/usr/bin/env node
/**
 * Auditoría arquitectónica final — carrera global multiclub.
 *
 * Recorre TODOS los Riviera ID y valida:
 *   • Paridad historial entre anclas (admin = público = HP = RO a nivel RPC)
 *   • Eventos y puntos vs jugador_participaciones
 *   • Sin huérfanos, links inconsistentes, carrera parcial
 *
 * Uso:
 *   npm run audit:global-career-parity
 *   npm run audit:global-career-parity -- --offline
 *   npm run audit:global-career-parity -- --riviera-id RIV-00000071
 *   npm run audit:global-career-parity -- --json
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  REQUIRED_RIVIERA_IDS,
  HACK_PADEL_ORG_DEFAULT,
  RIVIERA_OPEN_ORG_DEFAULT,
  auditRivieraIdentity,
  auditOrphanProfiles,
} from "./lib/globalCareerAudit.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

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
  console.log("\n── Arquitectura congelada (código) ──\n");
  let ok = true;
  const fail = (msg) => {
    console.error(`✗ ${msg}`);
    ok = false;
  };
  const pass = (msg) => console.log(`✓ ${msg}`);

  const checks = [
    {
      file: "src/components/jugadores/JugadorFicha.tsx",
      forbid: ["loadOrganizerScopedPlayerView"],
      require: ["getAdminPlayerProfileData"],
      label: "Admin ficha → motor global",
    },
    {
      file: "src/components/jugadores/JugadorPublicFicha.tsx",
      require: ["getPublicPlayerProfileData"],
      label: "Pública ficha → motor global",
    },
    {
      file: "src/lib/rivieraJugadores/playerIdentityService.ts",
      require: [
        "getAdminPlayerProfileData",
        "getPublicPlayerProfileData",
        "discoverCareerLinkedProfiles",
        "mergeLocalJugadorWithGlobalCareer",
      ],
      label: "playerIdentityService unificado",
    },
    {
      file: "src/lib/rivieraJugadores/careerParticipacionesMerge.ts",
      forbid: ["listParticipacionesPublic"],
      require: ["listParticipacionesForJugadorIds"],
      label: "Merge sin filtro org-scoped",
    },
  ];

  for (const check of checks) {
    const src = readSrc(check.file);
    for (const token of check.forbid ?? []) {
      if (src.includes(token)) fail(`${check.label}: prohibido ${token}`);
    }
    for (const token of check.require ?? []) {
      if (!src.includes(token)) fail(`${check.label}: falta ${token}`);
      else pass(`${check.label}: ${token}`);
    }
  }

  const artifacts = [
    "src/lib/rivieraJugadores/careerLinkedProfileDiscovery.ts",
    "supabase/riviera-career-global-identity-fix.sql",
    "supabase/audit-global-career-architecture.sql",
    "supabase/preview-backfill-profile-link-global-career.sql",
    "scripts/lib/globalCareerAudit.mjs",
  ];
  for (const rel of artifacts) {
    if (!existsSync(resolve(root, rel))) fail(`Falta ${rel}`);
    else pass(`Artefacto: ${rel}`);
  }

  return ok;
}

async function fetchAllIdentities(supabase) {
  const { data: fromTable, error } = await supabase
    .from("riviera_official_player_identity")
    .select("riviera_id, official_player_key, canonical_riviera_jugador_id")
    .not("riviera_id", "is", null)
    .order("riviera_id");

  if (!error && (fromTable ?? []).length > 0) {
    return fromTable;
  }

  const { data: links, error: linkErr } = await supabase
    .from("riviera_official_player_profile_link")
    .select(
      "official_player_key, riviera_jugador_id, riviera_official_player_identity(riviera_id, official_player_key, canonical_riviera_jugador_id)"
    );
  if (linkErr) {
    if (fromTable?.length) return fromTable;
    throw linkErr;
  }

  if ((links ?? []).length > 0) {
    const byKey = new Map();
    for (const row of links) {
      const nested = row.riviera_official_player_identity;
      const identity = Array.isArray(nested) ? nested[0] : nested;
      const key = String(identity?.official_player_key ?? row.official_player_key ?? "");
      const rivieraId = String(identity?.riviera_id ?? "");
      if (!key || !rivieraId) continue;
      if (!byKey.has(key)) {
        byKey.set(key, {
          riviera_id: rivieraId,
          official_player_key: key,
          canonical_riviera_jugador_id:
            identity?.canonical_riviera_jugador_id ?? row.riviera_jugador_id,
        });
      }
    }
    if (byKey.size > 0) {
      return Array.from(byKey.values()).sort((a, b) =>
        String(a.riviera_id).localeCompare(String(b.riviera_id))
      );
    }
  }

  const { data: jugadores, error: jugErr } = await supabase
    .from("riviera_jugadores")
    .select("id")
    .eq("estado", "activo");
  if (jugErr) throw jugErr;

  const ids = (jugadores ?? []).map((j) => String(j.id)).filter(Boolean);
  const byRiviera = new Map();

  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40);
    const { data: rpcRows, error: rpcErr } = await supabase.rpc(
      "get_public_riviera_ids_for_jugadores",
      { p_jugador_ids: chunk }
    );
    if (rpcErr) continue;
    for (const row of rpcRows ?? []) {
      const jugadorId = String(row.jugador_id ?? "");
      const rivieraId = String(row.riviera_id ?? "");
      if (!jugadorId || !rivieraId.startsWith("RIV-")) continue;
      if (!byRiviera.has(rivieraId)) {
        byRiviera.set(rivieraId, {
          riviera_id: rivieraId,
          official_player_key: null,
          canonical_riviera_jugador_id: jugadorId,
        });
      }
    }
  }

  for (const [rivieraId, identity] of byRiviera) {
    const anchor = identity.canonical_riviera_jugador_id;
    const { data: identityRows } = await supabase.rpc("resolve_public_player_identity", {
      p_jugador_id: anchor,
    });
    const first = (identityRows ?? [])[0];
    if (first?.official_player_key) {
      identity.official_player_key = String(first.official_player_key);
    }
    if (first?.canonical_jugador_id) {
      identity.canonical_riviera_jugador_id = String(first.canonical_jugador_id);
    }
    byRiviera.set(rivieraId, identity);
  }

  return Array.from(byRiviera.values()).sort((a, b) =>
    String(a.riviera_id).localeCompare(String(b.riviera_id))
  );
}

async function ensureRequiredIdentities(supabase, identities) {
  const byId = new Map(identities.map((i) => [String(i.riviera_id), i]));
  for (const rivieraId of REQUIRED_RIVIERA_IDS) {
    if (byId.has(rivieraId)) continue;
    const { data: rows } = await supabase.rpc("resolve_public_player_identity", {
      p_riviera_id: rivieraId,
    });
    const first = (rows ?? [])[0];
    if (!first?.riviera_id) continue;
    byId.set(rivieraId, {
      riviera_id: rivieraId,
      official_player_key: first.official_player_key ?? null,
      canonical_riviera_jugador_id: first.canonical_jugador_id ?? first.anchor_jugador_id,
    });
  }
  return Array.from(byId.values()).sort((a, b) =>
    String(a.riviera_id).localeCompare(String(b.riviera_id))
  );
}

async function runLiveAudit({ filterRivieraId, jsonOut }) {
  const url = process.env.REACT_APP_SUPABASE_URL;
  const key = process.env.REACT_APP_SUPABASE_ANON_KEY;
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const orgIds = {
    hackpadel:
      process.env.REACT_APP_HACK_PADEL_ORGANIZADOR_ID?.trim() || HACK_PADEL_ORG_DEFAULT,
    riviera:
      process.env.REACT_APP_RIVIERA_PUBLIC_ORGANIZADOR_ID?.trim() ||
      RIVIERA_OPEN_ORG_DEFAULT,
  };

  console.log("\n── Auditoría live — TODOS los Riviera ID ──\n");

  const identities = await ensureRequiredIdentities(
    supabase,
    await fetchAllIdentities(supabase)
  );

  const targets = identities.filter((row) => {
    if (!filterRivieraId) return true;
    return String(row.riviera_id) === filterRivieraId;
  });

  const allIssues = [];
  let multiclubCount = 0;
  const perIdentity = [];

  for (const identity of targets) {
    const result = await auditRivieraIdentity(supabase, identity, orgIds);
    if (result.multiclub) multiclubCount += 1;
    if (result.issues.length > 0) {
      allIssues.push(...result.issues);
    }
    perIdentity.push(result);

    const marker = REQUIRED_RIVIERA_IDS.includes(result.rivieraId) ? "★" : " ";
    const status = result.issues.length === 0 ? "OK" : `FAIL(${result.issues.length})`;
    if (result.issues.length > 0 || result.multiclub) {
      console.log(
        `${marker} ${result.rivieraId} | perfiles=${result.profileCount} | db=${result.eventosDb} rpc=${result.eventosRpc} pts=${result.puntosDb}/${result.puntosRpc} | ${status}`
      );
      for (const issue of result.issues) {
        console.log(`    → ${issue.code}: ${JSON.stringify(issue.details)}`);
      }
    }
  }

  console.log("\n── Perfiles huérfanos (con participaciones, sin profile_link) ──\n");
  const orphans = await auditOrphanProfiles(supabase);
  if (orphans.length === 0) {
    console.log("✓ Ningún perfil huérfano con participaciones");
  } else {
    for (const o of orphans) {
      console.log(
        `✗ ${o.nombre} (${o.jugador_id}): ${o.participaciones} eventos, ${o.puntos} pts`
      );
      allIssues.push({
        code: "ORPHAN_PROFILE_WITH_PARTICIPACIONES",
        rivieraId: null,
        details: o,
      });
    }
  }

  console.log("\n── Casos obligatorios ──\n");
  for (const rid of REQUIRED_RIVIERA_IDS) {
    const row = perIdentity.find((r) => r.rivieraId === rid);
    if (!row) {
      console.log(`? ${rid}: no encontrado en riviera_official_player_identity`);
      allIssues.push({ code: "MISSING_IDENTITY", rivieraId: rid, details: {} });
      continue;
    }
    if (row.issues.length === 0) {
      console.log(
        `✓ ${rid}: ${row.eventosDb} eventos, ${row.puntosDb} pts, perfiles=${row.profileCount}`
      );
    } else {
      console.log(`✗ ${rid}: ${row.issues.map((i) => i.code).join(", ")}`);
    }
  }

  const totalAudited = targets.length;
  const totalInconsistencias = allIssues.length;
  const resultadoFinal = totalInconsistencias === 0 ? "PASS" : "FAIL";

  const report = {
    total_riviera_ids_auditados: totalAudited,
    total_multiclub: multiclubCount,
    total_inconsistencias: totalInconsistencias,
    total_perfiles_huerfanos: orphans.length,
    resultado_final: resultadoFinal,
    issues: allIssues,
    orphans,
    audited_at: new Date().toISOString(),
  };

  console.log("\n══════════════════════════════════════════");
  console.log("  REPORTE FINAL — AUDITORÍA ARQUITECTÓNICA");
  console.log("══════════════════════════════════════════");
  console.log(`  Total jugadores auditados (Riviera ID): ${totalAudited}`);
  console.log(`  Total multiclub:                        ${multiclubCount}`);
  console.log(`  Total inconsistencias:                  ${totalInconsistencias}`);
  console.log(`  Perfiles huérfanos:                     ${orphans.length}`);
  console.log(`  Resultado:                              ${resultadoFinal}`);
  console.log("══════════════════════════════════════════\n");

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
  }

  if (resultadoFinal === "PASS") {
    console.log(
      "Arquitectura CONGELADA: admin/público/HP/RO comparten motor global verificado en datos."
    );
  } else {
    console.log(
      "Revisar supabase/audit-global-career-architecture.sql y preview-backfill-profile-link-global-career.sql"
    );
  }

  return resultadoFinal === "PASS";
}

async function main() {
  const args = process.argv.slice(2);
  const offline = args.includes("--offline");
  const jsonOut = args.includes("--json");
  const rivIdx = args.indexOf("--riviera-id");
  const filterRivieraId = rivIdx >= 0 ? args[rivIdx + 1] : null;

  const offlineOk = runOfflineChecks();
  if (!offlineOk) process.exit(1);

  if (offline) {
    console.log("\n✓ Auditoría offline (arquitectura congelada) — OK");
    console.log("  Ejecuta sin --offline para auditar TODOS los jugadores en Supabase.");
    process.exit(0);
  }

  if (!loadEnv()) {
    console.error("\n✗ Sin .env — usar --offline o configurar Supabase.");
    process.exit(1);
  }

  const liveOk = await runLiveAudit({ filterRivieraId, jsonOut });
  process.exit(liveOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
