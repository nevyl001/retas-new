import {
  computeStandingDif,
  formatStandingDif,
} from "./standingsDisplay";
import { getHeadToHeadWinner } from "./standings";

describe("standingsDisplay", () => {
  it("DIF = PTS FAV - PTS CON", () => {
    expect(computeStandingDif(16, 10)).toBe(6);
    expect(computeStandingDif(9, 12)).toBe(-3);
    expect(computeStandingDif(14, 16)).toBe(-2);
  });

  it("formatea signo +, - y cero", () => {
    expect(formatStandingDif(6)).toBe("+6");
    expect(formatStandingDif(-3)).toBe("-3");
    expect(formatStandingDif(0)).toBe("0");
  });
});

describe("getHeadToHeadWinner", () => {
  it("resuelve empate cuando puntos y dif coinciden", () => {
    const winner = getHeadToHeadWinner("a", "b", [
      { pairAId: "a", pairBId: "b", gamesA: 6, gamesB: 4 },
    ]);
    expect(winner).toBe("a");
  });

  it("usa juegos H2H si empatan victorias en el duelo", () => {
    const winner = getHeadToHeadWinner("a", "b", [
      { pairAId: "a", pairBId: "b", gamesA: 7, gamesB: 5 },
    ]);
    expect(winner).toBe("a");
  });
});
