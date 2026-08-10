/**
 * Política ROMC emitter: espejo de `_is_official_ranking_emitter` + SQL source.
 *
 * Default: org activo en public.users emite, salvo fila is_active=false.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { isOfficialRankingEmitterPure } from "./romcEmitterPolicy";

const ROMC2 = join(
  __dirname,
  "../../../supabase/riviera-official-multi-club-romc2.sql"
);

describe("ROMC emitter policy (_is_official_ranking_emitter)", () => {
  const sql = readFileSync(ROMC2, "utf8");

  it("SQL: bloquea solo is_active=false; ELSE EXISTS users", () => {
    expect(sql).toMatch(/_is_official_ranking_emitter/);
    expect(sql).toMatch(/e\.is_active = false/);
    expect(sql).toMatch(/FROM public\.users u/);
    expect(sql).toMatch(
      /por defecto todos los organizadores \(public\.users\) emiten/
    );
  });

  it("organizador normal activo sin fila especial → EMITE", () => {
    expect(
      isOfficialRankingEmitterPure({
        organizadorId: "org-normal",
        existsInUsers: true,
        emitterRow: null,
      })
    ).toBe(true);
  });

  it("organizador con is_active=true → EMITE", () => {
    expect(
      isOfficialRankingEmitterPure({
        organizadorId: "org-on",
        existsInUsers: true,
        emitterRow: { is_active: true },
      })
    ).toBe(true);
  });

  it("organizador con is_active=false → NO emite", () => {
    expect(
      isOfficialRankingEmitterPure({
        organizadorId: "org-off",
        existsInUsers: true,
        emitterRow: { is_active: false },
      })
    ).toBe(false);
  });

  it("organizador inexistente (no en users) → NO emite", () => {
    expect(
      isOfficialRankingEmitterPure({
        organizadorId: "org-missing",
        existsInUsers: false,
        emitterRow: null,
      })
    ).toBe(false);
  });

  it("organizador null → NO emite", () => {
    expect(
      isOfficialRankingEmitterPure({
        organizadorId: null,
        existsInUsers: true,
        emitterRow: null,
      })
    ).toBe(false);
  });
});
