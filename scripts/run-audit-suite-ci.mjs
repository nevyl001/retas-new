#!/usr/bin/env node
/**
 * Orquestador CI: ejecuta todas las auditorías online en secuencia.
 * Nunca aborta en el primer fallo — acumula exit codes y resume al final.
 *
 * Uso (GitHub Actions o local):
 *   node scripts/run-audit-suite-ci.mjs
 */
import { spawnSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const AUDITS = [
  {
    id: "career-integrity",
    label: "Integridad de carrera (+ orphan audit vía service_role)",
    cmd: "npm",
    args: ["run", "audit:career-integrity"],
  },
  {
    id: "rls-public-isolation",
    label: "Aislamiento RLS público (SEC-001)",
    cmd: "npm",
    args: ["run", "audit:rls-public-isolation"],
  },
  {
    id: "global-career-parity",
    label: "Paridad carrera global multiclub",
    cmd: "npm",
    args: ["run", "audit:global-career-parity"],
  },
];

function runAudit(audit) {
  console.log("\n" + "=".repeat(72));
  console.log(`▶ AUDIT: ${audit.label} (${audit.id})`);
  console.log("=".repeat(72));

  const result = spawnSync(audit.cmd, audit.args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  const code = result.status ?? 1;
  const status = code === 0 ? "PASS" : "FAIL";
  console.log(`\n◀ ${audit.id}: ${status} (exit ${code})\n`);
  return { ...audit, code, status };
}

function main() {
  console.log("=== SUITE DE AUDITORÍAS (CI) ===");
  console.log(`Proyecto Supabase: ${process.env.REACT_APP_SUPABASE_URL ?? "(sin URL)"}`);

  const results = AUDITS.map(runAudit);
  const failed = results.filter((r) => r.code !== 0);

  console.log("\n" + "=".repeat(72));
  console.log("RESUMEN FINAL — SUITE DE AUDITORÍAS");
  console.log("=".repeat(72));
  for (const r of results) {
    const marker = r.code === 0 ? "✓" : "✗";
    console.log(`  ${marker} ${r.id}: ${r.status} (exit ${r.code})`);
  }
  console.log("=".repeat(72));

  if (failed.length > 0) {
    console.error(
      `\n✗ SUITE FALLÓ — ${failed.length}/${results.length} auditoría(s) con error: ${failed.map((f) => f.id).join(", ")}`
    );
    process.exit(1);
  }

  console.log(`\n✓ SUITE OK — ${results.length}/${results.length} auditorías pasaron.`);
  process.exit(0);
}

main();
