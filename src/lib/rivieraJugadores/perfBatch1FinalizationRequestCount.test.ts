/**
 * Perf batch-1 (2026-08-08) — medición BEFORE/AFTER de round-trips reales.
 *
 * No reimplementa la lógica de negocio: llama a las MISMAS funciones que
 * corren en producción durante el cierre de una Reta
 * (resolveJugadorForEventSync, aplicarRatingDesdePairs,
 * createCloseIdentityCache) para un round robin sintético de 24 jugadores /
 * 30 partidos (2 grupos de 6 parejas, todos-contra-todos por grupo — mismo
 * tamaño que un evento grande real). Solo se mockea el límite de red
 * (resolveJugadorIdForParticipacion, resolveJugadorIdForRating,
 * ensureRivieraIdentity, ensureOfficialProfileLinkForParticipacion,
 * listRevokedGrantLocalJugadorIds, supabase.from/rpc) para poder CONTAR
 * invocaciones sin pegarle a una base de datos real.
 *
 * "BEFORE" = mismas funciones sin identityCache (comportamiento pre
 * batch-1 para el paso de rating, que nunca recibía caché). "AFTER" = con
 * identityCache compartido entre sync de participación y rating (cambio de
 * este batch). El resultado esperado: el número de resoluciones de
 * identidad "de red" (resolveJugadorIdForParticipacion) baja de
 * O(jugadores + 4×partidos) a O(jugadores) -- una por jugador distinto,
 * sin importar cuántos partidos juegue.
 */
/* eslint-disable import/first -- jest.mock debe preceder los imports que mockea */
jest.mock("../supabaseClient", () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

jest.mock("./jugadorIdResolver", () => ({
  resolveJugadorIdForParticipacion: jest.fn(),
}));

jest.mock("./organizerPlayerAccess", () => ({
  resolveJugadorIdForRating: jest.fn(),
  listRevokedGrantLocalJugadorIds: jest.fn(),
}));

jest.mock("./careerIdentity", () => ({
  ensureRivieraIdentity: jest.fn(),
}));

jest.mock("./orphanProfileLink", () => ({
  ensureOfficialProfileLinkForParticipacion: jest.fn(),
}));

import { supabase } from "../supabaseClient";
import { resolveJugadorIdForParticipacion } from "./jugadorIdResolver";
import {
  resolveJugadorIdForRating,
  listRevokedGrantLocalJugadorIds,
} from "./organizerPlayerAccess";
import { ensureRivieraIdentity } from "./careerIdentity";
import { ensureOfficialProfileLinkForParticipacion } from "./orphanProfileLink";
import { resolveJugadorForEventSync } from "./careerEventPipeline/careerEventPlayerSync";
import { aplicarRatingDesdePairs } from "./aplicarRatingPartido";
import { createCloseIdentityCache } from "./careerEventPipeline/closeIdentityCache";
/* eslint-enable import/first */

const mockResolve = resolveJugadorIdForParticipacion as jest.Mock;
const mockResolveForRating = resolveJugadorIdForRating as jest.Mock;
const mockListRevoked = listRevokedGrantLocalJugadorIds as jest.Mock;
const mockEnsureIdentity = ensureRivieraIdentity as jest.Mock;
const mockEnsureLink = ensureOfficialProfileLinkForParticipacion as jest.Mock;

const ORG = "org-perf-1";

type SyntheticPlayer = { legacyPlayerId: string; nombre: string };
type SyntheticPair = {
  player1_id: string;
  player2_id: string;
  player1_name: string;
  player2_name: string;
};

/** 1 grupo de `pairCount` parejas jugando todos-contra-todos (round robin). */
function buildGroup(
  groupLabel: string,
  pairCount: number
): { players: SyntheticPlayer[]; pairs: SyntheticPair[]; matches: [SyntheticPair, SyntheticPair][] } {
  const players: SyntheticPlayer[] = [];
  const pairs: SyntheticPair[] = [];

  for (let i = 0; i < pairCount; i++) {
    const p1 = `${groupLabel}-p${i}-a`;
    const p2 = `${groupLabel}-p${i}-b`;
    players.push({ legacyPlayerId: p1, nombre: `Jugador ${p1}` });
    players.push({ legacyPlayerId: p2, nombre: `Jugador ${p2}` });
    pairs.push({
      player1_id: p1,
      player2_id: p2,
      player1_name: `Jugador ${p1}`,
      player2_name: `Jugador ${p2}`,
    });
  }

  const matches: [SyntheticPair, SyntheticPair][] = [];
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      matches.push([pairs[i], pairs[j]]);
    }
  }

  return { players, pairs, matches };
}

/** 2 grupos de 6 parejas (24 jugadores) round robin por grupo -> 15 partidos c/u = 30 total. */
function buildTwoGroupReta() {
  const g1 = buildGroup("g1", 6);
  const g2 = buildGroup("g2", 6);
  return {
    players: [...g1.players, ...g2.players],
    matches: [...g1.matches, ...g2.matches],
  };
}

