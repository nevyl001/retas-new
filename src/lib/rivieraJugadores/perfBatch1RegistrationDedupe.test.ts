/**
 * Perf batch-1 (2026-08-08) — medición BEFORE/AFTER de la deduplicación de
 * isParticipacionExcluded / readJugadorSumaRankingState dentro de UNA sola
 * cadena registrarPuntosRanking → upsertParticipacionRanking → safeRegistrar
 * (el camino con subtipo, el más profundo: duelo_2v2, torneo_express,
 * liga_podio, americano-con-subtipo lo usan).
 *
 * Se ejercita la función real y exportada syncDuelo2v2Participaciones (no
 * se reimplementa lógica) para un duelo 2v2 completo (4 jugadores). Se
 * mockea `isParticipacionExcluded` (boundary real de módulo) para contar
 * invocaciones, y se intercepta `supabase.from` para contar
 * específicamente los SELECT de riviera_jugadores con la proyección
 * "suma_ranking, estado" (la que arma readJugadorSumaRankingState) --
 * ambos confirmados por revisión de código como redundantes ANTES de este
 * batch (llamados una vez en registrarPuntosRanking/upsertParticipacionRanking
 * y otra vez dentro de safeRegistrar para el MISMO jugador/evento).
 */
/* eslint-disable import/first -- jest.mock debe preceder los imports que mockea */
jest.mock("../supabaseClient", () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

jest.mock("./participacionExclusions", () => ({
  isParticipacionExcluded: jest.fn(),
}));

jest.mock("./jugadorIdResolver", () => ({
  resolveJugadorIdForParticipacion: jest.fn(),
}));

jest.mock("./organizerPlayerAccess", () => ({
  resolveJugadorIdForRating: jest.fn(async (_org: string, id: string) => id),
}));

// No es parte de lo medido aquí (isParticipacionExcluded/rankingState) --
// se mockea para aislar la medición de detalles de implementación no
// relacionados (evita acoplar este test a la forma exacta de la query de
// ensureRivieraJugadorVisibleEnRanking / la escritura del ledger).
jest.mock("./rivieraJugadoresService", () => ({
  ensureRivieraJugadorVisibleEnRanking: jest.fn().mockResolvedValue(undefined),
  rebuildJugadorStats: jest.fn().mockResolvedValue(undefined),
  registrarParticipacionConLedger: jest.fn().mockResolvedValue("part-1"),
  actualizarParticipacionConLedger: jest.fn().mockResolvedValue("part-1"),
  adjustRankingPuntosManual: jest.fn().mockResolvedValue(undefined),
}));

import { supabase } from "../supabaseClient";
import { isParticipacionExcluded } from "./participacionExclusions";
import { resolveJugadorIdForParticipacion } from "./jugadorIdResolver";
import {
  registrarParticipacionConLedger,
  actualizarParticipacionConLedger,
} from "./rivieraJugadoresService";
import { syncDuelo2v2Participaciones } from "./syncParticipaciones";
import type { Duelo2v2 } from "../duelo2v2/types";
/* eslint-enable import/first */

const mockExcluded = isParticipacionExcluded as jest.Mock;
const mockResolve = resolveJugadorIdForParticipacion as jest.Mock;
const mockRegistrar = registrarParticipacionConLedger as jest.Mock;
const mockActualizar = actualizarParticipacionConLedger as jest.Mock;

const ORG = "org-perf-2";

function buildDuelo(): Duelo2v2 {
  return {
    id: "duelo-perf-1",
    organizador_id: ORG,
    nombre: "Duelo perf",
    estado: "finalizado",
    ganador: "a",
    pareja_a_j1_id: "j1",
    pareja_a_j1_nombre: "Jugador 1",
    pareja_a_j2_id: "j2",
    pareja_a_j2_nombre: "Jugador 2",
    pareja_b_j1_id: "j3",
    pareja_b_j1_nombre: "Jugador 3",
    pareja_b_j2_id: "j4",
    pareja_b_j2_nombre: "Jugador 4",
    sets_pareja_a: 2,
    sets_pareja_b: 0,
  } as unknown as Duelo2v2;
}

function installLeafMocks(rankingStateCalls: { count: number }) {
  mockExcluded.mockResolvedValue(false);
  mockResolve.mockImplementation(async (params: { jugadorId?: string | null }) =>
    params.jugadorId ?? null
  );
  mockRegistrar.mockResolvedValue("part-1");
  mockActualizar.mockResolvedValue("part-1");

  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const chain: Record<string, jest.Mock> = {};
    chain.select = jest.fn((cols?: string) => {
      if (table === "riviera_jugadores" && cols === "suma_ranking, estado") {
        rankingStateCalls.count += 1;
      }
      return chain;
    });
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.filter = jest.fn().mockReturnValue(chain);
    chain.in = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    chain.update = jest.fn().mockReturnValue(chain);
    chain.insert = jest.fn().mockReturnValue(chain);
    chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    chain.single = jest.fn().mockResolvedValue({ data: null, error: null });
    return chain;
  });
  (supabase.rpc as jest.Mock).mockImplementation((name: string) => {
    if (name === "registrar_participacion_jugador_con_ledger") {
      return Promise.resolve({ data: { id: "part-1" }, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
}

describe("Perf batch-1 — dedupe de isParticipacionExcluded/readJugadorSumaRankingState (Duelo 2v2, 4 jugadores)", () => {
  it("isParticipacionExcluded: antes 3x por jugador (registrar+upsert+safeRegistrar), ahora 1x", async () => {
    const rankingStateCalls = { count: 0 };
    installLeafMocks(rankingStateCalls);

    const result = await syncDuelo2v2Participaciones({
      organizadorId: ORG,
      duelo: buildDuelo(),
    });

    expect(result.touchedJugadorIds).toHaveLength(4);

    // Perf batch-1: 1 sola verificación de exclusión por jugador (se
    // reenvía precomputedExcluded=false a upsertParticipacionRanking/
    // safeRegistrar). Antes de este batch eran 3 llamadas por jugador
    // (registrarPuntosRanking + upsertParticipacionRanking + safeRegistrar
    // anidado, ver diff de syncParticipaciones.ts).
    expect(mockExcluded).toHaveBeenCalledTimes(4);

    // Perf batch-1: 1 sola lectura de suma_ranking/estado por jugador
    // (antes: 2 -- una en upsertParticipacionRanking, otra en el
    // safeRegistrar anidado que dispara al no existir la fila todavía).
    expect(rankingStateCalls.count).toBe(4);

    // eslint-disable-next-line no-console
    console.log(
      `[perf-batch-1][dedupe] jugadores=4 isParticipacionExcluded calls=${mockExcluded.mock.calls.length} ` +
        `readJugadorSumaRankingState calls=${rankingStateCalls.count} ` +
        `(antes del batch: ${4 * 3} y ${4 * 2} respectivamente)`
    );
  });
});
