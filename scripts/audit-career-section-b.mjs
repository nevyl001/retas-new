#!/usr/bin/env node
/**
 * Sección B del audit: discrepancias metadata / perfil / parent / override.
 * Uso: node scripts/audit-career-section-b.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const HP = "e724de97-3552-4a01-a269-f621e6f1ed26";
const RO = "2770b522-9064-4c7b-a729-4a0ea7e3f6e8";
const CLUB = {
  [HP]: "Hackpadel",
  [RO]: "Riviera Open",
};

const TARGET_NAMES = [
  "Nevyl",
  "Daniel N",
  "Alejandro R",
  "Sebastian",
  "Edgardo T",
  "Irving",
  "David R",
  "Aaron Duran",
  "Isra",
  "Marco M",
  "Ricardo S",
  "Paco",
  "Erick M",
];

function loadEnv() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const val = m[2].replace(/^["']|["']$/g, "").trim();
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

function clubName(orgId) {
  if (!orgId) return "—";
  return CLUB[orgId] ?? orgId.slice(0, 8);
}

function tiposDiscrepancia({ metadataOrg, perfilOrg, parentOrg, overrideOrg }) {
  const tips = [];
  if (metadataOrg && metadataOrg !== perfilOrg) tips.push("metadata≠perfil");
  if (metadataOrg && parentOrg && metadataOrg !== parentOrg) tips.push("metadata≠parent");
  if (metadataOrg && overrideOrg && metadataOrg !== overrideOrg) tips.push("metadata≠override");
  if (parentOrg && perfilOrg !== parentOrg) tips.push("perfil≠parent");
  if (overrideOrg && perfilOrg !== overrideOrg) tips.push("perfil≠override");
  if (parentOrg && overrideOrg && parentOrg !== overrideOrg) tips.push("parent≠override");
  return tips;
}

function distinctOrgs(...ids) {
  return new Set(ids.filter(Boolean)).size;
}

loadEnv();
const url = process.env.REACT_APP_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.REACT_APP_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Falta .env");
  process.exit(1);
}
const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function parentExists(tipo, eventoId) {
  const { data, error } = await sb.rpc("_riviera_participacion_parent_row_exists", {
    p_tipo_evento: tipo,
    p_evento_id: String(eventoId),
  });
  if (error) return false;
  return Boolean(data);
}

async function expectedHost(tipo, eventoId) {
  const { data } = await sb.rpc("riviera_participacion_expected_host_org", {
    p_tipo_evento: tipo,
    p_evento_id: String(eventoId),
  });
  return data ?? null;
}

async function manualOverride(tipo, eventoId) {
  const { data } = await sb.rpc("riviera_career_event_host_manual_override", {
    p_tipo_evento: tipo,
    p_evento_id: String(eventoId).trim(),
  });
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

async function resolveAnchor(nombre) {
  const { data: profiles } = await sb
    .from("riviera_jugadores")
    .select("id, nombre, organizador_id")
    .eq("nombre", nombre)
    .eq("estado", "activo");
  const ro = (profiles ?? []).find((p) => p.organizador_id === RO);
  const any = (profiles ?? [])[0];
  const anchor = ro ?? any;
  if (!anchor) return null;
  const { data: rid } = await sb.rpc("get_public_riviera_ids_for_jugadores", {
    p_jugador_ids: [anchor.id],
  });
  const rivieraId =
    rid?.[0]?.riviera_id ?? rid?.[0] ?? null;
  return {
    nombre,
    anchorId: anchor.id,
    rivieraId: typeof rivieraId === "string" ? rivieraId : rivieraId?.riviera_id ?? "—",
  };
}

async function main() {
  const allRows = [];

  for (const nombre of TARGET_NAMES) {
    const anchor = await resolveAnchor(nombre);
    if (!anchor) {
      console.error(`Sin ancla: ${nombre}`);
      continue;
    }

    const { data: careerIds } = await sb.rpc("get_public_career_jugador_ids", {
      p_jugador_id: anchor.anchorId,
    });
    const ids = careerIds ?? [];
    if (ids.length === 0) continue;

    const { data: profiles } = await sb
      .from("riviera_jugadores")
      .select("id, organizador_id")
      .in("id", ids);
    const perfilOrgById = new Map(
      (profiles ?? []).map((p) => [p.id, p.organizador_id])
    );

    const { data: parts } = await sb
      .from("jugador_participaciones")
      .select(
        "id, jugador_id, tipo_evento, evento_id, evento_nombre, fecha, puntos_obtenidos, metadata, created_at"
      )
      .in("jugador_id", ids);

    for (const jp of parts ?? []) {
      const meta = jp.metadata ?? {};
      const metadataOrg = String(meta.organizador_id ?? "").trim() || null;
      const perfilOrg = perfilOrgById.get(jp.jugador_id) ?? null;
      const parentExiste = await parentExists(jp.tipo_evento, jp.evento_id);
      const parentOrgRaw = parentExiste
        ? await expectedHost(jp.tipo_evento, jp.evento_id)
        : null;
      const parentOrg = parentExiste ? parentOrgRaw : null;
      const ov = await manualOverride(jp.tipo_evento, jp.evento_id);
      const overrideOrg = ov?.organizador_id ?? null;

      const orgs = distinctOrgs(
        metadataOrg,
        perfilOrg,
        parentOrg,
        overrideOrg
      );
      if (orgs <= 1) continue;

      const tips = tiposDiscrepancia({
        metadataOrg,
        perfilOrg,
        parentOrg,
        overrideOrg,
      });

      allRows.push({
        jugador: nombre,
        riviera_id: anchor.rivieraId,
        participacion_id: jp.id,
        evento_nombre: jp.evento_nombre,
        fecha: jp.fecha,
        puntos_obtenidos: jp.puntos_obtenidos,
        metadata_club: clubName(metadataOrg),
        perfil_club: clubName(perfilOrg),
        parent_club: parentExiste ? clubName(parentOrg) : "— (padre eliminado)",
        override_club: overrideOrg ? clubName(overrideOrg) : "—",
        repair_reason: meta.repair_reason ?? "—",
        manual_override_approved_at: meta.manual_override_approved_at ?? "—",
        tipos_discrepancia: tips.join(", ") || "—",
      });
    }
  }

  allRows.sort((a, b) =>
    a.jugador.localeCompare(b.jugador) ||
    String(b.fecha).localeCompare(String(a.fecha)) ||
    a.evento_nombre.localeCompare(b.evento_nombre)
  );

  console.log(`\n=== SECCIÓN B — ${allRows.length} filas con discrepancia ===\n`);
  const cols = [
    "jugador",
    "riviera_id",
    "participacion_id",
    "evento_nombre",
    "fecha",
    "puntos_obtenidos",
    "metadata_club",
    "perfil_club",
    "parent_club",
    "override_club",
    "repair_reason",
    "manual_override_approved_at",
    "tipos_discrepancia",
  ];
  console.log("| " + cols.join(" | ") + " |");
  console.log("|" + cols.map(() => "---").join("|") + "|");
  for (const r of allRows) {
    console.log(
      "| " +
        cols.map((c) => String(r[c] ?? "").replace(/\|/g, "\\|")).join(" | ") +
        " |"
    );
  }
  console.log("\n── JSON ──\n");
  console.log(JSON.stringify(allRows, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