function installLeafMocks() {
  mockResolve.mockImplementation(
    async (params: { legacyPlayerId?: string }) =>
      params.legacyPlayerId ? `jugador-${params.legacyPlayerId}` : null
  );
  mockResolveForRating.mockImplementation(
    async (_org: string, jugadorId: string) => jugadorId
  );
  mockListRevoked.mockResolvedValue(new Set<string>());
  mockEnsureIdentity.mockResolvedValue({ officialPlayerKey: "opk" });
  mockEnsureLink.mockResolvedValue({ linked: true, confidence: "OK" });

  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  };
  (supabase.from as jest.Mock).mockReturnValue(chain);
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });
}

/** Simula el cierre real: sync de participación (1x por jugador) + rating (1x por partido). */
async function runSyntheticRetaClose(
  players: SyntheticPlayer[],
  matches: [SyntheticPair, SyntheticPair][],
  useIdentityCache: boolean
) {
  const identityCache = useIdentityCache
    ? createCloseIdentityCache(ORG)
    : undefined;

  // Fase 1: sync de participación -- ya resolvía 1x por jugador distinto
  // ANTES de este batch (repairRetaPairLegacyIds.ts), sin cambios aquí.
  for (const player of players) {
    await resolveJugadorForEventSync(
      {
        organizadorId: ORG,
        legacyPlayerId: player.legacyPlayerId,
        nombre: player.nombre,
        tipoEvento: "reta",
        eventoId: "reta-perf-1",
      },
      undefined,
      identityCache
    );
  }

  // Fase 2: rating -- ANTES de este batch, aplicarRatingDesdePairs nunca
  // recibía identityCache (línea `aplicarRatingRetaFinishedMatches` no
  // aceptaba el parámetro). Perf batch-1 lo conecta al mismo caché.
  for (const [pairA, pairB] of matches) {
    await aplicarRatingDesdePairs(ORG, pairA, pairB, "a", {
      modoJuego: "reta_rr",
      partidoRef: `reta:${pairA.player1_id}-${pairB.player1_id}`,
      identityCache,
    });
  }
}

describe("Perf batch-1 — round-trips de resolución de identidad (Reta, 24 jugadores / 30 partidos)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installLeafMocks();
  });

  it("BEFORE (sin identityCache en rating): resolución crece con partidos, no solo con jugadores", async () => {
    const { players, matches } = buildTwoGroupReta();
    expect(players.length).toBeGreaterThanOrEqual(20);
    expect(matches.length).toBeGreaterThanOrEqual(15);

    await runSyntheticRetaClose(players, matches, false);

    // Fase 1: 1 resolución por jugador (24). Fase 2: 4 resoluciones por
    // partido (2 pares × 2 jugadores), sin caché, para los 30 partidos.
    const expectedBefore = players.length + matches.length * 4;
    expect(mockResolve).toHaveBeenCalledTimes(expectedBefore);

    // eslint-disable-next-line no-console
    console.log(
      `[perf-batch-1][BEFORE] jugadores=${players.length} partidos=${matches.length} ` +
        `resolveJugadorIdForParticipacion calls=${mockResolve.mock.calls.length}`
    );
  });

  it("AFTER (con identityCache compartido): resolución = 1 por jugador distinto, independiente de partidos", async () => {
    const { players, matches } = buildTwoGroupReta();

    await runSyntheticRetaClose(players, matches, true);

    // Con caché, rating reutiliza exactamente los mismos resultados que ya
    // resolvió el sync de participación -- 0 llamadas nuevas en fase 2.
    expect(mockResolve).toHaveBeenCalledTimes(players.length);

    // eslint-disable-next-line no-console
    console.log(
      `[perf-batch-1][AFTER] jugadores=${players.length} partidos=${matches.length} ` +
        `resolveJugadorIdForParticipacion calls=${mockResolve.mock.calls.length}`
    );
  });

  it("mejora medible: AFTER reduce las llamadas de resolución en un factor representativo", async () => {
    const scenario = buildTwoGroupReta();

    await runSyntheticRetaClose(scenario.players, scenario.matches, false);
    const before = mockResolve.mock.calls.length;

    jest.clearAllMocks();
    installLeafMocks();

    await runSyntheticRetaClose(scenario.players, scenario.matches, true);
    const after = mockResolve.mock.calls.length;

    // eslint-disable-next-line no-console
    console.log(
      `[perf-batch-1][DELTA] resolveJugadorIdForParticipacion: ${before} -> ${after} ` +
        `(-${Math.round((1 - after / before) * 100)}%)`
    );

    expect(after).toBeLessThan(before);
    expect(before - after).toBe(scenario.matches.length * 4);
  });
});
