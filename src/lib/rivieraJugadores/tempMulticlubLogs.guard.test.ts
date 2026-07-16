import { readFileSync } from "fs";
import { join } from "path";

describe("TEMP_MULTICLUB logs gated for production", () => {
  const roots = [
    join(__dirname, "jugadorIdResolver.ts"),
    join(__dirname, "rivieraOfficialLedger.ts"),
    join(__dirname, "syncParticipaciones.ts"),
  ];

  it("usan debugWarn/debugLog y no console.warn directo con el prefijo", () => {
    for (const file of roots) {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(/debugWarn/);
      expect(src).not.toMatch(/console\.warn\(\s*TEMP_/);
      expect(src).not.toMatch(/console\.warn\(\s*TEMP_LOG_PREFIX/);
      expect(src).not.toMatch(/console\.warn\(\s*TEMP_ROMC_LOG_PREFIX/);
      expect(src).not.toMatch(/console\.warn\(\s*TEMP_POINTS_LOG_PREFIX/);
    }
  });

  it("prefijos TEMP_MULTICLUB siguen existiendo solo como constantes de debug", () => {
    const joined = roots.map((f) => readFileSync(f, "utf8")).join("\n");
    expect(joined).toContain("TEMP_MULTICLUB_PHASE_2_1");
    expect(joined).toContain("TEMP_MULTICLUB_ROMC_2_2");
    expect(joined).toContain("TEMP_MULTICLUB_POINTS_2_1_B");
  });
});
