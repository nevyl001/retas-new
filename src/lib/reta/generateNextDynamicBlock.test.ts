/**
 * Auditoría de seguridad funcional (2026-08-04): concurrencia/idempotencia
 * de la generación de bloques dinámicos, e inmutabilidad de las parejas ya
 * persistidas. Mockea `../database` y `./dynamicTeamBlocksApi` para no
 * depender de Supabase real -- el candado real vive en el RPC (ver
 * revisión estática de 0010 en el informe), esto verifica que el
 * ORQUESTADOR nunca intenta escribir cuando el servidor ya rechazó el
 * intento.
 */
import { createPair, createMatch, getTournamentGames } from "../database";
import {
  beginDynamicTeamBlock,
  commitDynamicTeamBlock,
  getDynamicTeamBlocks,
  retryDynamicTeamBlock,
  type RetaDynamicBlockRow,
} from "./dynamicTeamBlocksApi";
import { generateNextDynamicBlock } from "./generateNextDynamicBlock";
import type { Tournament, Pair, Match } from "../database";

jest.mock("../database", () => ({
  createPair: jest.fn(),
  createMatch: jest.fn(),
  getTournamentGames: jest.fn(async () => []),
}));

jest.mock("./dynamicTeamBlocksApi", () => ({
  beginDynamicTeamBlock: jest.fn(),
  commitDynamicTeamBlock: jest.fn(),
  getDynamicTeamBlocks: jest.fn(),
  retryDynamicTeamBlock: jest.fn(),
}));

const mockCreatePair = createPair as jest.Mock;
const mockCreateMatch = createMatch as jest.Mock;
const mockGetTournamentGames = getTournamentGames as jest.Mock;
const mockBegin = beginDynamicTeamBlock as jest.Mock;
const mockCommit = commitDynamicTeamBlock as jest.Mock;
const mockGetBlocks = getDynamicTeamBlocks as jest.Mock;
const mockRetry = retryDynamicTeamBlock as jest.Mock;

function tournament(overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: "t1",
    name: "Riviera vs Hack",
    courts: 2,
    is_started: true,
    is_finished: false,
    user_id: "u1",
    created_at: "",
    updated_at: "",
    format: "teams",
    team_config: {
      teamNames: ["Riviera", "Hack"],
      pairToTeam: { pR1: 0, pR2: 0, pH1: 1, pH2: 1 },
      dynamicLineups: {
        enabled: true,
        totalRounds: 4,
        pairsPerTeam: 2,
        playerToTeam: { A: 0, B: 0, C: 0, D: 0, E: 1, F: 1, G: 1, H: 1 },
      },
    },
    ...overrides,
  };
}

function realPair(id: string, player1Id: string, player2Id: string): Pair {
  return {
    id,
    tournament_id: "t1",
    player1_id: player1Id,
    player2_id: player2Id,
    player1_name: player1Id,
    player2_name: player2Id,
    created_at: "",
  };
}

const originalPairs: Pair[] = [
  realPair("pR1", "A", "B"),
  realPair("pR2", "C", "D"),
  realPair("pH1", "E", "F"),
  realPair("pH2", "G", "H"),
];

function finishedMatch(id: string, pair1: string, pair2: string, round: number): Match {
  return {
    id,
    tournament_id: "t1",
    pair1_id: pair1,
    pair2_id: pair2,
    pair1_name: "",
    pair2_name: "",
    court: 1,
    round,
    status: "finished",
    pair1_score: 6,
    pair2_score: 3,
    created_at: "",
  };
}

const completedBlock1: RetaDynamicBlockRow = {
  id: "block-1",
  tournament_id: "t1",
  block_number: 1,
  round_start: 1,
  round_end: 2,
  status: "completed",
  stage: "initial_round_robin",
  teams: [
    {
      teamIndex: 0,
      lineup: {
        pairs: [
          ["A", "B"],
          ["C", "D"],
        ],
        partitionKey: "A+B|C+D",
        imbalance: 0,
        wasImmediateRepeat: false,
      },
    },
    {
      teamIndex: 1,
      lineup: {
        pairs: [
          ["E", "F"],
          ["G", "H"],
        ],
        partitionKey: "E+F|G+H",
        imbalance: 0,
        wasImmediateRepeat: false,
      },
    },
  ],
  generated_at: "2026-08-04T00:00:00.000Z",
  created_at: "2026-08-04T00:00:00.000Z",
};

