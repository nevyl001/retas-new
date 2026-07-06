/**
 * Auditoría read-only: inconsistencia careerPuntosTotal Sebastian por ?org=
 * Uso: node scripts/audit-sebastian-career-consistency.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const envPath = resolve(root, ".env");
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const val = m[2].replace(/^["']|["']$/g, "").trim();
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

loadEnv();

const sb = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const SEBASTIAN = "c7440f26-3b4c-4c94-be55-3baef8e98820";
const SEBASTIAN_CLUB_TEST = "0b35e3c9-3491-447c-96d7-aa35302e86e6";
const ORGS = {
  riviera: "2770b522-9064-4c7b-a729-4a0ea7e3f6e8",
  hackpadel: "e724de97-3552-4a01-a269-f621e6f1ed26",
  clubTest: "cd45cea7-a8ac-4596-b0ee-24959b4cbb5d",
};

function dedupeById(rows) {
  const m = new Map();
  for (const r of rows) if (!m.has(r.id)) m.set(r.id, r);
  return [...m.values()];
}

function groupByOrg(rows, homeById) {
  const byOrg = new Map();
  const detail = [];
  for (const row of rows) {
    const meta = String(row.metadata?.organizador_id ?? "").trim();
    const home = homeById.get(row.jugador_id) ?? "";
    const org = meta || home;
    const pts = Number(row.puntos_obtenidos ?? 0);
    detail.push({
      id: row.id,
      jugador_id: row.jugador_id,
      evento_nombre: row.evento_nombre,
      fecha: row.fecha,
      puntos: pts,
      org_resolved: org,
      meta_org: meta || null,
      home_org: home || null,
    });
    if (!org) continue;
    byOrg.set(org, (byOrg.get(org) ?? 0) + pts);
  }
  const total = [...byOrg.values()].reduce((s, n) => s + n, 0);
  return { byOrg: Object.fromEntries(byOrg), total, detail };
}

async function careerIds(jugadorId) {
  const { data, error } = await sb.rpc("get_public_career_jugador_ids", {
    p_jugador_id: jugadorId,
  });
  if (error) throw error;
  return [...new Set((data ?? []).map((r) => String(r).trim()).filter(Boolean))];
}

async function careerParticipaciones(jugadorId) {
  const { data, error } = await sb.rpc("riviera_list_career_participaciones_public", {
    p_jugador_id: jugadorId,
    p_limit: 500,
  });
  if (error) throw error;
  return data ?? [];
}

async function homeMap(ids) {
  const { data } = await sb
    .from("riviera_jugadores")
    .select("id, nombre, organizador_id, visible_publico")
    .in("id", ids);
  const map = new Map();
  for (const r of data ?? []) map.set(r.id, r.organizador_id);
  return { map, profiles: data ?? [] };
}

/** Simula attachCareerPuntosToJugador SIN dedupe (bug actual). */
async function simulateAttachCareer(linkedIds) {
  const lists = await Promise.all(
    linkedIds.map((id) => careerParticipaciones(id))
  );
  const merged = lists.flat();
  const { map } = await homeMap([
    ...new Set(merged.map((r) => r.jugador_id)),
    ...linkedIds,
  ]);
  const raw = groupByOrg(merged, map);
  const deduped = groupByOrg(dedupeById(merged), map);
  return {
    linkedIds,
    rpcCalls: linkedIds.length,
    rawRowCount: merged.length,
    uniqueRowCount: dedupeById(merged).length,
    duplicateCount: merged.length - dedupeById(merged).length,
    rawTotal: raw.total,
    dedupedTotal: deduped.total,
    rawByOrg: raw.byOrg,
    dedupedByOrg: deduped.byOrg,
    rawRows: raw.detail,
    dedupedRows: deduped.detail,
  };
}

async function discoverLinkedIds(jugadorId) {
  const ids = new Set([jugadorId]);
  const career = await careerIds(jugadorId);
  for (const id of career) ids.add(id);
  const { data: links } = await sb
    .from("riviera_official_player_profile_link")
    .select("riviera_jugador_id")
    .eq("canonical_riviera_jugador_id", jugadorId);
  for (const r of links ?? []) if (r.riviera_jugador_id) ids.add(r.riviera_jugador_id);
  const { data: grants } = await sb
    .from("organizer_player_access")
    .select("local_jugador_id, jugador_id")
    .or(`jugador_id.eq.${jugadorId},local_jugador_id.eq.${jugadorId}`)
    .eq("is_active", true);
  for (const g of grants ?? []) {
    if (g.local_jugador_id) ids.add(g.local_jugador_id);
    if (g.jugador_id) ids.add(g.jugador_id);
  }
  return [...ids];
}

async function grantLinkedIds(jugadorId, sourceId) {
  const ids = new Set([jugadorId, sourceId]);
  const { data } = await sb
    .from("organizer_player_access")
    .select("local_jugador_id")
    .eq("jugador_id", sourceId)
    .eq("is_active", true);
  for (const r of data ?? []) if (r.local_jugador_id) ids.add(r.local_jugador_id);
  return [...ids];
}

