/**
 * Abrir una liga o jornada ya cerrada no debe relanzar el pipeline de
 * carrera si el historial de ganadores ya existe. Si falta, sí repara.
 */
/* eslint-disable import/first */
jest.mock("../lib/supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
    auth: { getUser: jest.fn() },
  },
}));

jest.mock("./ligaCareerInscripcionSync", () => ({
  collectLigaParticipantLegacyJugadorIds: jest.fn(() => ["legacy-1"]),
  ensureLigaInscripcionRankingForLiga: jest.fn().mockResolvedValue(undefined),
  fireLigaInscripcionRankingSync: jest.fn(),
}));

jest.mock("../lib/rivieraJugadores/repairCareerClose", () => ({
  repairLigaJornadaCareerSync: jest.fn(),
}));

import { supabase } from "../lib/supabaseClient";
import { ensureLigaInscripcionRankingForLiga } from "./ligaCareerInscripcionSync";
import { repairLigaJornadaCareerSync } from "../lib/rivieraJugadores/repairCareerClose";
import {
  resyncCompletedLigaJornadasCareerIfMissing,
  resyncLigaJornadaCareerIfMissing,
} from "./ligaService";

const fromMock = supabase.from as jest.Mock;
const getUserMock = supabase.auth.getUser as jest.Mock;
const ensureMock = ensureLigaInscripcionRankingForLiga as jest.Mock;
const repairMock = repairLigaJornadaCareerSync as jest.Mock;

function mockWinnerProbe(count: number) {
  fromMock.mockImplementation((table: string) => {
    const builder = {
      select: jest.fn(),
      eq: jest.fn(),
      filter: jest.fn(),
      in: jest.fn(),
      order: jest.fn(),
      maybeSingle: jest.fn(async () => {
        if (table === "ligas") {
          return {
            data: {
              id: "liga-1",
              nombre: "Liga",
              estado: "in_progress",
              modalidad: "individual_rotativo",
              vueltas: 1,
              organizador_id: "org-1",
              canchas_disponibles: 2,
              created_at: "2026-01-01T00:00:00Z",
            },
            error: null,
          };
        }
        if (table === "liga_jornadas") {
          return {
            data: { liga_id: "liga-1", numero: 1, estado: "completed" },
            error: null,
          };
        }
        return { data: null, error: null };
      }),
      then: (
        resolve: (value: { count?: number; data?: unknown[]; error: null }) => unknown,
        reject?: (reason: unknown) => unknown
      ) =>
        Promise.resolve(
          table === "jugador_participaciones"
            ? { count, error: null }
            : { data: [], error: null }
        ).then(resolve, reject),
    };
    builder.select.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    builder.filter.mockReturnValue(builder);
    builder.in.mockReturnValue(builder);
    builder.order.mockReturnValue(builder);
    return builder;
  });
}

describe("consulta de jornada completada", () => {
  beforeEach(() => {
    fromMock.mockReset();
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    ensureMock.mockClear();
    repairMock.mockReset();
    repairMock.mockResolvedValue({
      careerSyncOk: true,
      pipeline: { ok: true, careerSynced: true },
    });
  });

  it("no relanza inscripción ni repair si ya hay ganador de jornada", async () => {
    mockWinnerProbe(2);

    const one = await resyncLigaJornadaCareerIfMissing("jornada-1");
    const all = await resyncCompletedLigaJornadasCareerIfMissing([
      "jornada-1",
      "jornada-9",
      "jornada-10",
    ]);

    expect(one).toEqual({ careerSyncOk: true, alreadyRecorded: true });
    expect(all.skipped).toBe(3);
    expect(all.repaired).toBe(0);
    expect(all.failed).toBe(0);
    expect(ensureMock).not.toHaveBeenCalled();
    expect(repairMock).not.toHaveBeenCalled();
  });

  it("sí repara cuando la jornada cerrada no tiene ganador registrado", async () => {
    mockWinnerProbe(0);

    const outcome = await resyncLigaJornadaCareerIfMissing("jornada-vacia");

    expect(outcome.alreadyRecorded).toBeUndefined();
    expect(ensureMock).toHaveBeenCalled();
    expect(repairMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ligaId: "liga-1",
        jornadaNumero: 1,
        skipIdentityEnsure: true,
      })
    );
  });
});
