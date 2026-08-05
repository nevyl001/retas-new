/**
 * validateRetaParticipants — gate de identidad antes de iniciar una reta.
 *
 * No reimplementa resolución de identidad: consume validateCareerEventPreClose
 * (real, sin mock) tal como lo hace pipeline.ts al cerrar. Solo se mockean sus
 * dependencias externas (supabase, ensureRivieraIdentity,
 * requireOfficialProfileLinkForParticipacion, resolveJugadorIdForParticipacion)
 * para poder aislar los tres escenarios que importan: roster válido, jugador
 * sin identidad resoluble, y el caso Said C (2026-08-05) — un error crudo,
 * no instancia de Error, lanzado por ensureRivieraIdentity nunca debe llegar
 * a la UI como "[object Object]".
 */
/* eslint-disable import/first -- jest.mock debe preceder los imports que mockea (convención ya usada en preCloseGuards.test.ts) */
jest.mock("../supabaseClient", () => ({
  supabase: { from: jest.fn() },
}));

jest.mock("../rivieraJugadores/careerIdentity", () => ({
  ensureRivieraIdentity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../rivieraJugadores/orphanProfileLink", () => ({
  requireOfficialProfileLinkForParticipacion: jest.fn(),
}));

jest.mock("../rivieraJugadores/jugadorIdResolver", () => ({
  resolveJugadorIdForParticipacion: jest.fn(),
}));

import { supabase } from "../supabaseClient";
import { ensureRivieraIdentity } from "../rivieraJugadores/careerIdentity";
import { requireOfficialProfileLinkForParticipacion } from "../rivieraJugadores/orphanProfileLink";
import { resolveJugadorIdForParticipacion } from "../rivieraJugadores/jugadorIdResolver";
import { validateRetaParticipants } from "./validateRetaParticipants";
import type { Pair, Tournament } from "../database";
/* eslint-enable import/first */

const ORG = "2770b522-9064-4c7b-a729-4a0ea7e3f6e8";
const TOURNAMENT_ID = "9b1f7e2a-1111-4c3d-8888-abcdef123456";
const P1 = "player-1111-aaaa";
const P2 = "player-2222-bbbb";
const J1 = "jugador-1111-aaaa";
const J2 = "jugador-2222-bbbb";

function tournamentFixture(): Tournament {
  return {
    id: TOURNAMENT_ID,
    name: "Batalla Equipos",
    courts: 2,
    is_started: false,
    is_finished: false,
    user_id: ORG,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  } as Tournament;
}

function pairsFixture(): Pair[] {
  return [
    {
      id: "pair-1",
      tournament_id: TOURNAMENT_ID,
      player1_id: P1,
      player2_id: P2,
      player1_name: "Nevyl",
      player2_name: "Said C",
      created_at: "2026-08-01T00:00:00Z",
    } as Pair,
  ];
}

function mockTournamentFound() {
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const chain: Record<string, jest.Mock> = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    if (table === "tournaments") {
      chain.maybeSingle = jest
        .fn()
        .mockResolvedValue({ data: { id: TOURNAMENT_ID }, error: null });
      return chain;
    }
    chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    return chain;
  });
}

describe("validateRetaParticipants", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTournamentFound();
  });

  it("roster válido con identidad resoluble → ok:true, sin invalidPlayers", async () => {
    (resolveJugadorIdForParticipacion as jest.Mock).mockImplementation(
      async ({ legacyPlayerId }: { legacyPlayerId?: string }) =>
        legacyPlayerId === P1 ? J1 : legacyPlayerId === P2 ? J2 : null
    );
    (requireOfficialProfileLinkForParticipacion as jest.Mock).mockResolvedValue({
      officialPlayerKey: "opk-1",
      rivieraId: "RIV-00000001",
    });

    const result = await validateRetaParticipants({
      tournament: tournamentFixture(),
      pairs: pairsFixture(),
      organizadorId: ORG,
    });

    expect(result.ok).toBe(true);
    expect(result.invalidPlayers).toHaveLength(0);
    expect(result.validPlayers).toHaveLength(2);
    expect(result.validPlayers.map((p) => p.playerId).sort()).toEqual(
      [P1, P2].sort()
    );
  });

  it("jugador sin identidad resoluble → bloquea inicio con reason legible", async () => {
    (resolveJugadorIdForParticipacion as jest.Mock).mockImplementation(
      async ({ legacyPlayerId }: { legacyPlayerId?: string }) =>
        legacyPlayerId === P1 ? J1 : null // P2 ("Said C") no resuelve
    );
    (requireOfficialProfileLinkForParticipacion as jest.Mock).mockResolvedValue({
      officialPlayerKey: "opk-1",
      rivieraId: "RIV-00000001",
    });

    const result = await validateRetaParticipants({
      tournament: tournamentFixture(),
      pairs: pairsFixture(),
      organizadorId: ORG,
    });

    expect(result.ok).toBe(false);
    expect(result.invalidPlayers).toHaveLength(1);
    expect(result.invalidPlayers[0].playerId).toBe(P2);
    expect(result.invalidPlayers[0].displayName).toBe("Said C");
    expect(result.invalidPlayers[0].reason).toBeTruthy();
    expect(result.invalidPlayers[0].reason).not.toContain("[object Object]");
    expect(result.invalidPlayers[0].suggestedAction).toBeTruthy();
  });

  it("regresión Said C: error crudo no-Error de ensureRivieraIdentity nunca produce [object Object]", async () => {
    (resolveJugadorIdForParticipacion as jest.Mock).mockImplementation(
      async ({ legacyPlayerId }: { legacyPlayerId?: string }) =>
        legacyPlayerId === P1 ? J1 : legacyPlayerId === P2 ? J2 : null
    );
    (requireOfficialProfileLinkForParticipacion as jest.Mock).mockResolvedValue({
      officialPlayerKey: "opk-1",
      rivieraId: "RIV-00000001",
    });
    // Forma exacta de un PostgrestError: objeto plano, NO instancia de Error.
    // String(rawPostgrestError) da literalmente "[object Object]" — esta es
    // la causa raíz del incidente 2026-08-05.
    (ensureRivieraIdentity as jest.Mock).mockImplementation(
      async (jugadorId: string) => {
        if (jugadorId === J2) {
          // Reproduce exactamente lo que hace careerIdentity.ts
          // `if (error) throw error;` con un PostgrestError real (objeto
          // plano, no instancia de Error).
          // eslint-disable-next-line no-throw-literal
          throw {
            code: "PGRST301",
            message: "JWT expired",
            details: null,
            hint: null,
          };
        }
        return undefined;
      }
    );

    const result = await validateRetaParticipants({
      tournament: tournamentFixture(),
      pairs: pairsFixture(),
      organizadorId: ORG,
    });

    expect(result.ok).toBe(false);
    const saidFailure = result.invalidPlayers.find((p) => p.playerId === P2);
    expect(saidFailure).toBeDefined();
    expect(saidFailure?.reason).not.toContain("[object Object]");
    expect(saidFailure?.reason).toContain("JWT expired");
  });
});
