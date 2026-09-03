/**
 * Liga jornada/podio: closed + career fail → retry → ok → 2º retry idempotente.
 */
import { finalizeCareerEvent } from "../lib/rivieraJugadores/careerEventPipeline";
import {
  repairLigaJornadaCareerSync,
  repairLigaPodioCareerSync,
} from "../lib/rivieraJugadores/repairCareerClose";

jest.mock("../lib/rivieraJugadores/careerEventPipeline", () => ({
  finalizeCareerEvent: jest.fn(),
}));

const finalizeMock = finalizeCareerEvent as jest.Mock;

describe("Liga — failure → retry reparable", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("jornada: fail → repair ok → segundo repair idempotente", async () => {
    finalizeMock
      .mockResolvedValueOnce({
        ok: false,
        resultSaved: true,
        careerSynced: false,
        warnings: [],
        criticalFailures: [{ code: "sync_failed", message: "timeout" }],
        failures: [{ code: "sync_failed", message: "timeout" }],
      })
      .mockResolvedValue({
        ok: true,
        resultSaved: true,
        careerSynced: true,
        warnings: [],
        criticalFailures: [],
        failures: [],
      });

    const fail = await repairLigaJornadaCareerSync({
      organizadorId: "org-1",
      ligaId: "liga-1",
      jornadaNumero: 3,
    });
    expect(fail.careerSyncOk).toBe(false);

    const ok = await repairLigaJornadaCareerSync({
      organizadorId: "org-1",
      ligaId: "liga-1",
      jornadaNumero: 3,
    });
    expect(ok.careerSyncOk).toBe(true);

    const again = await repairLigaJornadaCareerSync({
      organizadorId: "org-1",
      ligaId: "liga-1",
      jornadaNumero: 3,
    });
    expect(again.careerSyncOk).toBe(true);
    expect(finalizeMock).toHaveBeenCalledTimes(3);
    expect(finalizeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "liga_jornada",
        ligaId: "liga-1",
        jornadaNumero: 3,
      })
    );
  });

  it("jornada: ok sin escritura (processed=false) NO reporta careerSyncOk", async () => {
    finalizeMock.mockResolvedValue({
      ok: true,
      processed: false,
      resultSaved: true,
      careerSynced: false,
      warnings: [],
      criticalFailures: [],
      failures: [],
      touchedJugadorIds: [],
    });

    const empty = await repairLigaJornadaCareerSync({
      organizadorId: "org-1",
      ligaId: "liga-1",
      jornadaNumero: 2,
    });
    expect(empty.careerSyncOk).toBe(false);
    expect(empty.careerSyncMessage).toMatch(/historial Riviera/i);
  });

  it("podio/final: fail → repair ok → segundo repair idempotente", async () => {
    finalizeMock
      .mockResolvedValueOnce({
        ok: false,
        resultSaved: true,
        careerSynced: false,
        warnings: [],
        criticalFailures: [{ code: "sync_failed", message: "podio fail" }],
        failures: [{ code: "sync_failed", message: "podio fail" }],
      })
      .mockResolvedValue({
        ok: true,
        resultSaved: true,
        careerSynced: true,
        warnings: [],
        criticalFailures: [],
        failures: [],
      });

    const fail = await repairLigaPodioCareerSync({
      organizadorId: "org-1",
      ligaId: "liga-1",
    });
    expect(fail.careerSyncOk).toBe(false);

    const ok = await repairLigaPodioCareerSync({
      organizadorId: "org-1",
      ligaId: "liga-1",
    });
    expect(ok.careerSyncOk).toBe(true);

    const again = await repairLigaPodioCareerSync({
      organizadorId: "org-1",
      ligaId: "liga-1",
    });
    expect(again.careerSyncOk).toBe(true);
    expect(finalizeMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "liga_podio", ligaId: "liga-1" })
    );
  });

  it("finishLiga/finishJornada exponen repair sin void fire-and-forget", () => {
    const fs = jest.requireActual("fs") as typeof import("fs");
    const path = jest.requireActual("path") as typeof import("path");
    const src = fs.readFileSync(
      path.join(__dirname, "ligaService.ts"),
      "utf8"
    );
    expect(src).toMatch(/resyncLigaJornadaCareer/);
    expect(src).toMatch(/resyncLigaPodioCareer/);
    expect(src).toMatch(/estado === "completed"/);
  });
});
