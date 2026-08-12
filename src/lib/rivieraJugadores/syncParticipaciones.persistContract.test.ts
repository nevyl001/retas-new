/**
 * Regresiones del contrato de persistencia del Career Event Pipeline (reta).
 *
 * Incidente PROD 308a1d5f-1ff8-4311-8b03-4afe57efc0e5:
 * - 12 jugadores (6 parejas), no 13
 * - missing_historial (13) = 1 fallo de evento + 12 de jugador
 * - touched>0 con 0 jugador_participaciones (contrato roto)
 * - 52 rating_historial ya escritos; retry no debe duplicarlos
 */
/* eslint-disable import/first -- jest.mock debe preceder imports */
jest.mock("../supabaseClient", () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

jest.mock("../database", () => ({
  getGames: jest.fn().mockResolvedValue([]),
  getMatches: jest.fn(),
  getPairs: jest.fn(),
  getTournaments: jest.fn(),
  fetchAmericanoLivePublic: jest.fn(),
}));

jest.mock("./participacionExclusions", () => ({
  isParticipacionExcluded: jest.fn().mockResolvedValue(false),
}));

jest.mock("./jugadorIdResolver", () => ({
  resolveJugadorIdForParticipacion: jest.fn(),
  prepareParticipacionIdentityForOrganizer: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("./playerPoolSync", () => ({
  syncLegacyPlayersFromRivieraRegistry: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("./aplicarRatingPartido", () => ({
  aplicarRatingRetaFinishedMatches: jest.fn().mockResolvedValue(0),
  aplicarRatingDuelo2v2: jest.fn(),
  resolveDuelo2v2RatingPlayerIds: jest.fn(),
}));

jest.mock("./rivieraJugadoresService", () => ({
  ensureRivieraJugadorVisibleEnRanking: jest.fn().mockResolvedValue(undefined),
  rebuildJugadorStats: jest.fn().mockResolvedValue(undefined),
  registrarParticipacionConLedger: jest.fn(),
  actualizarParticipacionConLedger: jest.fn(),
  adjustRankingPuntosManual: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("./organizerPlayerAccess", () => ({
  resolveJugadorIdForRating: jest.fn(async (_org, id) => id),
}));

import { supabase } from "../supabaseClient";
import { resolveJugadorIdForParticipacion } from "./jugadorIdResolver";
import { isParticipacionExcluded } from "./participacionExclusions";
import {
  registrarParticipacionConLedger,
  actualizarParticipacionConLedger,
} from "./rivieraJugadoresService";
import { aplicarRatingRetaFinishedMatches } from "./aplicarRatingPartido";
import { syncRetaParticipaciones } from "./syncParticipaciones";
import { assertCareerEventIntegrity } from "./careerEventPipeline/assertions";
import { getAssertionSeverity } from "./careerEventPipeline/types";
import type { Match, Pair, Tournament } from "../db/types";
/* eslint-enable import/first */

const ORG = "2770b522-9064-4c7b-a729-4a0ea7e3f6e8";
const EVENT_ID = "308a1d5f-1ff8-4311-8b03-4afe57efc0e5";

const AUTH_ERR = {
  message: "No autorizado para registrar participación de este jugador",
  code: "P0001",
};

const PLAYER_IDS = [
  "810f9308-fe0a-4c63-b9aa-e44fca6fa243",
  "0b35f0c8-a5cf-4284-aa0b-d9b3e9bef293",
  "9aca13dc-cf90-436f-8c29-8d53b77a64d3",
  "48b527dd-2110-4b81-89db-c0dc5a0fd508",
  "7b431a88-e813-4343-8767-b313740cb830",
  "cc5b80aa-3fa5-443e-9d17-bb1a427970c6",
  "d825ec7e-9859-4b1d-9a68-6e41f27509b5",
  "ab09b92e-4d85-4003-b350-29af9b4ff32c",
  "d330e85c-ec5b-4e09-80e9-6ceb6b3b59b9",
  "da400564-c228-421f-8b0f-e70d03a64ce2",
  "1dcc0417-29c7-4f23-805d-97c7246eb0c8",
  "0dd65a4b-af45-4fd0-b665-157d3c6acbbc",
];

const LEGACY_IDS = PLAYER_IDS.map((_, i) => `legacy-p${i + 1}`);

const mockResolve = resolveJugadorIdForParticipacion as jest.Mock;
const mockRegistrar = registrarParticipacionConLedger as jest.Mock;
const mockActualizar = actualizarParticipacionConLedger as jest.Mock;
const mockRating = aplicarRatingRetaFinishedMatches as jest.Mock;

function buildTournament(): Tournament {
  return {
    id: EVENT_ID,
    name: "Puntos Riviera Open",
    courts: 3,
    is_started: true,
    is_finished: false,
    user_id: ORG,
    created_at: "2026-08-10T18:21:31.773Z",
    updated_at: "2026-08-11T13:28:27.399Z",
    format: "round_robin",
  };
}

function buildPairs(): Pair[] {
  const pairs: Pair[] = [];
  for (let i = 0; i < 6; i++) {
    const a = i * 2;
    const b = a + 1;
    pairs.push({
      id: `pair-${i + 1}`,
      tournament_id: EVENT_ID,
      player1_id: LEGACY_IDS[a],
      player2_id: LEGACY_IDS[b],
      player1_name: `Jugador ${a + 1}`,
      player2_name: `Jugador ${b + 1}`,
      created_at: "2026-08-10T18:21:31.773Z",
    });
  }
  return pairs;
}

/** Un partido terminado no-empate por par de parejas consecutivas. */
function buildFinishedMatches(pairs: Pair[]): Match[] {
  const matches: Match[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const j = (i + 1) % pairs.length;
    matches.push({
      id: `match-${i + 1}`,
      tournament_id: EVENT_ID,
      pair1_id: pairs[i].id,
      pair2_id: pairs[j].id,
      pair1_name: `P${i + 1}`,
      pair2_name: `P${j + 1}`,
      court: 1,
      round: 1,
      status: "finished",
      pair1_score: 6,
      pair2_score: 3,
      created_at: "2026-08-10T19:00:00.000Z",
    });
  }
  return matches;
}

function installSupabaseChain(opts?: {
  existingByJugador?: Map<string, { id: string; metadata: Record<string, unknown> }>;
}) {
  const existingByJugador = opts?.existingByJugador ?? new Map();

  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const state: {
      jugadorId?: string;
      filterSubtipo?: boolean;
    } = {};
    const chain: Record<string, jest.Mock> = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn((col: string, val: string) => {
      if (col === "jugador_id") state.jugadorId = val;
      return chain;
    });
    chain.filter = jest.fn((expr: string) => {
      if (expr.includes("subtipo")) state.filterSubtipo = true;
      return chain;
    });
    chain.in = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.update = jest.fn().mockReturnValue(chain);
    chain.insert = jest.fn().mockReturnValue(chain);
    chain.order = jest.fn().mockReturnValue(chain);
    chain.maybeSingle = jest.fn().mockImplementation(async () => {
      if (table === "riviera_jugadores") {
        return {
          data: {
            id: state.jugadorId ?? "j",
            suma_ranking: true,
            estado: "activo",
            legacy_player_id: null,
            categoria: null,
          },
          error: null,
        };
      }
      if (table === "jugador_participaciones" && state.filterSubtipo && state.jugadorId) {
        const row = existingByJugador.get(state.jugadorId);
        return row
          ? {
              data: {
                id: row.id,
                puntos_obtenidos: 10,
                metadata: row.metadata,
                sets_favor: 0,
                sets_contra: 0,
                resultado: "participación",
                pareja_con: null,
              },
              error: null,
            }
          : { data: null, error: null };
      }
      return { data: null, error: null };
    });
    chain.single = jest.fn().mockResolvedValue({ data: null, error: null });
    return chain;
  });
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });
}

function installResolveByLegacy() {
  mockResolve.mockImplementation(
    async (params: { legacyPlayerId?: string; jugadorId?: string | null }) => {
      if (params.jugadorId) return params.jugadorId;
      const idx = LEGACY_IDS.indexOf(params.legacyPlayerId ?? "");
      return idx >= 0 ? PLAYER_IDS[idx] : null;
    }
  );
}

describe("persist contract — reta close (incidente Puntos Riviera Open)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installSupabaseChain();
    installResolveByLegacy();
    mockRating.mockResolvedValue(13);
    mockRegistrar.mockReset();
    mockActualizar.mockReset();
    (isParticipacionExcluded as jest.Mock).mockResolvedValue(false);
  });

  it("auth reject en registrar → NO touched + syncFailure (no swallow)", async () => {
    mockRegistrar.mockRejectedValue(AUTH_ERR);

    const pairs = buildPairs();
    const result = await syncRetaParticipaciones({
      organizadorId: ORG,
      tournament: buildTournament(),
      pairs,
      matches: buildFinishedMatches(pairs),
    });

    expect(result.touchedJugadorIds).toEqual([]);
    expect(result.syncFailures?.length).toBe(12);
    expect(
      result.syncFailures?.every(
        (f) =>
          f.code === "sync_failed" &&
          String(f.message).includes("No autorizado")
      )
    ).toBe(true);
  });

  it("update de participación existente falla → NO swallow → syncFailure + NO touched", async () => {
    const existingByJugador = new Map(
      PLAYER_IDS.map((id, i) => [
        id,
        {
          id: `part-existing-${i}`,
          metadata: { subtipo: "reta_cierre", organizador_id: ORG },
        },
      ])
    );
    installSupabaseChain({ existingByJugador });
    mockActualizar.mockRejectedValue(new Error("ledger update failed"));

    const pairs = buildPairs();
    const result = await syncRetaParticipaciones({
      organizadorId: ORG,
      tournament: buildTournament(),
      pairs,
      matches: buildFinishedMatches(pairs),
    });

    expect(result.touchedJugadorIds).toEqual([]);
    expect(result.syncFailures?.length).toBe(12);
    expect(mockActualizar).toHaveBeenCalled();
    expect(mockRegistrar).not.toHaveBeenCalled();
  });

  it("12 jugadores / 0 escrituras → touched=0 (nunca touched=12 con 0 rows)", async () => {
    mockRegistrar.mockRejectedValue(AUTH_ERR);

    const pairs = buildPairs();
    expect(pairs).toHaveLength(6);
    const result = await syncRetaParticipaciones({
      organizadorId: ORG,
      tournament: buildTournament(),
      pairs,
      matches: buildFinishedMatches(pairs),
    });

    expect(LEGACY_IDS).toHaveLength(12);
    expect(result.touchedJugadorIds).toHaveLength(0);
    expect(result.syncFailures).toHaveLength(12);
  });

  it("persistencia confirmada → touched solo con participacionId real", async () => {
    mockRegistrar.mockImplementation(async (params: { jugadorId: string }) => {
      const idx = PLAYER_IDS.indexOf(params.jugadorId);
      return `part-${idx}`;
    });

    const pairs = buildPairs();
    const result = await syncRetaParticipaciones({
      organizadorId: ORG,
      tournament: buildTournament(),
      pairs,
      matches: buildFinishedMatches(pairs),
    });

    expect(result.touchedJugadorIds.sort()).toEqual([...PLAYER_IDS].sort());
    expect(result.syncFailures).toBeUndefined();
    expect(mockRegistrar).toHaveBeenCalledTimes(12);
  });

  it("retry idempotente → mismas 12 participaciones, sin duplicar altas", async () => {
    const created = new Map<string, string>();
    mockRegistrar.mockImplementation(async (params: { jugadorId: string }) => {
      const existing = created.get(params.jugadorId);
      if (existing) return existing;
      const id = `part-${params.jugadorId.slice(0, 8)}`;
      created.set(params.jugadorId, id);
      return id;
    });

    const pairs = buildPairs();
    const matches = buildFinishedMatches(pairs);
    const tournament = buildTournament();

    const first = await syncRetaParticipaciones({
      organizadorId: ORG,
      tournament,
      pairs,
      matches,
    });
    // Tras el primer cierre, las filas "existen" → update path.
    const existingByJugador = new Map(
      Array.from(created.entries()).map(([jugadorId, partId]) => [
        jugadorId,
        {
          id: partId,
          metadata: { subtipo: "reta_cierre", organizador_id: ORG },
        },
      ])
    );
    installSupabaseChain({ existingByJugador });
    mockActualizar.mockImplementation(async (params: { participacionId: string }) => {
      return params.participacionId;
    });

    const second = await syncRetaParticipaciones({
      organizadorId: ORG,
      tournament,
      pairs,
      matches,
    });

    expect(first.touchedJugadorIds).toHaveLength(12);
    expect(second.touchedJugadorIds).toHaveLength(12);
    expect(created.size).toBe(12);
    expect(mockActualizar).toHaveBeenCalledTimes(12);
  });

  it("repair: crea solo faltantes (10 existentes + 2 altas)", async () => {
    const existingByJugador = new Map(
      PLAYER_IDS.slice(0, 10).map((id, i) => [
        id,
        {
          id: `part-existing-${i}`,
          metadata: { subtipo: "reta_cierre", organizador_id: ORG },
        },
      ])
    );
    installSupabaseChain({ existingByJugador });
    mockActualizar.mockImplementation(async (p: { participacionId: string }) => p.participacionId);
    mockRegistrar.mockImplementation(async (params: { jugadorId: string }) => {
      return `part-new-${params.jugadorId.slice(0, 8)}`;
    });

    const pairs = buildPairs();
    const result = await syncRetaParticipaciones({
      organizadorId: ORG,
      tournament: { ...buildTournament(), is_finished: true },
      pairs,
      matches: buildFinishedMatches(pairs),
    });

    expect(result.touchedJugadorIds).toHaveLength(12);
    expect(mockActualizar).toHaveBeenCalledTimes(10);
    expect(mockRegistrar).toHaveBeenCalledTimes(2);
  });

  it("multiclub válido (perfil local host-scoped): persiste y entra a touched", async () => {
    // Jugador “de otro club” ya resuelto a perfil local del host.
    const hostLocal = PLAYER_IDS[0];
    mockResolve.mockResolvedValue(hostLocal);
    mockRegistrar.mockResolvedValue("part-multiclub-1");

    const pairs = buildPairs().slice(0, 1);
    const matches: Match[] = [
      {
        id: "m-mc",
        tournament_id: EVENT_ID,
        pair1_id: pairs[0].id,
        pair2_id: pairs[0].id,
        pair1_name: "A",
        pair2_name: "B",
        court: 1,
        status: "finished",
        pair1_score: 6,
        pair2_score: 4,
        created_at: "2026-08-10T19:00:00.000Z",
      },
    ];

    const result = await syncRetaParticipaciones({
      organizadorId: ORG,
      tournament: buildTournament(),
      pairs,
      matches,
    });

    expect(result.touchedJugadorIds).toEqual([hostLocal]);
    expect(result.syncFailures).toBeUndefined();
    expect(mockRegistrar).toHaveBeenCalledWith(
      expect.objectContaining({ jugadorId: hostLocal })
    );
  });

  it("fallo de historial → rating NO se ejecuta", async () => {
    mockRegistrar.mockRejectedValue(AUTH_ERR);

    const pairs = buildPairs();
    await syncRetaParticipaciones({
      organizadorId: ORG,
      tournament: buildTournament(),
      pairs,
      matches: buildFinishedMatches(pairs),
    });

    expect(mockRating).not.toHaveBeenCalled();
  });

  it("incidente real: 0 participaciones + rating ya aplicado → persiste 12 y rating idempotente (sin bloquear retry)", async () => {
    // Estado PROD: 0 participaciones, 52 rating_historial ya existen.
    // Tras el fix: crear 12 participaciones; rating se invoca pero el RPC
    // es no-op idempotente (no duplica).
    mockRegistrar.mockImplementation(async (params: { jugadorId: string }) => {
      const idx = PLAYER_IDS.indexOf(params.jugadorId);
      return `part-incident-${idx}`;
    });
    mockRating.mockResolvedValue(13); // "aplicados" en contador de partidos; RPC no duplica

    const pairs = buildPairs();
    const result = await syncRetaParticipaciones({
      organizadorId: ORG,
      tournament: buildTournament(),
      pairs,
      matches: buildFinishedMatches(pairs),
    });

    expect(result.touchedJugadorIds).toHaveLength(12);
    expect(result.syncFailures).toBeUndefined();
    expect(mockRegistrar).toHaveBeenCalledTimes(12);
    expect(mockRating).toHaveBeenCalledTimes(1);
  });
  it("precomputedExcluded:false (no excluido) escribe; true saltaría la escritura", async () => {
    // Regresión del bug 2026-08-12: pasar true tras “ya verifiqué” interpretaba
    // al jugador como excluido y no llamaba al RPC.
    mockRegistrar.mockResolvedValue("part-ok");
    const pairs = buildPairs().slice(0, 1);
    const matches = [
      {
        id: "m-excl",
        tournament_id: EVENT_ID,
        pair1_id: pairs[0].id,
        pair2_id: pairs[0].id,
        pair1_name: "A",
        pair2_name: "B",
        court: 1,
        status: "finished",
        pair1_score: 6,
        pair2_score: 3,
        created_at: "2026-08-10T19:00:00.000Z",
      },
    ];
    const result = await syncRetaParticipaciones({
      organizadorId: ORG,
      tournament: buildTournament(),
      pairs,
      matches,
    });
    expect(mockRegistrar).toHaveBeenCalled();
    expect(result.touchedJugadorIds.length).toBeGreaterThan(0);
  });
});

describe("missing_historial count — 12 jugadores ≠ 13 criticals", () => {
  it("1 fallo de evento + 12 de jugador = 13 critical, con solo 12 jugadores", async () => {
    expect(getAssertionSeverity("missing_historial")).toBe("critical");

    // loadParticipacionesForEvent vía supabase → vacío
    (supabase.from as jest.Mock).mockImplementation(() => {
      const chain: Record<string, jest.Mock> = {};
      chain.select = jest.fn().mockReturnValue(chain);
      chain.eq = jest.fn().mockReturnValue(chain);
      chain.order = jest.fn().mockResolvedValue({ data: [], error: null });
      return {
        ...chain,
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [], error: null }),
          order: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    });

    const failures = await assertCareerEventIntegrity({
      context: {
        kind: "reta",
        organizadorId: ORG,
        hostOrganizadorId: ORG,
        eventoId: EVENT_ID,
        tipoEvento: "reta",
      },
      touchedJugadorIds: [...PLAYER_IDS],
      requireRating: false,
    });

    const missing = failures.filter((f) => f.code === "missing_historial");
    expect(missing).toHaveLength(13);
    expect(
      missing.filter((f) => f.message.includes("Sin participaciones registradas"))
    ).toHaveLength(1);
    expect(missing.filter((f) => f.jugadorId)).toHaveLength(12);
  });
});
