/**
 * Documenta 0032: ligas_modalidad_check admite legacy + parejas_fijas_playoffs.
 */
import * as fs from "fs";
import * as path from "path";

describe("0032 ligas_modalidad_check", () => {
  const sql = fs.readFileSync(
    path.join(
      __dirname,
      "../../../supabase/migrations/0032_liga_modalidad_check_playoffs.sql"
    ),
    "utf8"
  );

  it("conserva modalidades legacy y agrega parejas_fijas_playoffs", () => {
    expect(sql).toMatch(/individual_rotativo/);
    expect(sql).toMatch(/'parejas_fijas'/);
    expect(sql).toMatch(/parejas_fijas_playoffs/);
    expect(sql).toMatch(/ligas_modalidad_check/);
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS ligas_modalidad_check/);
    expect(sql).toMatch(/ADD CONSTRAINT ligas_modalidad_check/);
  });

  it("no toca RLS ni RPCs ni otras columnas", () => {
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/ALTER POLICY/i);
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION/i);
    expect(sql).not.toMatch(/ADD COLUMN/i);
    expect(sql).not.toMatch(/DROP COLUMN/i);
    expect(sql).not.toMatch(/0030_liga/);
    expect(sql).not.toMatch(/0031_liga/);
  });

  it("ABORT si el CHECK actual no tiene las legacy", () => {
    expect(sql).toMatch(/0032 ABORT: CHECK actual no menciona individual_rotativo/);
    expect(sql).toMatch(/0032 ABORT: CHECK actual no menciona parejas_fijas/);
  });
});

describe("LigaModalidad TypeScript alineada con CHECK 0032", () => {
  const allowed = [
    "individual_rotativo",
    "parejas_fijas",
    "parejas_fijas_playoffs",
  ] as const;

  it("todas las modalidades de producto están en el set del CHECK", () => {
    for (const m of allowed) {
      expect(sqlMentions(m)).toBe(true);
    }
  });
});

function sqlMentions(value: string): boolean {
  const sql = fs.readFileSync(
    path.join(
      __dirname,
      "../../../supabase/migrations/0032_liga_modalidad_check_playoffs.sql"
    ),
    "utf8"
  );
  return sql.includes(`'${value}'`);
}
