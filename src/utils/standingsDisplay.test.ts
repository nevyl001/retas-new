import {
  computeStandingDif,
  formatStandingDif,
} from "./standingsDisplay";
import { getHeadToHead } from "./standings";

describe("standingsDisplay", () => {
  it("DIF = FAV - CON", () => {
    expect(computeStandingDif(18, 6)).toBe(12);
    expect(computeStandingDif(9, 12)).toBe(-3);
  });

  it("formatea signo +, - y cero", () => {
    expect(formatStandingDif(6)).toBe("+6");
    expect(formatStandingDif(-3)).toBe("-3");
    expect(formatStandingDif(0)).toBe("0");
  });
});

describe("getHeadToHead", () => {
  it("retorna -1 si A ganó el duelo directo", () => {
    expect(
      getHeadToHead("a", "b", [
        { pairAId: "a", pairBId: "b", gamesA: 6, gamesB: 4, winnerId: "a" },
      ])
    ).toBe(-1);
  });

  it("retorna 0 si no hay duelo", () => {
    expect(getHeadToHead("a", "b", [])).toBe(0);
  });
});
