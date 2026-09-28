#!/usr/bin/env node
/**
 * lint:sql (BLK-05) — falla (exit 1) si supabase/**\/*.sql (fuera de
 * supabase/_archive/**, histórico no ejecutable) contiene:
 *   SEC-001  USING (true) / WITH CHECK (true) como cláusula de policy RLS.
 *   SEC-002  "OR true" como término booleano bare (no dentro de un literal de
 *            cadena — ej. 'qual ILIKE %OR true%' en un script de verificación NO
 *            cuenta).
 *   SEC-003  GRANT INSERT/UPDATE/DELETE/ALL ... TO ...anon... (operación sensible
 *            otorgada a anon). SELECT no se marca por sí solo — hay lecturas
 *            públicas legítimas.
 *   SEC-004  CREATE [OR REPLACE] FUNCTION ... SECURITY DEFINER sin SET search_path
 *            en el mismo bloque de función.
 *
 * Heurístico, no un parser SQL completo: antes de matchear se eliminan
 * comentarios (--... y /* *\/) y literales de cadena ('...'), lo que evita
 * falsos positivos de comentarios narrativos o queries de detección tipo
 * ILIKE '%OR true%'. Los falsos positivos restantes (o excepciones
 * legítimas y documentadas, como los 3 bootstraps históricos con banner de
 * BLK-05) se listan explícitamente en scripts/unsafe-sql-allowlist.json con
 * su razón — nunca se ignora una carpeta completa salvo _archive/.
 *
 * Allowlist:
 *   { file, reason }                         → archivo entero (histórico)
 *   { file, exceptions: [{ rule, context, reason }] }
 *                                            → solo esos pares regla+contexto
 *
 * Uso: node scripts/scan-unsafe-sql.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SUPABASE_DIR = path.join(ROOT, "supabase");
const ARCHIVE_DIR = path.join(SUPABASE_DIR, "_archive");
const ALLOWLIST_PATH = path.join(__dirname, "unsafe-sql-allowlist.json");

export const RULE = {
  SEC001: "SEC-001",
  SEC002: "SEC-002",
  SEC003: "SEC-003",
  SEC004: "SEC-004",
};

const POLICY_LOOKBACK = 2500;

export function stripCommentsAndStrings(sql) {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/'(?:[^']|'')*'/g, "''");
}

function lastCreatePolicyName(cleanSql, atIndex) {
  const start = Math.max(0, atIndex - POLICY_LOOKBACK);
  const window = cleanSql.slice(start, atIndex);
  let name = null;
  const re =
    /CREATE\s+POLICY\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[A-Za-z_][A-Za-z0-9_]*"?)/gi;
  let m;
  while ((m = re.exec(window))) {
    name = m[1].replace(/"/g, "");
  }
  return name;
}

function finding(rule, detail, context) {
  return {
    rule,
    detail,
    context: context || "",
  };
}

export function formatFinding(f) {
  const ctx = f.context ? ` [${f.context}]` : "";
  return `${f.rule} ${f.detail}${ctx}`;
}

function findUsingOrCheckTrue(cleanSql) {
  const findings = [];
  const pattern = /(USING|WITH\s+CHECK)\s*\(\s*true\s*\)/gi;
  let m;
  while ((m = pattern.exec(cleanSql))) {
    const clause = `${m[1].toUpperCase().replace(/\s+/g, " ")} (true)`;
    findings.push(
      finding(RULE.SEC001, clause, lastCreatePolicyName(cleanSql, m.index))
    );
  }
  return findings;
}

function findBareOrTrue(cleanSql) {
  const findings = [];
  const pattern = /\bOR\s+true\b/gi;
  let m;
  while ((m = pattern.exec(cleanSql))) {
    findings.push(
      finding(RULE.SEC002, "OR true", lastCreatePolicyName(cleanSql, m.index))
    );
  }
  return findings;
}

function findSensitiveAnonGrants(cleanSql) {
  const findings = [];
  const pattern =
    /GRANT\s+((?:INSERT|UPDATE|DELETE|ALL)(?:\s*,\s*(?:INSERT|UPDATE|DELETE|ALL))*)\s+ON\s+([^;]*?)\bTO\s+([^;]*)/gi;
  let m;
  while ((m = pattern.exec(cleanSql))) {
    const roles = m[3];
    if (/\banon\b/i.test(roles)) {
      const onTarget = m[2].trim().split(/\s+/)[0] || "";
      findings.push(
        finding(
          RULE.SEC003,
          `GRANT ${m[1]} ... TO ${roles.trim()}`,
          onTarget
        )
      );
    }
  }
  return findings;
}

function findSecurityDefinerWithoutSearchPath(cleanSql) {
  const findings = [];
  const fnPattern =
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION[\s\S]*?\$(?:[a-zA-Z_]*)\$[\s\S]*?\$(?:[a-zA-Z_]*)\$/gi;
  let m;
  while ((m = fnPattern.exec(cleanSql))) {
    const block = m[0];
    if (/SECURITY\s+DEFINER/i.test(block) && !/SET\s+search_path/i.test(block)) {
      const nameMatch =
        /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-zA-Z0-9_."]+)/i.exec(block);
      const fnName = nameMatch ? nameMatch[1] : "";
      findings.push(
        finding(
          RULE.SEC004,
          `SECURITY DEFINER sin SET search_path${fnName ? ` (${fnName})` : ""}`,
          fnName
        )
      );
    }
  }
  return findings;
}

export function scanSql(sql) {
  const clean = stripCommentsAndStrings(sql);
  return [
    ...findUsingOrCheckTrue(clean),
    ...findBareOrTrue(clean),
    ...findSensitiveAnonGrants(clean),
    ...findSecurityDefinerWithoutSearchPath(clean),
  ];
}

export function scanFile(filePath) {
  return scanSql(fs.readFileSync(filePath, "utf8"));
}

/**
 * @returns {{ fileWideReason: string | null, exceptions: Array<{ rule: string, context: string, reason: string }> }}
 */
