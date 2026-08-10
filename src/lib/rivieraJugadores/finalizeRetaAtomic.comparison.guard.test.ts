/**
 * PASO 3C — comparación pipeline actual vs finalize_reta_atomic.
 * NO cablea la RPC. Solo documenta evidencia en tests de lectura.
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "../../..");

describe("Reta: pipeline TS vs finalize_reta_atomic (sin cablear)", () => {
  const atomicSql = readFileSync(
    join(ROOT, "supabase/migrations/0015_finalize_reta_atomic.sql"),
    "utf8"
  );
  const tm = readFileSync(
    join(ROOT, "src/components/TournamentManager.tsx"),
    "utf8"
  );

  it("finalize_reta_atomic existe y usa con_ledger + rating + is_finished en una TX", () => {
    expect(atomicSql).toMatch(/CREATE OR REPLACE FUNCTION public\.finalize_reta_atomic/);
    expect(atomicSql).toMatch(/registrar_participacion_jugador_con_ledger/);
    expect(atomicSql).toMatch(/aplicar_rating_partido/);
    expect(atomicSql).toMatch(/is_finished = true/);
    expect(atomicSql).toMatch(/FOR UPDATE/);
    expect(atomicSql).toMatch(/already_finalized/);
  });

  it("frontend NO llama finalize_reta_atomic (cero callers)", () => {
    expect(tm).not.toMatch(/finalize_reta_atomic/);
    expect(tm).toMatch(/finalizeCareerEvent/);
  });

  it("pipeline actual: finalizeCareerEvent + is_finished aparte (no atómico DB)", () => {
    expect(tm).toMatch(/finalizeCareerEvent/);
    expect(tm).toMatch(/is_finished/);
  });

  it("verify migration 0017 existe como artefacto de verificación SQL", () => {
    expect(
      existsSync(join(ROOT, "supabase/migrations/0017_verify_finalize_reta_atomic.sql"))
    ).toBe(true);
  });
});
