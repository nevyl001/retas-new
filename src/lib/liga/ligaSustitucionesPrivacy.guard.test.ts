/**
 * Contrato de seguridad P0: migración 0098 endurece liga_sustituciones
 * sin reabrir lectura pública de motivos / actor / idempotency_key.
 */
import { readFileSync } from "fs";
import { join } from "path";

const SQL_0097 = readFileSync(
  join(
    __dirname,
    "../../../supabase/migrations/0097_liga_sustitucion_jugador_rotativo.sql"
  ),
  "utf8"
);

const SQL_0098 = readFileSync(
  join(
    __dirname,
    "../../../supabase/migrations/0098_liga_sustituciones_privacy_hardening.sql"
  ),
  "utf8"
);

describe("migración 0098 liga_sustituciones privacy", () => {
  it("elimina la policy pública y revoca privilegios a anon", () => {
    expect(SQL_0098).toMatch(
      /DROP POLICY IF EXISTS liga_sustituciones_select_public_liga/
    );
    expect(SQL_0098).toMatch(
      /REVOKE ALL ON TABLE public\.liga_sustituciones FROM anon/
    );
    expect(SQL_0098).toMatch(
      /GRANT SELECT ON TABLE public\.liga_sustituciones TO authenticated/
    );
    expect(SQL_0098).not.toMatch(
      /GRANT SELECT ON TABLE public\.liga_sustituciones TO anon/
    );
    expect(SQL_0098).not.toMatch(
      /GRANT INSERT|GRANT UPDATE|GRANT DELETE/
    );
  });

  it("expone solo campos públicos vía RPC controlada", () => {
    const fnIdx = SQL_0098.indexOf(
      "CREATE OR REPLACE FUNCTION public.list_liga_sustituciones_publicas"
    );
    expect(fnIdx).toBeGreaterThan(-1);
    const returnsMatch = SQL_0098.slice(fnIdx).match(
      /RETURNS TABLE\s*\(([\s\S]*?)\)\s*LANGUAGE/
    );
    expect(returnsMatch).toBeTruthy();
    const returnsCols = returnsMatch?.[1] ?? "";
    expect(returnsCols).toMatch(/from_jugador_id/);
    expect(returnsCols).toMatch(/to_jugador_id/);
    expect(returnsCols).toMatch(/jornada_efectiva_numero/);
    expect(returnsCols).toMatch(/puntos_heredados/);
    expect(returnsCols).not.toMatch(/motivo_detalle/);
    expect(returnsCols).not.toMatch(/actor_id/);
    expect(returnsCols).not.toMatch(/idempotency_key/);
    expect(returnsCols).not.toMatch(/motivo_categoria/);
  });

  it("valida permisos antes de la idempotencia en el RPC de sustitución", () => {
    const rpcIdx = SQL_0098.indexOf(
      "CREATE OR REPLACE FUNCTION public.sustituir_jugador_liga_individual_rotativo"
    );
    expect(rpcIdx).toBeGreaterThan(-1);
    const body = SQL_0098.slice(rpcIdx);
    const permIdx = body.indexOf("No tienes permiso para sustituir");
    const idemIdx = body.indexOf("WHERE idempotency_key = v_key");
    expect(permIdx).toBeGreaterThan(-1);
    expect(idemIdx).toBeGreaterThan(-1);
    expect(permIdx).toBeLessThan(idemIdx);
  });

  it("no modifica destructivamente el archivo 0097 versionado", () => {
    expect(SQL_0097).toMatch(/liga_sustituciones_select_public_liga/);
    expect(SQL_0098).toMatch(/Incremental sobre 0097/);
  });
});
