import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  RULE,
  formatFinding,
  loadAllowlist,
  parseAllowlistEntry,
  partitionFindings,
  scanSql,
} from "./scan-unsafe-sql.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIGRATION_0039 = path.join(
  ROOT,
  "supabase/migrations/0039_riviera_coaching_core.sql"
);

const RUBRIC_POLICY = `
CREATE POLICY crubric_select_auth ON public.coach_rubric_versions
  FOR SELECT TO authenticated
  USING (true);
`;

const DANGEROUS_POLICY = `
CREATE POLICY dangerous_policy ON public.example
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);
`;

describe("scan-unsafe-sql granularity", () => {
  it("A: 0039 crubric_select_auth SEC-001 is allowlisted; no other 0039 findings blocked", () => {
    const sql = fs.readFileSync(MIGRATION_0039, "utf8");
    const findings = scanSql(sql);
    const rubric = findings.filter(
      (f) => f.rule === RULE.SEC001 && f.context === "crubric_select_auth"
    );
    assert.equal(rubric.length, 1);
    assert.match(rubric[0].detail, /USING \(true\)/);

    const allow = loadAllowlist().get(path.resolve(MIGRATION_0039));
    const { allowed, blocked } = partitionFindings(findings, allow);
    assert.equal(blocked.length, 0);
    assert.ok(allowed.some((f) => f.context === "crubric_select_auth"));
  });

  it("B: another USING(true) policy in the same SQL is blocked", () => {
    const sql = fs.readFileSync(MIGRATION_0039, "utf8") + DANGEROUS_POLICY;
    const findings = scanSql(sql);
    const allow = loadAllowlist().get(path.resolve(MIGRATION_0039));
    const { blocked } = partitionFindings(findings, allow);
    assert.ok(
      blocked.some(
        (f) => f.rule === RULE.SEC001 && f.context === "dangerous_policy"
      ),
      formatFinding(blocked[0] ?? { rule: "", detail: "none", context: "" })
    );
    assert.ok(
      !blocked.some(
        (f) => f.rule === RULE.SEC001 && f.context === "crubric_select_auth"
      )
    );
  });

  it("C: GRANT INSERT TO anon is SEC-003 and is not covered by the 0039 exception", () => {
    const sql = `${RUBRIC_POLICY}\nGRANT INSERT ON public.coach_rubric_versions TO anon;`;
    const findings = scanSql(sql);
    assert.ok(findings.some((f) => f.rule === RULE.SEC003));
    const allow = parseAllowlistEntry({
      file: "x",
      exceptions: [
        {
          rule: RULE.SEC001,
          context: "crubric_select_auth",
          reason: "test",
        },
      ],
    });
    const { blocked } = partitionFindings(findings, allow);
    assert.ok(blocked.some((f) => f.rule === RULE.SEC003));
  });

  it("D: OR true is SEC-002 and stays blocked next to the audited policy", () => {
    const sql = `${RUBRIC_POLICY}\nCREATE POLICY open_or ON public.t FOR SELECT TO anon USING (id IS NULL OR true);`;
    const findings = scanSql(sql);
    assert.ok(findings.some((f) => f.rule === RULE.SEC002));
    const allow = parseAllowlistEntry({
      exceptions: [
        {
          rule: RULE.SEC001,
          context: "crubric_select_auth",
          reason: "test",
        },
      ],
    });
    const { blocked } = partitionFindings(findings, allow);
    assert.ok(blocked.some((f) => f.rule === RULE.SEC002));
  });

  it("E: SECURITY DEFINER without SET search_path is SEC-004 and stays blocked", () => {
    const sql = `${RUBRIC_POLICY}
CREATE FUNCTION public.unsafe_fn()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NULL;
END;
$$;
`;
    const findings = scanSql(sql);
    assert.ok(findings.some((f) => f.rule === RULE.SEC004));
    const allow = parseAllowlistEntry({
      exceptions: [
        {
          rule: RULE.SEC001,
          context: "crubric_select_auth",
          reason: "test",
        },
      ],
    });
    const { blocked } = partitionFindings(findings, allow);
    assert.ok(blocked.some((f) => f.rule === RULE.SEC004));
  });

  it("F: historical { file, reason } still allowlists the entire file", () => {
    const sql = DANGEROUS_POLICY + "\nGRANT DELETE ON public.t TO anon;";
    const findings = scanSql(sql);
    assert.ok(findings.length >= 2);
    const { allowed, blocked } = partitionFindings(
      findings,
      parseAllowlistEntry({ file: "hist.sql", reason: "legacy whole file" })
    );
    assert.equal(blocked.length, 0);
    assert.equal(allowed.length, findings.length);
  });
});
