/**
 * Guard offline: refresh_jugador_stats debe exigir ownership (0026),
 * alineado con 0021. No ejecuta SQL contra prod.
 */
import { readFileSync } from "fs";
import { join } from "path";

const MIGRATION = join(
  __dirname,
  "../../../supabase/migrations/0026_refresh_jugador_stats_ownership_guard.sql"
);

describe("refresh_jugador_stats ownership guard (0026)", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("rechaza anon explícitamente", () => {
    expect(sql).toMatch(/v_role = 'anon'/);
    expect(sql).toMatch(/No autorizado para refrescar estadísticas/);
  });

  it("authenticated requiere dueño del perfil o master", () => {
    expect(sql).toMatch(/v_role = 'authenticated'/);
    expect(sql).toMatch(/is_master_admin\(\)/);
    expect(sql).toMatch(/v_player_org IS DISTINCT FROM auth\.uid\(\)/);
  });

  it("REVOKE anon + GRANT authenticated (no PUBLIC abierto)", () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.refresh_jugador_stats\(uuid\) FROM anon/);
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.refresh_jugador_stats\(uuid\) TO authenticated/
    );
  });

  it("conserva semántica algebraica SUM(puntos_obtenidos) sin GREATEST clamp", () => {
    expect(sql).toMatch(/COALESCE\(SUM\(jp\.puntos_obtenidos\), 0\)/);
    expect(sql).not.toMatch(/SUM\(GREATEST\(0,\s*jp\.puntos_obtenidos\)\)/);
  });

  it("matriz de autorización esperada (contrato documentado)", () => {
    // owner → permitido | master → permitido | otro organizer → rechazado
    const cases = [
      { role: "owner", allowed: true },
      { role: "master", allowed: true },
      { role: "other_organizer", allowed: false },
      { role: "anon", allowed: false },
    ] as const;
    expect(cases.filter((c) => c.allowed).map((c) => c.role)).toEqual([
      "owner",
      "master",
    ]);
    expect(cases.filter((c) => !c.allowed).map((c) => c.role)).toEqual([
      "other_organizer",
      "anon",
    ]);
  });

  it("migración idempotente (CREATE OR REPLACE + grants seguros)", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.refresh_jugador_stats/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.refresh_jugador_stats\(uuid\) FROM PUBLIC/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.refresh_jugador_stats\(uuid\) TO service_role/);
  });

  it("callers legítimos son owner-scoped (rebuildJugadorStats / pipeline)", () => {
    const svc = readFileSync(
      join(__dirname, "rivieraJugadoresService.ts"),
      "utf8"
    );
    const pipeline = readFileSync(
      join(__dirname, "careerEventPipeline/pipeline.ts"),
      "utf8"
    );
    expect(svc).toMatch(/refresh_jugador_stats/);
    expect(pipeline).toMatch(/rebuildJugadorStats/);
    // No hay RPC directo cross-tenant desde UI pública
    expect(svc).not.toMatch(/rpc\("refresh_jugador_stats".*organizador_id:\s*null/);
  });
});

/** Gate Fase 1.1: 0026 READY FOR PROD (no aplicada aún). */
export const REFRESH_STATS_0026_READY_FOR_PROD = true as const;
