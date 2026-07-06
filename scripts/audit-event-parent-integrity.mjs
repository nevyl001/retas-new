#!/usr/bin/env node
/**
 * Auditoría diaria: integridad evento padre + profile links + identidad.
 *
 * Severidad:
 *   ERROR          → falla el exit code (eventos nuevos / datos críticos)
 *   REVIEW_HISTORICO → deuda histórica documentada (no falla)
 *   OK             → sin acción
 *
 * Uso:
 *   npm run audit:event-parent-integrity
 *   npm run audit:event-parent-integrity -- --json
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return false;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const val = m[2].replace(/^["']|["']$/g, "").trim();
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
  return Boolean(
    process.env.REACT_APP_SUPABASE_URL && process.env.REACT_APP_SUPABASE_ANON_KEY
  );
}

function meta(row) {
  return row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
}

function hasHostOrg(metadata) {
  return Boolean(String(metadata?.organizador_id ?? "").trim());
}

function isHistoricalOrphanDebt(metadata) {
  const status = String(metadata?.integrity_status ?? "");
  return (
    status === "orphan_parent_review" ||
    status === "repaired_orphan_parent" ||
    metadata?.repaired_from_orphan_parent === true ||
    metadata?.repaired_from_orphan_parent === "true"
  );
}

function isRepairedOrphanParent(metadata) {
  return (
    metadata?.repaired_from_orphan_parent === true ||
    metadata?.repaired_from_orphan_parent === "true" ||
    metadata?.integrity_status === "repaired_orphan_parent"
  );
}

async function parentExists(sb, tipo, eventoId) {
  const { data, error } = await sb.rpc("riviera_participacion_parent_exists", {
    p_tipo_evento: tipo,
    p_evento_id: eventoId,
  });
  if (error) {
    return fallbackParentExists(sb, tipo, eventoId);
  }
  return Boolean(data);
}

async function fallbackParentExists(sb, tipo, eventoId) {
  if (tipo === "duelo_2v2") {
    const { data } = await sb
      .from("duelos_2v2")
      .select("id")
      .eq("id", eventoId)
      .maybeSingle();
    return Boolean(data?.id);
  }
  if (tipo === "reta" || tipo === "americano") {
    const { data } = await sb
      .from("tournaments")
      .select("id")
      .eq("id", eventoId)
      .maybeSingle();
    return Boolean(data?.id);
  }
  return true;
}

async function main() {
  const jsonOut = process.argv.includes("--json");
  const errors = [];
  const reviewHistorico = [];
  const okNotes = [];

  if (!loadEnv()) {
    console.error("Sin .env — no se puede auditar producción.");
    process.exit(1);
  }

  const sb = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.REACT_APP_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: partsWithPoints } = await sb
    .from("jugador_participaciones")
    .select(
      "id, jugador_id, evento_nombre, tipo_evento, evento_id, puntos_obtenidos, metadata, created_at"
    )
    .gt("puntos_obtenidos", 0);

  const parts = partsWithPoints ?? [];

  // 1) metadata.organizador_id
  const missingOrgCritical = [];
  const missingOrgHistorical = [];
  for (const row of parts) {
    const m = meta(row);
    if (hasHostOrg(m)) continue;
    if (isHistoricalOrphanDebt(m) && m.integrity_status === "orphan_parent_review") {
      missingOrgHistorical.push(row);
      continue;
    }
    missingOrgCritical.push(row);
  }
  if (missingOrgCritical.length > 0) {
    errors.push({
      severity: "ERROR",
      code: "participaciones_sin_metadata_org",
      count: missingOrgCritical.length,
      sample: missingOrgCritical.slice(0, 5).map((r) => ({
        id: r.id,
        jugador_id: r.jugador_id,
        evento_nombre: r.evento_nombre,
        puntos_obtenidos: r.puntos_obtenidos,
      })),
    });
  }
  if (missingOrgHistorical.length > 0) {
    reviewHistorico.push({
      severity: "REVIEW_HISTORICO",
      code: "participaciones_orphan_parent_review_sin_org",
      count: missingOrgHistorical.length,
      note: "Marcadas integrity_status=orphan_parent_review (host desconocido)",
      sample: missingOrgHistorical.slice(0, 5).map((r) => ({
        id: r.id,
        evento_nombre: r.evento_nombre,
      })),
    });
  }

  // 2) metadata.club_name (warning only — no falla)
  const missingClub = parts.filter((row) => {
    const m = meta(row);
    if (!hasHostOrg(m)) return false;
    return !String(m.club_name ?? "").trim();
  });
  if (missingClub.length > 0) {
    reviewHistorico.push({
      severity: "REVIEW_HISTORICO",
      code: "participaciones_sin_metadata_club_name",
      count: missingClub.length,
      note: "Tienen organizador_id pero falta club_name (no crítico)",
      sample: missingClub.slice(0, 5).map((r) => ({
        id: r.id,
        evento_nombre: r.evento_nombre,
        organizador_id: meta(r).organizador_id,
      })),
    });
  }

  // 3) profile_link en jugadores con puntos (muestra)
  const jugadorIds = [...new Set(parts.map((p) => p.jugador_id))];
  const { data: links } = await sb
    .from("riviera_official_player_profile_link")
    .select("riviera_jugador_id")
    .in(
      "riviera_jugador_id",
      jugadorIds.length ? jugadorIds : ["00000000-0000-0000-0000-000000000000"]
    );
  const linked = new Set((links ?? []).map((l) => l.riviera_jugador_id));
  const partsSinLink = parts.filter((p) => !linked.has(p.jugador_id));
  if (partsSinLink.length > 0) {
    errors.push({
      severity: "ERROR",
      code: "participaciones_sin_profile_link",
      count: partsSinLink.length,
      sample: partsSinLink.slice(0, 5).map((r) => ({
        id: r.id,
        jugador_id: r.jugador_id,
        evento_nombre: r.evento_nombre,
        tipo_evento: r.tipo_evento,
      })),
    });
  }

  // 4) Duplicados profile_link
  const { data: allLinks } = await sb
    .from("riviera_official_player_profile_link")
    .select("riviera_jugador_id");
  const seen = new Map();
  for (const row of allLinks ?? []) {
    const id = row.riviera_jugador_id;
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  const dupLinks = [...seen.entries()].filter(([, c]) => c > 1);
  if (dupLinks.length > 0) {
    errors.push({
      severity: "ERROR",
      code: "duplicate_profile_link",
      count: dupLinks.length,
      ids: dupLinks,
    });
  }

  // 5) Duplicados riviera_id
  const { data: identities } = await sb
    .from("riviera_official_player_identity")
    .select("riviera_id, official_player_key")
    .not("riviera_id", "is", null);
  const byRiv = new Map();
  for (const row of identities ?? []) {
    const rid = row.riviera_id;
    if (!byRiv.has(rid)) byRiv.set(rid, []);
    byRiv.get(rid).push(row.official_player_key);
  }
  const dupRiviera = [...byRiv.entries()].filter(([, keys]) => keys.length > 1);
  if (dupRiviera.length > 0) {
    errors.push({
      severity: "ERROR",
      code: "duplicate_riviera_id",
      count: dupRiviera.length,
      sample: dupRiviera.slice(0, 5),
    });
  }

  // 6) Huérfanos profile_link
  const { data: orphans, error: orphanErr } = await sb.rpc(
    "_riviera_orphan_profile_audit"
  );
  if (orphanErr) {
    errors.push({
      severity: "ERROR",
      code: "orphan_audit_unavailable",
      message: orphanErr.message,
      hint: "Ejecutar supabase/career-profile-link-integrity.sql",
    });
  } else {
    const high = (orphans ?? []).filter((o) => o.confidence === "HIGH");
    const review = (orphans ?? []).filter((o) => o.confidence === "REVIEW");
    if (high.length > 0) {
      errors.push({
        severity: "ERROR",
        code: "orphan_profiles_high",
        count: high.length,
        sample: high.slice(0, 10),
      });
    }
    if (review.length > 0) {
      reviewHistorico.push({
        severity: "REVIEW_HISTORICO",
        code: "ambiguous_profile_links",
        count: review.length,
        sample: review.slice(0, 10),
      });
    }
  }

  // 7) Participaciones sin evento padre
  const parentMissingError = [];
  const parentMissingHistorical = [];
  const parentMissingOk = [];

  const parentCheckTypes = new Set(["duelo_2v2", "reta", "americano", "torneo_express", "liga"]);
  for (const row of parts) {
    if (!parentCheckTypes.has(row.tipo_evento)) continue;

    const exists = await parentExists(sb, row.tipo_evento, row.evento_id);
    if (exists) continue;

    const m = meta(row);
    if (hasHostOrg(m)) {
      parentMissingOk.push({
        participacion_id: row.id,
        tipo: row.tipo_evento,
        evento_id: row.evento_id,
        evento_nombre: row.evento_nombre,
        organizador_id: m.organizador_id,
        status: isRepairedOrphanParent(m)
          ? "repaired_orphan_parent"
          : "has_host_metadata",
      });
      continue;
    }

    if (isHistoricalOrphanDebt(m)) {
      parentMissingHistorical.push({
        participacion_id: row.id,
        tipo: row.tipo_evento,
        evento_id: row.evento_id,
        evento_nombre: row.evento_nombre,
        integrity_status: m.integrity_status,
      });
      continue;
    }

    parentMissingError.push({
      participacion_id: row.id,
      tipo: row.tipo_evento,
      evento_id: row.evento_id,
      evento_nombre: row.evento_nombre,
    });
  }

  if (parentMissingError.length > 0) {
    errors.push({
      severity: "ERROR",
      code: "participacion_sin_evento_padre",
      count: parentMissingError.length,
      sample: parentMissingError.slice(0, 10),
    });
  }
  if (parentMissingHistorical.length > 0) {
    reviewHistorico.push({
      severity: "REVIEW_HISTORICO",
      code: "participacion_sin_padre_historico",
      count: parentMissingHistorical.length,
      note: "Padre eliminado, marcadas orphan_parent_review",
      sample: parentMissingHistorical.slice(0, 10),
    });
  }
  if (parentMissingOk.length > 0) {
    okNotes.push({
      severity: "OK",
      code: "participacion_sin_padre_con_host_metadata",
      count: parentMissingOk.length,
      note: "Padre ausente pero metadata.organizador_id presente (histórico reparado)",
      sample: parentMissingOk.slice(0, 5),
    });
  }

  const report = {
    audited_at: new Date().toISOString(),
    error_count: errors.length,
    review_historico_count: reviewHistorico.length,
    errors,
    review_historico: reviewHistorico,
    ok_notes: okNotes,
  };

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("=== AUDIT EVENT PARENT INTEGRITY ===\n");

    if (errors.length === 0 && reviewHistorico.length === 0) {
      console.log("✓ Sin incidencias detectadas.");
    }

    for (const issue of errors) {
      console.log(`✗ ERROR ${issue.code}:`, JSON.stringify(issue, null, 2));
    }
    for (const issue of reviewHistorico) {
      console.log(
        `⚠ REVIEW_HISTORICO ${issue.code}:`,
        JSON.stringify(issue, null, 2)
      );
    }
    for (const note of okNotes) {
      console.log(`✓ OK ${note.code}: ${note.count} — ${note.note}`);
    }

    if (errors.length === 0 && reviewHistorico.length > 0) {
      console.log(
        `\n✓ Auditoría OK (con ${reviewHistorico.length} ítem(s) REVIEW_HISTORICO documentados)`
      );
    }
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
