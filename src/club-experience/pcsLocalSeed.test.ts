/**
 * Contrato: el seed SQL local PCS debe espejar la config esperada.
 * Solo valida el fixture SQL — no configura runtime de la app.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PCS_EXPECTED_LOCAL_SEED_CONFIG,
  PCS_EXPECTED_LOCAL_SEED_EMAIL,
  PCS_EXPECTED_LOCAL_SEED_ORGANIZADOR_ID,
} from "./pcsExpectedLocalSeedConfig";

const SEED_SQL = join(
  __dirname,
  "../../supabase/seeds/pcs-organizador.sql"
);

describe("PCS local seed fixture", () => {
  const sql = readFileSync(SEED_SQL, "utf8");

  it("ancla el UUID y email del fixture", () => {
    expect(sql).toContain(PCS_EXPECTED_LOCAL_SEED_ORGANIZADOR_ID);
    expect(sql).toContain(PCS_EXPECTED_LOCAL_SEED_EMAIL);
  });

  it("usa password solo de desarrollo (nunca prod)", () => {
    expect(sql).toContain("PcsLocal2026!");
    expect(sql.toLowerCase()).toContain("solo desarrollo");
    expect(sql.toLowerCase()).toContain("nunca la de prod");
  });

  it("upserta organizador_game_modes con flags esperados del seed", () => {
    expect(sql).toMatch(/ON CONFLICT \(organizador_id\) DO UPDATE/i);
    expect(sql).toContain("premium_branding_enabled");
    expect(sql).toContain("'padel-court-series'");
    expect(sql).toMatch(
      /false,\s*-- reta_equipos[\s\S]*?false,\s*-- round_robin[\s\S]*?false,\s*-- americano[\s\S]*?true,\s*-- mini_torneo[\s\S]*?false,\s*-- liga[\s\S]*?false,\s*-- duelo_2v2/
    );
    expect(sql).toMatch(/true,\s*-- premium_branding_enabled/);
    expect(PCS_EXPECTED_LOCAL_SEED_CONFIG.mini_torneo).toBe(true);
    expect(PCS_EXPECTED_LOCAL_SEED_CONFIG.round_robin).toBe(false);
    expect(PCS_EXPECTED_LOCAL_SEED_CONFIG.duelo_2v2).toBe(false);
    expect(PCS_EXPECTED_LOCAL_SEED_CONFIG.premium_branding_enabled).toBe(true);
    expect(PCS_EXPECTED_LOCAL_SEED_CONFIG.branding_key).toBe(
      "padel-court-series"
    );
  });

  it("config.toml apunta a seed.sql", () => {
    const config = readFileSync(
      join(__dirname, "../../supabase/config.toml"),
      "utf8"
    );
    expect(config).toMatch(/sql_paths\s*=\s*\[.*"\.\/seed\.sql"/);
  });
});
