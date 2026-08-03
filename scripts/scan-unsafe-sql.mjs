#!/usr/bin/env node
/**
 * lint:sql (BLK-05) — falla (exit 1) si supabase/**\/*.sql (fuera de
 * supabase/_archive/**, histórico no ejecutable) contiene:
 *   1. USING (true) / WITH CHECK (true) como cláusula de policy RLS.
 *   2. "OR true" como término booleano bare (no dentro de un literal de
 *      cadena — ej. 'qual ILIKE %OR true%' en un script de verificación NO
 *      cuenta).
 *   3. GRANT INSERT/UPDATE/DELETE/ALL ... TO ...anon... (operación sensible
 *      otorgada a anon). SELECT no se marca por sí solo — hay lecturas
 *      públicas legítimas.
 *   4. CREATE [OR REPLACE] FUNCTION ... SECURITY DEFINER sin SET search_path
 *      en el mismo bloque de función.
 *
 * Heurístico, no un parser SQL completo: antes de matchear se eliminan
 * comentarios (--... y /* *\/) y literales de cadena ('...'), lo que evita
 * falsos positivos de comentarios narrativos o queries de detección tipo
 * ILIKE '%OR true%'. Los falsos positivos restantes (o excepciones
 * legítimas y documentadas, como los 3 bootstraps históricos con banner de
 * BLK-05) se listan explícitamente en scripts/unsafe-sql-allowlist.json con
 * su razón — nunca se ignora una carpeta completa salvo _archive/.
 *
 * Uso: node scripts/scan-unsafe-sql.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SUPABASE_DIR = path.join(ROOT, "supabase");
const ARCHIVE_DIR = path.join(SUPABASE_DIR, "_archive");
const ALLOWLIST_PATH = path.join(__dirname, "unsafe-sql-allowlist.json");

function loadAllowlist() {
  const raw = fs.readFileSync(ALLOWLIST_PATH, "utf8");
  const parsed = JSON.parse(raw);
  const map = new Map();
  for (const entry of parsed.entries ?? []) {
    map.set(path.resolve(ROOT, entry.file), entry.reason);
  }
  return map;
}

function findSqlFiles(dir, files = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (full === ARCHIVE_DIR) continue;
    if (name.isDirectory()) {
      findSqlFiles(full, files);
    } else if (name.isFile() && name.name.endsWith(".sql")) {
      files.push(full);
    }
  }
  return files;
}

/** Quita comentarios de línea/bloque y literales de cadena para reducir falsos positivos. */
function stripCommentsAndStrings(sql) {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/'(?:[^']|'')*'/g, "''");
}

function findUsingOrCheckTrue(cleanSql) {
  const findings = [];
  const pattern = /(USING|WITH\s+CHECK)\s*\(\s*true\s*\)/gi;
  let m;
  while ((m = pattern.exec(cleanSql))) {
    findings.push(`${m[1].toUpperCase().replace(/\s+/g, " ")} (true)`);
  }
  return findings;
}

function findBareOrTrue(cleanSql) {
  const findings = [];
  const pattern = /\bOR\s+true\b/gi;
  let m;
  while ((m = pattern.exec(cleanSql))) {
    findings.push("OR true");
  }
  return findings;
}

function findSensitiveAnonGrants(cleanSql) {
  const findings = [];
  const pattern = /GRANT\s+((?:INSERT|UPDATE|DELETE|ALL)(?:\s*,\s*(?:INSERT|UPDATE|DELETE|ALL))*)\s+ON\s+[^;]*?\bTO\s+([^;]*)/gi;
  let m;
  while ((m = pattern.exec(cleanSql))) {
    const roles = m[2];
    if (/\banon\b/i.test(roles)) {
      findings.push(`GRANT ${m[1]} ... TO ${roles.trim()}`);
    }
  }
  return findings;
}

function findSecurityDefinerWithoutSearchPath(cleanSql) {
  const findings = [];
  const fnPattern = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION[\s\S]*?\$(?:[a-zA-Z_]*)\$[\s\S]*?\$(?:[a-zA-Z_]*)\$/gi;
  let m;
  while ((m = fnPattern.exec(cleanSql))) {
    const block = m[0];
    if (/SECURITY\s+DEFINER/i.test(block) && !/SET\s+search_path/i.test(block)) {
      const nameMatch = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-zA-Z0-9_."]+)/i.exec(block);
      findings.push(
        `SECURITY DEFINER sin SET search_path${nameMatch ? ` (${nameMatch[1]})` : ""}`
      );
    }
  }
  return findings;
}

function scanFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const clean = stripCommentsAndStrings(raw);
  return [
    ...findUsingOrCheckTrue(clean),
    ...findBareOrTrue(clean),
    ...findSensitiveAnonGrants(clean),
    ...findSecurityDefinerWithoutSearchPath(clean),
  ];
}

function main() {
  const allowlist = loadAllowlist();
  const files = findSqlFiles(SUPABASE_DIR);
  let totalFindings = 0;
  const report = [];

  for (const file of files) {
    const findings = scanFile(file);
    if (findings.length === 0) continue;

    const rel = path.relative(ROOT, file);
    if (allowlist.has(file)) {
      report.push({ file: rel, findings, allowed: true, reason: allowlist.get(file) });
      continue;
    }
    report.push({ file: rel, findings, allowed: false });
    totalFindings += findings.length;
  }

  if (report.length > 0) {
    console.log("=== scan-unsafe-sql: resultados ===\n");
    for (const entry of report) {
      const tag = entry.allowed ? "PERMITIDO (allowlist)" : "BLOQUEANTE";
      console.log(`[${tag}] ${entry.file}`);
      for (const f of entry.findings) console.log(`  - ${f}`);
      if (entry.allowed) console.log(`  razón: ${entry.reason}`);
      console.log("");
    }
  }

  if (totalFindings > 0) {
    console.error(
      `✖ ${totalFindings} patrón(es) inseguro(s) fuera de la allowlist. ` +
        `Corrígelos o documenta la excepción en scripts/unsafe-sql-allowlist.json con su razón.`
    );
    process.exit(1);
  }

  console.log("scan-unsafe-sql: sin hallazgos bloqueantes.");
}

main();
