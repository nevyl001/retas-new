import { CareerIntegrityException } from "../careerIntegrity";

jest.mock("../../supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock("../syncParticipaciones", () => ({
  syncRetaParticipaciones: jest.fn(),
  syncDuelo2v2Participaciones: jest.fn(),
  syncAmericanoParticipaciones: jest.fn(),
  syncTorneoExpressParticipaciones: jest.fn(),
  syncLigaJornada: jest.fn(),
  syncLigaFinalPodio: jest.fn(),
  syncLigaInscripcionRanking: jest.fn(),
  collectJugadorIdsForCareerEvent: jest.fn(),
}));

jest.mock("../jugadorIdResolver", () => ({
  prepareParticipacionIdentityForOrganizer: jest.fn().mockResolvedValue(undefined),
  resolveJugadorIdForParticipacion: jest.fn(),
}));

jest.mock("./preCloseGuards", () => ({
  validateCareerEventPreClose: jest.fn(),
}));

jest.mock("../rivieraJugadoresService", () => ({
  rebuildJugadorStats: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("./assertions", () => {
  const actual = jest.requireActual("./assertions") as typeof import("./assertions");
  return {
    ...actual,
    assertCareerEventIntegrity: jest.fn().mockResolvedValue([]),
  };
});

import { finalizeCareerEvent } from "./pipeline";
import { validateCareerEventPreClose } from "./preCloseGuards";
import { syncRetaParticipaciones } from "../syncParticipaciones";
import {
  resolveJugadorForEventSync,
  runParallelPlayerParticipacionSync,
  runPlayerParticipacionSync,
} from "./careerEventPlayerSync";
import { resolveJugadorIdForParticipacion } from "../jugadorIdResolver";
import type { CareerEventAssertionFailure } from "./types";

const ORG = "2770b522-9064-4c7b-a729-4a0ea7e3f6e8";
const GOOD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GOOD_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AMBIGUOUS = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("career batch resilience", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateCareerEventPreClose as jest.Mock).mockResolvedValue({
      ok: true,
      failures: [],
      excludedJugadorIds: [],
      eventBlocked: false,
    });
  });

  it("NO ejecuta sync si pre-close reporta fallas de identidad (opción B)", async () => {
    (validateCareerEventPreClose as jest.Mock).mockResolvedValue({
      ok: false,
      failures: [
        {
          code: "ambiguous_profile_link",
          message:
            'No se pudo cerrar la reta porque «Jugador» no tiene una identidad Riviera válida.',
          jugadorId: AMBIGUOUS,
        },
      ],
      excludedJugadorIds: [],
      eventBlocked: true,
    });

    const result = await finalizeCareerEvent({
      kind: "reta",
      organizadorId: ORG,
      tournament: {
        id: "reta-batch-1",
        name: "Batch test",
        is_finished: true,
      } as never,
      pairs: [],
      matches: [],
    });

    expect(syncRetaParticipaciones).not.toHaveBeenCalled();
    expect(result.processed).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.touchedJugadorIds).toEqual([]);
    expect(result.failures.some((f) => f.jugadorId === AMBIGUOUS)).toBe(true);
  });

  it("ejecuta sync exactamente una vez cuando pre-close.ok", async () => {
    (validateCareerEventPreClose as jest.Mock).mockResolvedValue({
      ok: true,
      failures: [],
      excludedJugadorIds: [],
      eventBlocked: false,
    });

    (syncRetaParticipaciones as jest.Mock).mockResolvedValue({
      touchedJugadorIds: [GOOD_A, GOOD_B],
      participacionEventoId: "reta-batch-1",
      syncFailures: [],
    });

    const result = await finalizeCareerEvent({
      kind: "reta",
      organizadorId: ORG,
      tournament: {
        id: "reta-batch-1",
        name: "Batch test",
        is_finished: true,
      } as never,
      pairs: [],
      matches: [],
    });

    expect(syncRetaParticipaciones).toHaveBeenCalledTimes(1);
    expect(result.processed).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.touchedJugadorIds).toEqual([GOOD_A, GOOD_B]);
  });

  it("no ejecuta sync si el evento padre está bloqueado", async () => {
    (validateCareerEventPreClose as jest.Mock).mockResolvedValue({
      ok: false,
      failures: [
        {
          code: "missing_parent_event",
          message: "Reta padre no encontrada",
        },
      ],
      excludedJugadorIds: [],
      eventBlocked: true,
    });

    const result = await finalizeCareerEvent({
      kind: "reta",
      organizadorId: ORG,
      tournament: { id: "missing", name: "X", is_finished: true } as never,
      pairs: [],
      matches: [],
    });

    expect(syncRetaParticipaciones).not.toHaveBeenCalled();
    expect(result.processed).toBe(false);
    expect(result.touchedJugadorIds).toEqual([]);
  });
});

