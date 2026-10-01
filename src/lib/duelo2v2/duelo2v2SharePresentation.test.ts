import { createDuelo2v2SharePresentation, duelo2v2ShareFileName } from "./duelo2v2SharePresentation";
import type { Duelo2v2SharePresentation } from "./duelo2v2SharePresentation";

describe("duelo2v2SharePresentation", () => {
  it("generates a stable png file name", () => {
    const data = {
      place: "winner",
      positionLabel: "1.er LUGAR",
      dueloNombre: "Test Duelo",
    } as Duelo2v2SharePresentation;

    expect(duelo2v2ShareFileName(data)).toBe("duelo-2v2-test-duelo-1-er-lugar.png");
  });

  it("muestra cada set desde la pareja y distingue el que ganó", () => {
    const card = createDuelo2v2SharePresentation({
      place: "winner",
      teamName: "Pareja 2",
      players: [],
      setsWin: 2,
      setsLoss: 1,
      detalle: [
        { a: 6, b: 3 },
        { a: 1, b: 6 },
        { a: 2, b: 6 },
      ],
      setOutcomes: ["a", "b", "b"],
      gamesWin: 15,
      gamesLoss: 9,
      side: "b",
      message: "",
      dueloNombre: "Puntos Ranking",
      clubName: "Riviera Open",
      clubLogoUrl: null,
      showMotherAttribution: false,
    });

    expect(card.setRows).toEqual([
      { label: "Set 01", score: "3–6", won: false, tied: false },
      { label: "Set 02", score: "6–1", won: true, tied: false },
      { label: "Set 03", score: "6–2", won: true, tied: false },
    ]);
  });
});