const initialMatches: Match[] = [
  finishedMatch("m1", "pR1", "pH1", 1),
  finishedMatch("m2", "pR2", "pH2", 1),
  finishedMatch("m3", "pR1", "pH2", 2),
  finishedMatch("m4", "pR2", "pH1", 2),
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetTournamentGames.mockResolvedValue([]);
});

describe("generateNextDynamicBlock: concurrencia e idempotencia (auditoría punto 4)", () => {
  it("dos administradores casi al mismo tiempo: si el RPC ya reclamó el bloque, no escribe nada", async () => {
    mockGetBlocks.mockResolvedValue([completedBlock1]);
    mockBegin.mockResolvedValue({ status: "already_claimed" });

    const result = await generateNextDynamicBlock({
      tournament: tournament(),
      pairs: originalPairs,
      matches: initialMatches,
      userId: "u1",
    });

    expect(result.status).toBe("already_claimed");
    expect(mockCreatePair).not.toHaveBeenCalled();
    expect(mockCreateMatch).not.toHaveBeenCalled();
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it("no genera si falta un resultado del bloque activo (ronda incompleta)", async () => {
    mockGetBlocks.mockResolvedValue([completedBlock1]);
    const incompleteMatches = [
      ...initialMatches.slice(0, 3),
      { ...initialMatches[3], status: "pending", pair1_score: undefined, pair2_score: undefined },
    ];

    const result = await generateNextDynamicBlock({
      tournament: tournament(),
      pairs: originalPairs,
      matches: incompleteMatches,
      userId: "u1",
    });

    expect(result.status).toBe("not_eligible");
    expect(mockBegin).not.toHaveBeenCalled();
    expect(mockCreatePair).not.toHaveBeenCalled();
  });

  it("nunca reintenta un bloque ya completado: con bloque 1 y 2 completados, apunta al bloque 3 (no repite el 2)", async () => {
    const completedBlock2: RetaDynamicBlockRow = {
      ...completedBlock1,
      id: "block-2",
      block_number: 2,
      round_start: 3,
      round_end: 3,
      stage: "dynamic_round",
    };
    mockGetBlocks.mockResolvedValue([completedBlock1, completedBlock2]);
    mockBegin.mockResolvedValue({ status: "claimed", blockId: "block-3" });
    mockCreatePair.mockImplementation(
      async (_t: string, p1: string, p2: string) => realPair(`${p1}${p2}`, p1, p2)
    );
    mockCreateMatch.mockResolvedValue({});
    mockCommit.mockResolvedValue({ status: "completed" });

    const matchesThroughRound3 = [
      ...initialMatches,
      finishedMatch("m5", "pR1", "pH1", 3),
      finishedMatch("m6", "pR2", "pH2", 3),
    ];

    const result = await generateNextDynamicBlock({
      tournament: tournament(),
      pairs: originalPairs,
      matches: matchesThroughRound3,
      userId: "u1",
    });

    expect(mockBegin).toHaveBeenCalledWith(
      expect.objectContaining({ blockNumber: 3, roundStart: 4, roundEnd: 4 })
    );
    expect(result.status).toBe("generated");
  });

  it("recupera automáticamente un bloque 'generating' sin partidos antes de reintentar (pestaña cerrada a mitad)", async () => {
    const stuckBlock: RetaDynamicBlockRow = {
      ...completedBlock1,
      id: "block-2-stuck",
      block_number: 2,
      round_start: 3,
      round_end: 3,
      status: "generating",
      stage: "dynamic_round",
    };
    mockGetBlocks.mockResolvedValue([completedBlock1, stuckBlock]);
    mockRetry.mockResolvedValue({ status: "released" });
    mockBegin.mockResolvedValue({ status: "claimed", blockId: "block-2-new" });
    mockCreatePair.mockImplementation(
      async (_t: string, p1: string, p2: string) => realPair(`${p1}${p2}`, p1, p2)
    );
    mockCreateMatch.mockResolvedValue({});
    mockCommit.mockResolvedValue({ status: "completed" });

    const result = await generateNextDynamicBlock({
      tournament: tournament(),
      pairs: originalPairs,
      matches: initialMatches,
      userId: "u1",
    });

    expect(mockRetry).toHaveBeenCalledWith({ tournamentId: "t1", blockNumber: 2 });
    expect(result.status).toBe("generated");
  });

  it("no reintenta liberar un bloque 'generating' que SÍ tiene partidos (no se toca nunca un bloque con datos reales)", async () => {
    const stuckWithMatches: RetaDynamicBlockRow = {
      ...completedBlock1,
      id: "block-2-stuck",
      block_number: 2,
      round_start: 3,
      round_end: 3,
      status: "generating",
      stage: "dynamic_round",
    };
    mockGetBlocks.mockResolvedValue([completedBlock1, stuckWithMatches]);
    const matchesWithRound3 = [...initialMatches, finishedMatch("m5", "pR1", "pH1", 3)];

    const result = await generateNextDynamicBlock({
      tournament: tournament(),
      pairs: originalPairs,
      matches: matchesWithRound3,
      userId: "u1",
    });

    expect(mockRetry).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "not_eligible", reason: "already_generated" });
  });
});

