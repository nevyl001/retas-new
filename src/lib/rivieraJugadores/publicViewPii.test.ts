/**
 * Fase B (B11): regresión estática contra la fuente SQL versionada de
 * `public.riviera_jugadores_sitio_oficial` — la única vista pública de
 * jugadores con CREATE VIEW rastreado en el repo (concedido a anon +
 * authenticated). Objetivo: que ningún cambio futuro a ese archivo
 * reintroduzca una columna de PII sin que este test falle.
 *
 * `pairs_with_contact` NO tiene un CREATE VIEW rastreado en el repo (solo
 * ALTER/REVOKE/GRANT en supabase/fix-security-definer-views.sql, asumiendo
 * que ya existe en la base real) — no es verificable estáticamente aquí; su
 * endurecimiento (security_invoker, revoke de anon) vive en ese archivo.
 */
import fs from "fs";
import path from "path";

const VIEW_SQL_PATH = path.resolve(
  __dirname,
  "../../../supabase/ranking-sitio-oficial-global.sql"
);

const PII_COLUMN_NAMES = [
  "email",
  "telefono",
  "whatsapp",
  "fecha_nacimiento",
  "instagram_url",
  "facebook_url",
  "tiktok_url",
];

function extractViewDefinition(sql: string, viewName: string): string {
  const marker = `CREATE OR REPLACE VIEW public.${viewName} AS`;
  const start = sql.indexOf(marker);
  if (start === -1) {
    throw new Error(
      `No se encontró "CREATE OR REPLACE VIEW public.${viewName}" en ${VIEW_SQL_PATH}. ` +
        `Si la vista se movió/renombró, actualiza este test junto con el cambio.`
    );
  }
  const end = sql.indexOf(";", start);
  if (end === -1) throw new Error(`Definición de ${viewName} sin ";" de cierre.`);
  return sql.slice(start, end + 1);
}

describe("public.riviera_jugadores_sitio_oficial — sin PII (regresión estática)", () => {
  const sql = fs.readFileSync(VIEW_SQL_PATH, "utf8");
  const viewDef = extractViewDefinition(sql, "riviera_jugadores_sitio_oficial");

  test("el archivo fuente sigue existiendo y la vista sigue definida", () => {
    expect(viewDef.length).toBeGreaterThan(0);
  });

  test("no usa SELECT * (evita fuga silenciosa de columnas nuevas)", () => {
    expect(viewDef).not.toMatch(/select\s+\*/i);
  });

  test.each(PII_COLUMN_NAMES)(
    "ATAQUE: la definición NO expone la columna de PII '%s'",
    (col) => {
      // Coincide "rj.<col>" o "<col>" como identificador de columna completo
      // (con límites de palabra), no como substring de otro nombre.
      const re = new RegExp(`\\brj\\.${col}\\b|\\b${col}\\b`, "i");
      expect(viewDef).not.toMatch(re);
    }
  );

  test("GRANT a anon/authenticated sigue presente (documenta el diseño público intencional)", () => {
    expect(sql).toMatch(
      /GRANT SELECT ON public\.riviera_jugadores_sitio_oficial TO anon, authenticated;/
    );
  });

  test("sigue filtrando por estado activo, visible_publico y suma_ranking (no expone jugadores ocultos/inactivos)", () => {
    expect(viewDef).toMatch(/estado\s*=\s*'activo'/i);
    expect(viewDef).toMatch(/visible_publico\s+IS\s+TRUE/i);
  });
});
