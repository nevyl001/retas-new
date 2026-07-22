import {
  AMERICANO_PUBLIC_POLL_INTERVAL_MS,
  AMERICANO_RESULTS_BOARD_POLL_INTERVAL_MS,
} from "./publicPoll";
import { LIGA_PUBLIC_POLL_INTERVAL_MS } from "../liga/publicPoll";
import { RIVIERA_RANKING_PUBLIC_POLL_INTERVAL_MS } from "../rivieraJugadores/publicPoll";
import { DUELO_2V2_PUBLIC_POLL_INTERVAL_MS } from "../duelo2v2/publicPoll";
import { PUBLIC_TOURNAMENT_POLL_INTERVAL_MS } from "../publicTournament/publicPoll";
import { TE_PUBLIC_POLL_INTERVAL_MS } from "../torneoExpress/publicPoll";

describe("public poll intervals (egress phase 1)", () => {
  it("PublicAmericanoView ya no usa 4 s", () => {
    expect(AMERICANO_PUBLIC_POLL_INTERVAL_MS).toBe(15_000);
    expect(AMERICANO_PUBLIC_POLL_INTERVAL_MS).toBeGreaterThan(4_000);
  });

  it("PublicAmericanoResultsBoard ya no usa 8 s", () => {
    expect(AMERICANO_RESULTS_BOARD_POLL_INTERVAL_MS).toBe(30_000);
    expect(AMERICANO_RESULTS_BOARD_POLL_INTERVAL_MS).toBeGreaterThan(8_000);
  });

  it("liga públicas / detalle usan 30 s", () => {
    expect(LIGA_PUBLIC_POLL_INTERVAL_MS).toBe(30_000);
  });

  it("ranking público usa 60 s", () => {
    expect(RIVIERA_RANKING_PUBLIC_POLL_INTERVAL_MS).toBe(60_000);
  });

  it("duelo / reta pública / standings / TE mantienen 60 s", () => {
    expect(DUELO_2V2_PUBLIC_POLL_INTERVAL_MS).toBe(60_000);
    expect(PUBLIC_TOURNAMENT_POLL_INTERVAL_MS).toBe(60_000);
    expect(TE_PUBLIC_POLL_INTERVAL_MS).toBe(60_000);
  });
});