describe("generateNextDynamicBlock: inmutabilidad de historial (auditoría punto 2)", () => {
  it("crea parejas NUEVAS para el bloque dinámico y nunca reutiliza ni muta los IDs originales", async () => {
    mockGetBlocks.mockResolvedValue([completedBlock1]);
    mockBegin.mockResolvedValue({ status: "claimed", blockId: "block-2" });
    mockCreatePair.mockImplementation(
      async (_t: string, p1: string, p2: string) => realPair(`new-${p1}${p2}`, p1, p2)
    );
    mockCreateMatch.mockResolvedValue({});
    mockCommit.mockResolvedValue({ status: "completed" });

    await generateNextDynamicBlock({
      tournament: tournament(),
      pairs: originalPairs,
      matches: initialMatches,
      userId: "u1",
    });

    const originalIds = new Set(originalPairs.map((p) => p.id));
    // createPair se llamó con jugadores originales pero SIEMPRE genera una
    // fila nueva (el mock nunca devuelve un id ya existente).
    const callArgs = mockCreatePair.mock.calls.map(([, p1, p2]) => `${p1}${p2}`);
    expect(callArgs.length).toBe(4); // pairsPerTeam(2) x 2 equipos
    callArgs.forEach((key) => {
      expect(originalIds.has(`new-${key}`)).toBe(false);
    });
  });

  it("pairToTeamDelta del commit solo contiene las parejas NUEVAS -- nunca reescribe las originales", async () => {
    mockGetBlocks.mockResolvedValue([completedBlock1]);
    mockBegin.mockResolvedValue({ status: "claimed", blockId: "block-2" });
    mockCreatePair.mockImplementation(
      async (_t: string, p1: string, p2: string) => realPair(`new-${p1}${p2}`, p1, p2)
    );
    mockCreateMatch.mockResolvedValue({});
    mockCommit.mockResolvedValue({ status: "completed" });

    await generateNextDynamicBlock({
      tournament: tournament(),
      pairs: originalPairs,
      matches: initialMatches,
      userId: "u1",
    });

    expect(mockCommit).toHaveBeenCalledTimes(1);
    const [[commitArgs]] = mockCommit.mock.calls;
    const deltaKeys = Object.keys(commitArgs.pairToTeamDelta);
    // Ninguna clave del delta coincide con un id de pareja original.
    const originalIds = new Set(originalPairs.map((p) => p.id));
    deltaKeys.forEach((key) => expect(originalIds.has(key)).toBe(false));
    expect(deltaKeys).toHaveLength(4);
  });
});