describe("resolveJugadorForEventSync", () => {
  it("devuelve failure aislado sin lanzar", async () => {
    (resolveJugadorIdForParticipacion as jest.Mock).mockRejectedValue(
      new CareerIntegrityException({
        code: "ambiguous_profile_link",
        message: "ambiguo",
        confidence: "REVIEW",
        reason: "múltiples candidatos",
        jugadorId: AMBIGUOUS,
      })
    );

    const result = await resolveJugadorForEventSync({
      organizadorId: ORG,
      nombre: "Victor L",
      tipoEvento: "reta",
      eventoId: "reta-1",
    });

    expect(result.jugadorId).toBeNull();
    expect(result.failure?.code).toBe("ambiguous_profile_link");
  });

  it("omite jugadores en excludedJugadorIds", async () => {
    (resolveJugadorIdForParticipacion as jest.Mock).mockResolvedValue(AMBIGUOUS);

    const result = await resolveJugadorForEventSync(
      { organizadorId: ORG, jugadorId: AMBIGUOUS, tipoEvento: "reta" },
      new Set([AMBIGUOUS])
    );

    expect(result.jugadorId).toBeNull();
    expect(result.failure).toBeUndefined();
  });
});

describe("runPlayerParticipacionSync", () => {
  it("continúa tras excepción y acumula failure", async () => {
    const failures: CareerEventAssertionFailure[] = [];
    const touched: string[] = [];

    for (const id of [GOOD_A, AMBIGUOUS, GOOD_B]) {
      await runPlayerParticipacionSync(
        failures,
        { jugadorId: id },
        async () => {
          if (id === AMBIGUOUS) {
            throw new CareerIntegrityException({
              code: "ambiguous_profile_link",
              message: "ambiguo",
              confidence: "REVIEW",
              reason: "review",
              jugadorId: AMBIGUOUS,
            });
          }
          touched.push(id);
        }
      );
    }

    expect(touched).toEqual([GOOD_A, GOOD_B]);
    expect(failures).toHaveLength(1);
    expect(failures[0].jugadorId).toBe(AMBIGUOUS);
  });
});

describe("runParallelPlayerParticipacionSync", () => {
  it("ejecuta en paralelo y mergea failures sin mutación compartida", async () => {
    const touched: string[] = [];

    const outcome = await runParallelPlayerParticipacionSync([
      {
        ctx: { jugadorId: GOOD_A },
        fn: async () => {
          touched.push(GOOD_A);
          return { jugadorId: GOOD_A };
        },
      },
      {
        ctx: { jugadorId: AMBIGUOUS },
        fn: async () => {
          throw new CareerIntegrityException({
            code: "ambiguous_profile_link",
            message: "ambiguo",
            confidence: "REVIEW",
            reason: "review",
            jugadorId: AMBIGUOUS,
          });
        },
      },
      {
        ctx: { jugadorId: GOOD_B },
        fn: async () => {
          touched.push(GOOD_B);
          return { jugadorId: GOOD_B };
        },
      },
    ]);

    expect(touched).toEqual(expect.arrayContaining([GOOD_A, GOOD_B]));
    expect(touched).toHaveLength(2);
    expect(outcome.touchedJugadorIds).toEqual([GOOD_A, GOOD_B]);
    expect(outcome.syncFailures).toHaveLength(1);
    expect(outcome.syncFailures[0].jugadorId).toBe(AMBIGUOUS);
  });
});
