#!/usr/bin/env node
/**
 * Auditoría de solo lectura: aislamiento RLS público (SEC-001, 2026-07-29).
 *
 * Detecta si vuelve a aparecer el patrón de política RLS heredada
 * "permitir todo" (qual/check = true) en las tablas donde ya se corrigió
 * (Liga, Torneo Express, Duelo 2v2, tournament_public_config), usando la
 * anon key pública real -- exactamente lo que vería un visitante sin sesión.
 *
 * No usa credenciales de servicio, no escribe datos reales (los intentos de
 * escritura usan IDs que no existen o se limitan a comprobar la ausencia de
 * política, ver checkNoAnonWritePolicy).
 *
 * Severidad: cualquier fallo hace exit(1) -- pensado para CI/cron, igual que
 * el resto de scripts audit-*.mjs de este directorio.
 *
 * Variables de entorno (checks 7–8 de lectura pública Liga):
 *   AUDIT_LIGA_PUBLIC_ID  — UUID de liga es_publica=true (CI: liga Padelito prod).
 *   AUDIT_LIGA_PRIVATE_ID — UUID de liga es_publica=false; anon no debe leerla.
 *                           Crear fixture en staging con
 *                           supabase/sql/seed-audit-liga-private-fixture.sql
 * Si AUDIT_LIGA_PRIVATE_ID no está definida, check 7 se omite y el resumen
 * final imprime WARNING explícito (no silencioso).
 *
 * Uso:
 *   npm run audit:rls-public-isolation
 *   AUDIT_LIGA_PUBLIC_ID=<uuid> AUDIT_LIGA_PRIVATE_ID=<uuid> npm run audit:rls-public-isolation
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  // CI (ver .github/workflows/*.yml) ya define REACT_APP_SUPABASE_URL/
  // ANON_KEY como env vars del step -- no depende de un archivo .env
  // (que no existe en el checkout, está gitignored). Por eso process.env
  // se revisa primero; el archivo .env local es solo un complemento para
  // desarrollo.
  const envPath = resolve(root, ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      const val = m[2].replace(/^["']|["']$/g, "").trim();
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
  }
  return Boolean(
    process.env.REACT_APP_SUPABASE_URL && process.env.REACT_APP_SUPABASE_ANON_KEY
  );
}

async function main() {
  if (!loadEnv()) {
    console.error(
      "[audit-rls-public-isolation] Falta REACT_APP_SUPABASE_URL/ANON_KEY (.env o env vars). Abortando."
    );
    process.exit(1);
  }

  const supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.REACT_APP_SUPABASE_ANON_KEY
  );

  const failures = [];
  const executed = [];
  const skipped = [];

  function markExecuted(id) {
    executed.push(id);
  }
  function markSkipped(id, reason) {
    skipped.push({ id, reason });
  }

  // 1. liga_jugadores: anon NUNCA debe poder leer email/telefono.
  {
    markExecuted("1-liga_jugadores-pii-blocked");
    const { error } = await supabase
      .from("liga_jugadores")
      .select("email,telefono")
      .limit(1);
    if (!error) {
      failures.push(
        "liga_jugadores: anon pudo seleccionar email/telefono (esperado: permission denied / columna bloqueada)."
      );
    }
  }

  // 2. liga_jugadores: anon SÍ debe seguir viendo columnas públicas (nombre)
  //    para no romper standings públicos.
  {
    markExecuted("2-liga_jugadores-public-columns");
    const { error } = await supabase
      .from("liga_jugadores")
      .select("id,nombre")
      .limit(1);
    if (error) {
      failures.push(
        `liga_jugadores: anon NO pudo leer columnas públicas (id,nombre) -- regresión funcional: ${error.message}`
      );
    }
  }

  // 3. duelos_2v2: anon solo debe ver duelos con is_duelo_public()=true.
  {
    markExecuted("3-duelos_2v2-public-estado");
    const { data, error } = await supabase
      .from("duelos_2v2")
      .select("id,estado")
      .limit(50);
    if (error) {
      failures.push(`duelos_2v2: anon no pudo leer nada (${error.message}).`);
    } else if ((data ?? []).some((d) => d.estado === "configuracion")) {
      failures.push(
        "duelos_2v2: anon pudo leer un duelo en estado 'configuracion' (debería estar oculto hasta ser público)."
      );
    }
  }

  // 4. tournament_public_config: cero políticas de escritura para anon
  {
    markExecuted("4-tournament_public_config-no-anon-write");
    const probeId = "00000000-0000-0000-0000-000000000000";
    const { data, error } = await supabase
      .from("tournament_public_config")
      .update({ format: "audit-probe-should-not-apply" })
      .eq("tournament_id", probeId)
      .select();
    if (error && error.code !== "PGRST116" && error.code !== "42501") {
      // Cualquier error inesperado se reporta pero no se asume vulnerabilidad.
      console.warn(
        `[audit-rls-public-isolation] aviso: UPDATE de prueba en tournament_public_config devolvió error inesperado: ${error.message}`
      );
    }
    if (data && data.length > 0) {
      failures.push(
        "tournament_public_config: el UPDATE de prueba (anon) afectó una fila -- no debería ser posible."
      );
    }
  }

  // 5. career_event_host_manual_overrides: anon no debe leer nada
  {
    markExecuted("5-career_event_host_manual_overrides-blocked");
    const { data, error } = await supabase
      .from("career_event_host_manual_overrides")
      .select("id")
      .limit(1);
    if (!error && data && data.length > 0) {
      failures.push(
        "career_event_host_manual_overrides: anon pudo leer una fila (debería estar completamente bloqueada, solo is_master_admin())."
      );
    }
  }

  // 6. admin_delete_user_completo: anon no debe poder invocar la función
  {
    markExecuted("6-admin_delete_user_completo-revoked");
    const { error } = await supabase.rpc("admin_delete_user_completo", {
      p_target_user_id: "00000000-0000-0000-0000-000000000000",
    });
    if (!error) {
      failures.push(
        "admin_delete_user_completo: anon pudo invocar la función sin error -- el REVOKE de anon (Fase 0) pudo haberse revertido."
      );
    } else if (error.code !== "42501") {
      console.warn(
        `[audit-rls-public-isolation] aviso: admin_delete_user_completo devolvió un error distinto del esperado (42501 permission denied): ${error.code} ${error.message}`
      );
    }
  }

  // 7. ligas privadas: anon no debe ver una liga marcada es_publica=false.
  if (process.env.AUDIT_LIGA_PRIVATE_ID) {
    markExecuted("7-ligas-private-not-readable");
    const privateId = process.env.AUDIT_LIGA_PRIVATE_ID;
    const { data, error } = await supabase
      .from("ligas")
      .select("id,nombre,es_publica")
      .eq("id", privateId)
      .maybeSingle();
    if (!error && data) {
      failures.push(
        `ligas: anon pudo leer liga privada ${privateId} (es_publica=false) — filtrar con is_liga_public falló.`
      );
    }
  } else {
    markSkipped(
      "7-ligas-private-not-readable",
      "check 7 NO EJECUTADO — falta AUDIT_LIGA_PRIVATE_ID (ver supabase/sql/seed-audit-liga-private-fixture.sql)"
    );
  }

  // 8. ligas públicas: anon debe leer la liga y su cadena básica.
  if (process.env.AUDIT_LIGA_PUBLIC_ID) {
    markExecuted("8-ligas-public-chain-readable");
    const publicId = process.env.AUDIT_LIGA_PUBLIC_ID;
    const { data: liga, error: ligaErr } = await supabase
      .from("ligas")
      .select("id,nombre")
      .eq("id", publicId)
      .maybeSingle();
    if (ligaErr || !liga) {
      failures.push(
        `ligas: anon NO pudo leer liga pública ${publicId}: ${ligaErr?.message ?? "sin filas"}`
      );
    } else {
      const { error: jornErr } = await supabase
        .from("liga_jornadas")
        .select("id")
        .eq("liga_id", publicId)
        .limit(1);
      if (jornErr) {
        failures.push(
          `liga_jornadas: anon no pudo leer jornadas de liga pública ${publicId}: ${jornErr.message}`
        );
      }
      const { error: insErr } = await supabase
        .from("liga_inscripciones")
        .select("id")
        .eq("liga_id", publicId)
        .limit(1);
      if (insErr) {
        failures.push(
          `liga_inscripciones: anon no pudo leer inscripciones de liga pública ${publicId}: ${insErr.message}`
        );
      }
    }
  } else {
    markSkipped(
      "8-ligas-public-chain-readable",
      "check 8 NO EJECUTADO — falta AUDIT_LIGA_PUBLIC_ID"
    );
  }

  // 9. Cadena partidos: filas visibles deben colgar de jornada accesible.
  {
    markExecuted("9-liga_partidos-chain-integrity");
    const { data, error } = await supabase
      .from("liga_partidos")
      .select("id,jornada_id")
      .limit(25);
    if (error) {
      failures.push(`liga_partidos: anon no pudo leer (${error.message}).`);
    } else if ((data ?? []).length > 0) {
      for (const row of data) {
        const { data: jorn, error: jErr } = await supabase
          .from("liga_jornadas")
          .select("id,liga_id")
          .eq("id", row.jornada_id)
          .maybeSingle();
        if (jErr || !jorn) {
          failures.push(
            `liga_partidos: partido ${row.id} visible pero jornada ${row.jornada_id} no — posible fuga RLS.`
          );
          break;
        }
        const { data: liga, error: lErr } = await supabase
          .from("ligas")
          .select("id")
          .eq("id", jorn.liga_id)
          .maybeSingle();
        if (lErr || !liga) {
          failures.push(
            `liga_partidos: jornada ${jorn.id} → liga ${jorn.liga_id} no visible para anon — posible liga privada filtrada mal.`
          );
          break;
        }
      }
    }
  }

  if (failures.length > 0) {
    console.error("[audit-rls-public-isolation] FALLÓ:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log("\n[audit-rls-public-isolation] ── Resumen de checks ──");
  console.log(`  Ejecutados (${executed.length}): ${executed.join(", ")}`);
  if (skipped.length > 0) {
    for (const s of skipped) {
      console.warn(`  WARNING: ${s.reason}`);
    }
  } else {
    console.log("  Omitidos: ninguno");
  }

  console.log(
    "\n[audit-rls-public-isolation] OK -- aislamiento público de Liga/Torneo Express/Duelo2v2/tournament_public_config intacto."
  );
  if (skipped.length > 0) {
    console.warn(
      `[audit-rls-public-isolation] OK con ${skipped.length} check(s) NO EJECUTADO(S) — ver WARNING arriba.`
    );
  }
}

main().catch((e) => {
  console.error("[audit-rls-public-isolation] Error inesperado:", e);
  process.exit(1);
});
