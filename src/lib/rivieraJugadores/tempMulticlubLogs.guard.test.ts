import { readFileSync } from "fs";
import { join } from "path";

/**
 * La instrumentación temporal TEMP_MULTICLUB (Fase 2.1/2.2 del rollout de
 * identidad/ledger multi-club) ya cumplió su función de auditoría y fue
 * retirada. Este guard evita que los prefijos reaparezcan por accidente en
 * los módulos de runtime donde vivían.
 */
describe("TEMP_MULTICLUB logs retirados definitivamente", () => {
  const roots = [
    join(__dirname, "jugadorIdResolver.ts"),
    join(__dirname, "rivieraOfficialLedger.ts"),
    join(__dirname, "syncParticipaciones.ts"),
  ];

  it("no reintroducen los prefijos de instrumentación temporal ya retirada", () => {
    for (const file of roots) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toContain("TEMP_MULTICLUB_PHASE_2_1");
      expect(src).not.toContain("TEMP_MULTICLUB_POINTS_2_1_B");
      expect(src).not.toContain("TEMP_MULTICLUB_ROMC_2_2");
      expect(src).not.toMatch(/logMulticlubPhase21|logMulticlubPoints21B|logRomcPhase22\b/);
    }
  });
});
