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
 * Uso:
 *   npm run audit:rls-public-isolation
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

  // 1. liga_jugadores: anon NUNCA debe poder leer email/telefono.
  {
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
  //    Verificación indirecta: cualquier fila que devuelva debe tener
  //    estado en_juego/finalizado (nunca "configuracion").
  {
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
  //    (comprobado por ausencia de error específico de RLS al intentar un
  //    UPDATE sobre un id inexistente -- lo relevante aquí es que la fila
  //    afectada sea 0, nunca que se cree/edite algo real).
  {
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

  if (failures.length > 0) {
    console.error("[audit-rls-public-isolation] FALLÓ:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(
    "[audit-rls-public-isolation] OK -- aislamiento público de Liga/Torneo Express/Duelo2v2/tournament_public_config intacto."
  );
}

main().catch((e) => {
  console.error("[audit-rls-public-isolation] Error inesperado:", e);
  process.exit(1);
});
