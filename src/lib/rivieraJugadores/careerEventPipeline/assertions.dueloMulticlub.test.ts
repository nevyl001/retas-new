/**
 * Assertions + contrato pipeline: rating de cedidos, severidad, ok con warnings.
 */
jest.mock("../../supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock("../organizerPlayerAccess", () => ({
  resolveJugadorIdForRating: jest.fn(),
}));

jest.mock("../careerIdentity", () => ({
  ensureRivieraIdentity: jest.fn(),
}));

jest.mock("../orphanProfileLink", () => ({
  ensureOfficialProfileLinkForParticipacion: jest.fn(),
  requireOfficialProfileLinkForParticipacion: jest.fn(),
}));

import { supabase } from "../../supabaseClient";
import { resolveJugadorIdForRating } from "../organizerPlayerAccess";
import { ensureRivieraIdentity } from "../careerIdentity";
import { ensureOfficialProfileLinkForParticipacion } from "../orphanProfileLink";
import {
  assertCareerEventIntegrity,
  partitionAssertionFailures,
} from "./assertions";
import { getAssertionSeverity } from "./types";
import { PUNTOS_DUELO_2V2 } from "../rivieraRankingPoints";

const ORG = "org-riviera";
const LOCAL_CEDIDO = "local-iker-clone";
const SOURCE_CEDIDO = "source-iker-hackpadel";
const HOMONYM_LOCAL = "local-other-david";
const HOMONYM_SOURCE = "source-other-david";
const EVENTO = "fb8e9e6b-5150-4c6e-8980-328f7e3e4677";
const PARTIDO_REF = `duelo2v2:${EVENTO}`;
const OTHER_EVENT_REF = "duelo2v2:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("career assertions — duelo multiclub", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (resolveJugadorIdForRating as jest.Mock).mockImplementation(
      async (_org: string, id: string) => {
        if (id === LOCAL_CEDIDO) return SOURCE_CEDIDO;
        if (id === HOMONYM_LOCAL) return HOMONYM_SOURCE;
        return id;
      }
    );
    (ensureRivieraIdentity as jest.Mock).mockResolvedValue({
      officialPlayerKey: "opk-1",
      rivieraId: "RIV-00000118",
      rivieraJugadorId: LOCAL_CEDIDO,
      registrationJugadorId: LOCAL_CEDIDO,
    });
    (ensureOfficialProfileLinkForParticipacion as jest.Mock).mockResolvedValue({
      linked: true,
      confidence: "OK",
      reason: "ok",
      officialPlayerKey: "opk-1",
      rivieraId: "RIV-00000118",
    });
  });

  function mockTables(opts: {
    participaciones: Array<{
      id: string;
      jugador_id: string;
      puntos_obtenidos: number;
      metadata: Record<string, unknown>;
    }>;
    /** Filas de rating indexadas por jugador_id|partido_ref */
    ratingRows?: Record<
      string,
      Array<{
        id: string;
        rating_antes: number;
        rating_despues: number;
        delta: number;
        partido_ref: string;
      }>
    >;
    withStats?: boolean;
    withIdentity?: boolean;
  }) {
    const ratingRows = opts.ratingRows ?? {};
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = jest.fn(self);
      chain.eq = jest.fn(self);
      chain.limit = jest.fn(self);
      chain.in = jest.fn(self);
      chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });

      if (table === "jugador_participaciones") {
        chain.eq = jest.fn().mockImplementation(() => ({
          eq: jest.fn().mockResolvedValue({
            data: opts.participaciones,
            error: null,
          }),
        }));
        return chain;
      }

      if (table === "rating_historial") {
        let jugadorId = "";
        let partidoRef = "";
        chain.eq = jest.fn((col: string, val: string) => {
          if (col === "jugador_id") jugadorId = val;
          if (col === "partido_ref") partidoRef = val;
          return {
            eq: jest.fn((col2: string, val2: string) => {
              if (col2 === "jugador_id") jugadorId = val2;
              if (col2 === "partido_ref") partidoRef = val2;
              return {
                limit: jest.fn().mockResolvedValue({
                  data: ratingRows[`${jugadorId}|${partidoRef}`] ?? [],
                  error: null,
                }),
              };
            }),
            limit: jest.fn().mockResolvedValue({
              data: ratingRows[`${jugadorId}|${partidoRef}`] ?? [],
              error: null,
            }),
          };
        });
        return chain;
      }

      if (table === "jugador_stats") {
        chain.maybeSingle = jest.fn().mockResolvedValue({
          data: opts.withStats === false ? null : { jugador_id: LOCAL_CEDIDO },
          error: null,
        });
        return chain;
      }

      return chain;
    });

    if (opts.withIdentity === false) {
      (ensureRivieraIdentity as jest.Mock).mockResolvedValue(null);
      (ensureOfficialProfileLinkForParticipacion as jest.Mock).mockResolvedValue({
        linked: false,
        confidence: "LOW",
        reason: "no_link",
      });
    }
  }

  const baseParticipacion = {
    id: "p1",
    jugador_id: LOCAL_CEDIDO,
    puntos_obtenidos: PUNTOS_DUELO_2V2.PERDEDOR,
    metadata: {
      organizador_id: ORG,
      club_name: "Riviera Open",
      subtipo: "duelo_2v2_cierre",
      puntos_aplicados: true,
    },
  };

  it("acepta rating solo en el origen resuelto por grant (no en el clon)", async () => {
    mockTables({
      participaciones: [baseParticipacion],
      ratingRows: {
        [`${SOURCE_CEDIDO}|${PARTIDO_REF}`]: [
          {
            id: "rh-1",
            rating_antes: 2.94,
            rating_despues: 2.89,
            delta: -0.05,
            partido_ref: PARTIDO_REF,
          },
        ],
      },
      withStats: true,
    });

    const failures = await assertCareerEventIntegrity({
      context: {
        kind: "duelo_2v2",
        organizadorId: ORG,
        hostOrganizadorId: ORG,
        eventoId: EVENTO,
        tipoEvento: "duelo_2v2",
      },
      touchedJugadorIds: [LOCAL_CEDIDO],
      requireRating: true,
      ratingPartidoRefs: [PARTIDO_REF],
    });

    expect(failures.filter((f) => f.code === "missing_rating")).toHaveLength(0);
    expect(resolveJugadorIdForRating).toHaveBeenCalledWith(ORG, LOCAL_CEDIDO);
  });

  it("no acepta rating solo en el clon si el vínculo resuelve al origen", async () => {
    mockTables({
      participaciones: [baseParticipacion],
      ratingRows: {
        [`${LOCAL_CEDIDO}|${PARTIDO_REF}`]: [
          {
            id: "rh-local-only",
            rating_antes: 2.94,
            rating_despues: 2.89,
            delta: -0.05,
            partido_ref: PARTIDO_REF,
          },
        ],
      },
      withStats: true,
    });

    const failures = await assertCareerEventIntegrity({
      context: {
        kind: "duelo_2v2",
        organizadorId: ORG,
        hostOrganizadorId: ORG,
        eventoId: EVENTO,
        tipoEvento: "duelo_2v2",
      },
      touchedJugadorIds: [LOCAL_CEDIDO],
      requireRating: true,
      ratingPartidoRefs: [PARTIDO_REF],
    });

    expect(failures.some((f) => f.code === "missing_rating")).toBe(true);
  });

  it("no acepta movimiento de otro evento aunque sea el mismo jugador origen", async () => {
    mockTables({
      participaciones: [baseParticipacion],
      ratingRows: {
        [`${SOURCE_CEDIDO}|${OTHER_EVENT_REF}`]: [
          {
            id: "rh-other",
            rating_antes: 3,
            rating_despues: 3.05,
            delta: 0.05,
            partido_ref: OTHER_EVENT_REF,
          },
        ],
      },
      withStats: true,
    });

    const failures = await assertCareerEventIntegrity({
      context: {
        kind: "duelo_2v2",
        organizadorId: ORG,
        hostOrganizadorId: ORG,
        eventoId: EVENTO,
        tipoEvento: "duelo_2v2",
      },
      touchedJugadorIds: [LOCAL_CEDIDO],
      requireRating: true,
      ratingPartidoRefs: [PARTIDO_REF],
    });

    expect(failures.some((f) => f.code === "missing_rating")).toBe(true);
  });

  it("no confunde dos homónimos: rating del otro David no satisface al primero", async () => {
    mockTables({
      participaciones: [baseParticipacion],
      ratingRows: {
        // Solo el homónimo tiene rating del evento; el jugador bajo test no
        [`${HOMONYM_SOURCE}|${PARTIDO_REF}`]: [
          {
            id: "rh-homonym",
            rating_antes: 3,
            rating_despues: 3.05,
            delta: 0.05,
            partido_ref: PARTIDO_REF,
          },
        ],
      },
      withStats: true,
    });

    const failures = await assertCareerEventIntegrity({
      context: {
        kind: "duelo_2v2",
        organizadorId: ORG,
        hostOrganizadorId: ORG,
        eventoId: EVENTO,
        tipoEvento: "duelo_2v2",
      },
      touchedJugadorIds: [LOCAL_CEDIDO],
      requireRating: true,
      ratingPartidoRefs: [PARTIDO_REF],
    });

    expect(failures.some((f) => f.code === "missing_rating")).toBe(true);
    expect(resolveJugadorIdForRating).toHaveBeenCalledWith(ORG, LOCAL_CEDIDO);
    expect(resolveJugadorIdForRating).not.toHaveBeenCalledWith(
      ORG,
      HOMONYM_LOCAL
    );
  });

  it("identidad ausente es critical (no warning)", async () => {
    mockTables({
      participaciones: [baseParticipacion],
      ratingRows: {
        [`${SOURCE_CEDIDO}|${PARTIDO_REF}`]: [
          {
            id: "rh-1",
            rating_antes: 2.94,
            rating_despues: 2.89,
            delta: -0.05,
            partido_ref: PARTIDO_REF,
          },
        ],
      },
      withStats: true,
      withIdentity: false,
    });

    const failures = await assertCareerEventIntegrity({
      context: {
        kind: "duelo_2v2",
        organizadorId: ORG,
        hostOrganizadorId: ORG,
        eventoId: EVENTO,
        tipoEvento: "duelo_2v2",
      },
      touchedJugadorIds: [LOCAL_CEDIDO],
      requireRating: true,
      ratingPartidoRefs: [PARTIDO_REF],
    });

    const identityFailures = failures.filter(
      (f) =>
        f.code === "missing_player_identity" || f.code === "missing_riviera_id"
    );
    expect(identityFailures.length).toBeGreaterThan(0);
    expect(identityFailures.every((f) => f.severity === "critical")).toBe(
      true
    );
    expect(getAssertionSeverity("missing_player_identity")).toBe("critical");
  });

  it("participación ausente es critical", async () => {
    mockTables({
      participaciones: [],
      withStats: true,
    });

    const failures = await assertCareerEventIntegrity({
      context: {
        kind: "duelo_2v2",
        organizadorId: ORG,
        hostOrganizadorId: ORG,
        eventoId: EVENTO,
        tipoEvento: "duelo_2v2",
      },
      touchedJugadorIds: [LOCAL_CEDIDO],
      requireRating: false,
    });

    expect(failures.some((f) => f.code === "missing_historial")).toBe(true);
    expect(
      failures
        .filter((f) => f.code === "missing_historial")
        .every((f) => f.severity === "critical")
    ).toBe(true);
  });

  it("clasifica severidades según invariantes", () => {
    expect(getAssertionSeverity("missing_stats")).toBe("diagnostic");
    expect(getAssertionSeverity("missing_club_name")).toBe("diagnostic");
    expect(getAssertionSeverity("missing_player_identity")).toBe("critical");
    expect(getAssertionSeverity("missing_rating")).toBe("critical");
    expect(getAssertionSeverity("missing_historial")).toBe("critical");
    expect(getAssertionSeverity("duplicate_participacion")).toBe("critical");

    const { criticalFailures, warnings } = partitionAssertionFailures([
      { code: "missing_stats", message: "stats", jugadorId: "a" },
      { code: "missing_historial", message: "hist", jugadorId: "b" },
      { code: "missing_player_identity", message: "id", jugadorId: "c" },
    ]);
    expect(warnings).toHaveLength(1);
    expect(criticalFailures).toHaveLength(2);
  });

  it("regla vigente: ganador 50 / perdedor 20", () => {
    expect(PUNTOS_DUELO_2V2.GANADOR).toBe(50);
    expect(PUNTOS_DUELO_2V2.PERDEDOR).toBe(20);
  });
});
