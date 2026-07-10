#!/usr/bin/env node
/**
 * Cuenta cómo se resuelve la fecha de participaciones legacy en producción.
 *
 * Uso: npm run audit:legacy-fechas
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

const APP_TIMEZONE = "America/Mexico_City";

function parseInstant(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toMexicoCalendarDate(iso) {
  const d = parseInstant(iso);
  if (!d) return "";
  return d.toLocaleDateString("en-CA", { timeZone: APP_TIMEZONE });
}

function hasMetadataInstant(meta, key) {
  const v = meta[key];
  return typeof v === "string" && v.includes("T") ? v : null;
}

function isLegacyDateOnlyFecha(fecha, meta) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(fecha) &&
    !hasMetadataInstant(meta, "evento_en") &&
    !hasMetadataInstant(meta, "programado_en")
  );
}

function parsePartidosDetalle(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item;
    if (typeof row.fecha === "string" && row.fecha.includes("T")) {
      out.push(row.fecha.trim());
    }
  }
  return out;
}

function latestIsoTimestamp(...candidates) {
  let best = "";
  let bestMs = -Infinity;
  for (const raw of candidates) {
    const value = raw?.trim();
    if (!value) continue;
    const ms = new Date(value).getTime();
    if (Number.isNaN(ms) || ms <= bestMs) continue;
    bestMs = ms;
    best = value;
  }
  return best || null;
}

function resolveInstantFromPartidosDetalle(metadata) {
  const timestamps = parsePartidosDetalle(metadata?.partidos_detalle);
  if (timestamps.length === 0) return null;
  return latestIsoTimestamp(...timestamps);
}

function resolveLegacyInstantFromCreatedAt(fechaLegacy, createdAt) {
  if (!createdAt?.includes("T")) return null;
  const created = parseInstant(createdAt);
  if (!created) return null;

  const createdUtcDay = createdAt.slice(0, 10);
  if (createdUtcDay === fechaLegacy) {
    return created.toISOString();
  }

  const createdMexico = toMexicoCalendarDate(createdAt);
  const utcMidnightMexico = toMexicoCalendarDate(`${fechaLegacy}T00:00:00.000Z`);

  if (utcMidnightMexico === createdMexico) {
    return `${fechaLegacy}T00:00:00.000Z`;
  }

  if (fechaLegacy === createdMexico) {
    return created.toISOString();
  }

  return created.toISOString();
}

function classifyParticipacionFechaResolution(row) {
  const meta = row.metadata ?? {};
  const eventoEn = hasMetadataInstant(meta, "evento_en");
  if (eventoEn) {
    return { source: "metadata_evento_en", isLegacyDateOnly: false };
  }

  const programadoEn = hasMetadataInstant(meta, "programado_en");
  if (programadoEn) {
    return { source: "metadata_programado_en", isLegacyDateOnly: false };
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(row.fecha)) {
    return { source: "fecha_iso", isLegacyDateOnly: false };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(row.fecha)) {
    const isLegacy = isLegacyDateOnlyFecha(row.fecha, meta);
    if (resolveInstantFromPartidosDetalle(meta)) {
      return { source: "partidos_detalle", isLegacyDateOnly: isLegacy };
    }
    if (resolveLegacyInstantFromCreatedAt(row.fecha, row.created_at)) {
      return { source: "created_at", isLegacyDateOnly: isLegacy };
    }
    return { source: "legacy_utc_midnight_fallback", isLegacyDateOnly: isLegacy };
  }

  return {
    source: row.created_at?.includes("T") ? "created_at" : "legacy_utc_midnight_fallback",
    isLegacyDateOnly: false,
  };
}

async function fetchAllParticipaciones(supabase) {
  const pageSize = 1000;
  let from = 0;
  const all = [];

  while (true) {
    const { data, error } = await supabase
      .from("jugador_participaciones")
      .select("id, fecha, created_at, metadata")
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

async function main() {
  if (!loadEnv()) {
    console.error("Falta .env con REACT_APP_SUPABASE_URL y REACT_APP_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.REACT_APP_SUPABASE_ANON_KEY
  );

  console.log("Consultando jugador_participaciones…");
  const rows = await fetchAllParticipaciones(supabase);

  const bySource = {
    partidos_detalle: 0,
    created_at: 0,
    legacy_utc_midnight_fallback: 0,
  };
  let totalLegacy = 0;
  const fallbackRows = [];

  for (const row of rows) {
    const resolution = classifyParticipacionFechaResolution(row);
    if (!resolution.isLegacyDateOnly) continue;
    totalLegacy += 1;
    bySource[resolution.source] = (bySource[resolution.source] ?? 0) + 1;
    if (resolution.source === "legacy_utc_midnight_fallback") {
      fallbackRows.push(row);
    }
  }

  const resolvedWithSignal =
    bySource.partidos_detalle + bySource.created_at;
  const fallbackUtcMidnight = bySource.legacy_utc_midnight_fallback;

  console.log("\n── Auditoría fechas legacy (fecha YYYY-MM-DD sin metadata.evento_en) ──\n");
  console.log(`Total participaciones en BD: ${rows.length}`);
  console.log(`Total legacy ambiguos:       ${totalLegacy}`);
  console.log(`Resueltos con señal horaria: ${resolvedWithSignal}`);
  console.log(`  · partidos_detalle:        ${bySource.partidos_detalle}`);
  console.log(`  · created_at:              ${bySource.created_at}`);
  console.log(`Fallback medianoche UTC:     ${fallbackUtcMidnight}`);

  if (fallbackRows.length > 0) {
    console.log("\nRegistros en fallback (sin señal horaria útil):");
    for (const row of fallbackRows.slice(0, 10)) {
      console.log(
        `  - ${row.id} fecha=${row.fecha} created_at=${row.created_at ?? "—"}`
      );
    }
    if (fallbackRows.length > 10) {
      console.log(`  … y ${fallbackRows.length - 10} más`);
    }
  }

  console.log(
    "\nNota: fallback medianoche UTC solo aplica cuando no hay partidos_detalle[].fecha " +
      "con hora ni created_at con componente de tiempo."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