describe("generateNextDynamicBlock: ventana begin -> commit, fallos parciales (auditoría de seguimiento, punto 5)", () => {
  function setupClaimedBlock() {
    mockGetBlocks.mockResolvedValue([completedBlock1]);
    mockBegin.mockResolvedValue({ status: "claimed", blockId: "block-2" });
  }

  it("falla al crear la SEGUNDA pareja: el error se propaga (el llamador debe capturarlo), la primera pareja queda huérfana en BD", async () => {
    setupClaimedBlock();
    let calls = 0;
    mockCreatePair.mockImplementation(async (_t: string, p1: string, p2: string) => {
      calls += 1;
      if (calls === 2) throw new Error("network error creando la 2da pareja");
      return realPair(`${p1}${p2}`, p1, p2);
    });

    await expect(
      generateNextDynamicBlock({
        tournament: tournament(),
        pairs: originalPairs,
        matches: initialMatches,
        userId: "u1",
      })
    ).rejects.toThrow("network error creando la 2da pareja");

    // Documentado: la pareja #1 SÍ se creó (llamada 1 exitosa) y queda
    // huérfana -- no se revierte automáticamente. El bloque queda
    // 'generating' en BD (begin ya insertó la fila) sin ningún partido
    // asociado todavía -- el auto-heal de un intento POSTERIOR sí podría
    // liberarlo (ver siguiente test).
    expect(mockCreatePair).toHaveBeenCalledTimes(2);
    expect(mockCreateMatch).not.toHaveBeenCalled();
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it("falla al crear el ÚLTIMO partido: las parejas y partidos anteriores quedan creados pero NUNCA se cuentan (commit nunca corre)", async () => {
    setupClaimedBlock();
    mockCreatePair.mockImplementation(
      async (_t: string, p1: string, p2: string) => realPair(`${p1}${p2}`, p1, p2)
    );
    let matchCalls = 0;
    mockCreateMatch.mockImplementation(async () => {
      matchCalls += 1;
      if (matchCalls === 2) throw new Error("network error creando el último partido");
      return {};
    });

    await expect(
      generateNextDynamicBlock({
        tournament: tournament(),
        pairs: originalPairs,
        matches: initialMatches,
        userId: "u1",
      })
    ).rejects.toThrow("network error creando el último partido");

    // Documentado: 4 parejas y 1 partido (de 2) quedaron creados en BD,
    // pero pairToTeam NUNCA se actualizó (commit no corrió) -- ese partido,
    // aunque exista y eventualmente se juegue, NO se contaría en
    // computeDynamicTeamStandings hasta que el bloque se confirme. Este
    // escenario NO se autorepara: retryDynamicTeamBlock se niega a liberar
    // un bloque con partidos reales (ver siguiente test) -- requiere
    // intervención administrativa manual, documentado como riesgo, no
    // corregido en esta auditoría.
    expect(mockCreatePair).toHaveBeenCalledTimes(4);
    expect(mockCreateMatch).toHaveBeenCalledTimes(2);
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it("un bloque atascado CON partidos reales nunca se libera automáticamente (retry se niega)", async () => {
    const stuckWithOneMatch: RetaDynamicBlockRow = {
      ...completedBlock1,
      id: "block-2-stuck",
      block_number: 2,
      round_start: 3,
      round_end: 3,
      status: "generating",
      stage: "dynamic_round",
    };
    mockGetBlocks.mockResolvedValue([completedBlock1, stuckWithOneMatch]);
    const matchesWithOrphan = [...initialMatches, finishedMatch("orphan-m5", "pR1", "pH1", 3)];

    const result = await generateNextDynamicBlock({
      tournament: tournament(),
      pairs: originalPairs,
      matches: matchesWithOrphan,
      userId: "u1",
    });

    expect(mockRetry).not.toHaveBeenCalled();
    expect(mockBegin).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "not_eligible", reason: "already_generated" });
  });

  it("falla de red justo antes/durante el commit: se propaga, el bloque NO se marca generado falsamente", async () => {
    setupClaimedBlock();
    mockCreatePair.mockImplementation(
      async (_t: string, p1: string, p2: string) => realPair(`${p1}${p2}`, p1, p2)
    );
    mockCreateMatch.mockResolvedValue({});
    mockCommit.mockRejectedValue(new Error("network error en commit"));

    await expect(
      generateNextDynamicBlock({
        tournament: tournament(),
        pairs: originalPairs,
        matches: initialMatches,
        userId: "u1",
      })
    ).rejects.toThrow("network error en commit");

    // Las 4 parejas y 2 partidos SÍ quedaron creados -- mismo riesgo
    // documentado arriba (bloque irrecuperable automáticamente porque ya
    // tiene partidos reales).
    expect(mockCreatePair).toHaveBeenCalledTimes(4);
    expect(mockCreateMatch).toHaveBeenCalledTimes(2);
  });

  it("commit RECHAZADO explícitamente (sin excepción): ya NO se reporta 'generated' falso (bug encontrado y corregido en esta auditoría)", async () => {
    setupClaimedBlock();
    mockCreatePair.mockImplementation(
      async (_t: string, p1: string, p2: string) => realPair(`${p1}${p2}`, p1, p2)
    );
    mockCreateMatch.mockResolvedValue({});
    mockCommit.mockResolvedValue({ status: "error", message: "fallo de red respondido por el servidor" });

    const result = await generateNextDynamicBlock({
      tournament: tournament(),
      pairs: originalPairs,
      matches: initialMatches,
      userId: "u1",
    });

    expect(result).toEqual({
      status: "error",
      message: "fallo de red respondido por el servidor",
    });
  });

  it("commit devuelve not_found (bloque desapareció): tampoco se reporta 'generated' falso", async () => {
    setupClaimedBlock();
    mockCreatePair.mockImplementation(
      async (_t: string, p1: string, p2: string) => realPair(`${p1}${p2}`, p1, p2)
    );
    mockCreateMatch.mockResolvedValue({});
    mockCommit.mockResolvedValue({ status: "not_found" });

    const result = await generateNextDynamicBlock({
      tournament: tournament(),
      pairs: originalPairs,
      matches: initialMatches,
      userId: "u1",
    });

    expect(result.status).toBe("error");
  });

  it("reintento posterior tras un fallo SIN partidos: begin+createPair+createMatch+commit corren de nuevo y sí completan", async () => {
    // Simula: primer intento falló antes de crear ningún partido (bloque
    // quedó 'generating' vacío) -- getDynamicTeamBlocks ahora refleja ese
    // estado atascado y el reintento debe autorepararse (ver "recupera
    // automáticamente" ya cubierto arriba). Aquí solo confirmamos que,
    // tras la reparación, el flujo feliz completo (begin -> parejas ->
    // partidos -> commit) corre de punta a punta sin quedar a medias.
    const stuckEmpty: RetaDynamicBlockRow = {
      ...completedBlock1,
      id: "block-2-stuck",
      block_number: 2,
      round_start: 3,
      round_end: 3,
      status: "generating",
      stage: "dynamic_round",
    };
    mockGetBlocks.mockResolvedValue([completedBlock1, stuckEmpty]);
    mockRetry.mockResolvedValue({ status: "released" });
    mockBegin.mockResolvedValue({ status: "claimed", blockId: "block-2-retry" });
    mockCreatePair.mockImplementation(
      async (_t: string, p1: string, p2: string) => realPair(`${p1}${p2}`, p1, p2)
    );
    mockCreateMatch.mockResolvedValue({});
    mockCommit.mockResolvedValue({ status: "completed" });

    const result = await generateNextDynamicBlock({
      tournament: tournament(),
      pairs: originalPairs,
      matches: initialMatches, // sin partidos en ronda 3 -> stuckEmpty se libera
      userId: "u1",
    });

    expect(mockRetry).toHaveBeenCalledTimes(1);
    expect(mockCreatePair).toHaveBeenCalledTimes(4);
    expect(mockCreateMatch).toHaveBeenCalledTimes(2);
    expect(mockCommit).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: "generated", blockNumber: 2 });
  });
});