async function fetchGrants() {
  const { data } = await sb
    .from("organizer_player_access")
    .select("*")
    .or(`jugador_id.eq.${SEBASTIAN},local_jugador_id.eq.${SEBASTIAN},jugador_id.eq.${SEBASTIAN_CLUB_TEST},local_jugador_id.eq.${SEBASTIAN_CLUB_TEST}`)
    .eq("is_active", true);
  return data ?? [];
}

async function main() {
  console.log("=== AUDIT Sebastian career consistency ===\n");

  const { data: identity } = await sb
    .from("riviera_official_player_identity")
    .select("riviera_id, official_player_key, canonical_riviera_jugador_id")
    .eq("canonical_riviera_jugador_id", SEBASTIAN)
    .maybeSingle();

  console.log("Riviera ID:", identity?.riviera_id ?? "?");
  console.log("Canonical:", SEBASTIAN);
  console.log("Official key:", identity?.official_player_key ?? "?");

  const careerFromRpc = await careerIds(SEBASTIAN);
  console.log("\nget_public_career_jugador_ids(c7440f26):", careerFromRpc);

  const { profiles } = await homeMap(careerFromRpc);
  console.log("\nPerfiles en carrera:");
  for (const p of profiles) {
    console.log(
      `  - ${p.id} | ${p.nombre} | org=${p.organizador_id} | visible_publico=${p.visible_publico}`
    );
  }

  const grants = await fetchGrants();
  console.log("\nGrants activos relacionados:", JSON.stringify(grants, null, 2));

  const singleRpc = await careerParticipaciones(SEBASTIAN);
  const singleDeduped = dedupeById(singleRpc);
  const { map: homeSingle } = await homeMap(careerFromRpc);
  const canonical = groupByOrg(singleDeduped, homeSingle);
  console.log("\n--- RPC ÚNICO (canónico, deduped) ---");
  console.log("Filas únicas:", singleDeduped.length);
  console.log("Por club:", canonical.byOrg);
  console.log("Total:", canonical.total);
  console.log("Filas:");
  for (const r of canonical.detail) {
    console.log(
      `  ${r.id.slice(0, 8)}… | ${r.evento_nombre} | ${r.fecha} | ${r.puntos}pts | org=${r.org_resolved} | jugador=${r.jugador_id.slice(0, 8)}…`
    );
  }

  const scenarios = [
    {
      label: "Riviera Open (?org=riviera) — discoverLinkedIds path",
      linkedIds: await discoverLinkedIds(SEBASTIAN),
      grantedSource: null,
    },
    {
      label: "Hackpadel (?org=hackpadel) — si tuviera grantedAccess",
      linkedIds: await grantLinkedIds(SEBASTIAN, SEBASTIAN),
      grantedSource: SEBASTIAN,
    },
    {
      label: "Club Test clone (0b35e3c9)",
      linkedIds: await discoverLinkedIds(SEBASTIAN_CLUB_TEST),
      grantedSource: null,
    },
  ];

  // attachCareer merge: jugador.id + source + unified.linkedJugadorIds
  for (const sc of scenarios) {
    const attachIds = [
      ...new Set([
        SEBASTIAN,
        ...(sc.grantedSource ? [sc.grantedSource] : []),
        ...sc.linkedIds,
      ]),
    ];
    console.log(`\n--- ${sc.label} ---`);
    console.log("linkedJugadorIds (unified):", sc.linkedIds);
    console.log("attachCareer linkedIds (merged):", attachIds);
    const sim = await simulateAttachCareer(attachIds);
    console.log("RPC calls:", sim.rpcCalls);
    console.log("Raw rows:", sim.rawRowCount, "| Unique:", sim.uniqueRowCount, "| Dupes:", sim.duplicateCount);
    console.log("RAW total (bug):", sim.rawTotal, sim.rawByOrg);
    console.log("Deduped total (correct):", sim.dedupedTotal, sim.dedupedByOrg);

    const dupes = new Map();
    for (const r of sim.rawRows) {
      const k = r.id;
      dupes.set(k, (dupes.get(k) ?? 0) + 1);
    }
    const duplicatedIds = [...dupes.entries()].filter(([, c]) => c > 1);
    if (duplicatedIds.length) {
      console.log("Participaciones duplicadas en merge:");
      for (const [id, count] of duplicatedIds) {
        const row = sim.rawRows.find((r) => r.id === id);
        console.log(`  x${count} ${id} | ${row?.evento_nombre} | ${row?.puntos}pts | org=${row?.org_resolved}`);
      }
    }
  }

  console.log("\n=== CONCLUSIÓN ===");
  console.log(
    "Si RAW total varía por org pero deduped total es constante → bug es N×RPC sin dedupe + linkedIds distintos."
  );
  console.log(
    "Si deduped total también varía → problema en get_public_career_jugador_ids / datos."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
