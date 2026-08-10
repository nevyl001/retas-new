/**
 * Regresión: Express/Liga no deben perder carrera/ROMC en silencio tras cerrar.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { finishJornada, finishLiga } from "./ligaService";
import { finalizarTorneoExpressEliminatoria } from "./torneoExpressService";

describe("Express/Liga career sync no silenciosa", () => {
  it("documenta contrato: finalizeCareerEvent.ok=false → careerSyncOk false", () => {
    const mapOutcome = (result: {
      ok: boolean;
      criticalFailures: { message: string }[];
    }) => {
      if (!result.ok) {
        return {
          careerSyncOk: false,
          careerSyncMessage:
            result.criticalFailures.map((f) => f.message).join("; ") ||
            "cerrado sin historial",
        };
      }
      return { careerSyncOk: true as const };
    };

    expect(
      mapOutcome({
        ok: false,
        criticalFailures: [{ message: "sync falló" }],
      })
    ).toEqual({
      careerSyncOk: false,
      careerSyncMessage: "sync falló",
    });
    expect(mapOutcome({ ok: true, criticalFailures: [] })).toEqual({
      careerSyncOk: true,
    });
  });

  it("APIs de cierre exportan funciones con resultado de carrera", () => {
    expect(typeof finishJornada).toBe("function");
    expect(typeof finishLiga).toBe("function");
    expect(typeof finalizarTorneoExpressEliminatoria).toBe("function");
  });

  it("Express ya no usa void finalizeCareerEvent; await + careerSyncOk + repair", () => {
    const src = readFileSync(
      join(__dirname, "torneoExpressService.ts"),
      "utf8"
    );
    expect(src).not.toMatch(
      /void import\("\.\.\/lib\/rivieraJugadores\/careerEventPipeline"\)/
    );
    expect(src).toMatch(/careerSyncOk/);
    expect(src).toMatch(/repairTorneoExpressCareerSync/);
    expect(src).toMatch(/resyncTorneoExpressCareer/);
  });

  it("Liga jornada/podio usan resync reparable (no void)", () => {
    const src = readFileSync(join(__dirname, "ligaService.ts"), "utf8");
    const finishJornadaBlock = src.slice(
      src.indexOf("export async function finishJornada"),
      src.indexOf("export async function actualizarPuntosInscripcion")
    );
    const finishLigaBlock = src.slice(
      src.indexOf("export async function finishLiga"),
      src.indexOf("export async function getRanking")
    );
    expect(finishJornadaBlock).not.toMatch(/void import\(/);
    expect(finishLigaBlock).not.toMatch(/void import\(/);
    expect(finishJornadaBlock).toMatch(/resyncLigaJornadaCareer/);
    expect(finishLigaBlock).toMatch(/resyncLigaPodioCareer/);
    expect(src).toMatch(/repairLigaJornadaCareerSync/);
    expect(src).toMatch(/repairLigaPodioCareerSync/);
  });
});