export function parseAllowlistEntry(entry) {
  const exceptions = Array.isArray(entry.exceptions)
    ? entry.exceptions.map((ex) => ({
        rule: String(ex.rule ?? ""),
        context: String(ex.context ?? ""),
        reason: String(ex.reason ?? ""),
      }))
    : [];
  const fileWideReason =
    exceptions.length === 0 && typeof entry.reason === "string"
      ? entry.reason
      : null;
  return { fileWideReason, exceptions };
}

export function partitionFindings(findings, allowEntry) {
  if (!allowEntry) {
    return { allowed: [], blocked: findings };
  }
  if (allowEntry.fileWideReason) {
    return { allowed: findings, blocked: [], reason: allowEntry.fileWideReason };
  }
  const allowed = [];
  const blocked = [];
  for (const f of findings) {
    const hit = allowEntry.exceptions.find(
      (ex) => ex.rule === f.rule && ex.context === f.context
    );
    if (hit) allowed.push({ ...f, allowReason: hit.reason });
    else blocked.push(f);
  }
  return { allowed, blocked };
}

export function loadAllowlist(allowlistPath = ALLOWLIST_PATH) {
  const raw = fs.readFileSync(allowlistPath, "utf8");
  const parsed = JSON.parse(raw);
  const map = new Map();
  for (const entry of parsed.entries ?? []) {
    map.set(path.resolve(ROOT, entry.file), parseAllowlistEntry(entry));
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

export function scanSupabaseSql(root = ROOT) {
  const allowlist = loadAllowlist();
  const files = findSqlFiles(path.join(root, "supabase"));
  const report = [];
  let blockedCount = 0;

  for (const file of files) {
    const findings = scanFile(file);
    if (findings.length === 0) continue;

    const rel = path.relative(root, file);
    const { allowed, blocked, reason } = partitionFindings(
      findings,
      allowlist.get(file)
    );
    blockedCount += blocked.length;
    report.push({ file: rel, findings, allowed, blocked, reason });
  }

  return { report, blockedCount };
}

function main() {
  const { report, blockedCount } = scanSupabaseSql();

  if (report.length > 0) {
    console.log("=== scan-unsafe-sql: resultados ===\n");
    for (const entry of report) {
      if (entry.blocked.length === 0) {
        console.log(`[PERMITIDO (allowlist)] ${entry.file}`);
        for (const f of entry.allowed) {
          console.log(`  - ${formatFinding(f)}`);
        }
        const why =
          entry.reason ||
          entry.allowed.map((f) => f.allowReason).filter(Boolean)[0];
        if (why) console.log(`  razón: ${why}`);
        console.log("");
        continue;
      }
      console.log(`[BLOQUEANTE] ${entry.file}`);
      for (const f of entry.blocked) console.log(`  - ${formatFinding(f)}`);
      if (entry.allowed.length > 0) {
        console.log("  (permitidos en este archivo)");
        for (const f of entry.allowed) {
          console.log(`  - ${formatFinding(f)}`);
        }
      }
      console.log("");
    }
  }

  if (blockedCount > 0) {
    console.error(
      `✖ ${blockedCount} patrón(es) inseguro(s) fuera de la allowlist. ` +
        `Corrígelos o documenta la excepción en scripts/unsafe-sql-allowlist.json con su razón.`
    );
    process.exit(1);
  }

  console.log("scan-unsafe-sql: sin hallazgos bloqueantes.");
}

const isCli =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isCli) {
  main();
}
