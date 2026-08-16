import {
  TOURNAMENT_PODIUM_SHARE_HEIGHT,
  TOURNAMENT_PODIUM_SHARE_WIDTH,
  renderTournamentPodiumShareCanvas,
} from "./renderTournamentPodiumShareCanvas";
import {
  createPodiumSharePresentation,
  type PodiumSharePlace,
} from "./publicPodiumSharePresentation";

function canvasContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: jest.fn() };
  return {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
    textAlign: "left",
    globalAlpha: 1,
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    arc: jest.fn(),
    clip: jest.fn(),
    fill: jest.fn(),
    stroke: jest.fn(),
    fillRect: jest.fn(),
    fillText: jest.fn(),
    drawImage: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    strokeRect: jest.fn(),
    createLinearGradient: jest.fn(() => gradient),
    createRadialGradient: jest.fn(() => gradient),
    measureText: jest.fn((text: string) => ({ width: text.length * 14 })),
  } as unknown as CanvasRenderingContext2D;
}

function presentation(place: PodiumSharePlace) {
  return createPodiumSharePresentation({
    place,
    tournamentName: "Summer Open",
    category: "3ra Fuerza",
    clubName: "Valvidub Sports",
    clubLogoUrl: null,
    showMotherAttribution: true,
    players: [
      { id: "p1", name: "Pablo Pérez", fotoUrl: null },
      { id: "p2", name: "David Díaz", fotoUrl: null },
    ],
    stats: {
      partidos: 6,
      victorias: place === "first" ? 6 : 4,
      derrotas: place === "first" ? 0 : 2,
      juegosFavor: 36,
      juegosContra: 20,
      dif: 16,
    },
  });
}

describe("renderTournamentPodiumShareCanvas", () => {
  afterEach(() => jest.restoreAllMocks());

  it.each<PodiumSharePlace>(["first", "second", "third"])(
    "renders %s with the canonical 1080×1920 canvas",
    async (place) => {
      const context = canvasContext();
      const canvas = {
        width: 0,
        height: 0,
        getContext: jest.fn(() => context),
        toBlob: jest.fn(),
      } as unknown as HTMLCanvasElement;
      const nativeCreate = document.createElement.bind(document);
      jest
        .spyOn(document, "createElement")
        .mockImplementation((tag: string) =>
          tag === "canvas" ? canvas : nativeCreate(tag),
        );

      await expect(
        renderTournamentPodiumShareCanvas(presentation(place)),
      ).resolves.toBe(canvas);

      expect(canvas.width).toBe(TOURNAMENT_PODIUM_SHARE_WIDTH);
      expect(canvas.height).toBe(TOURNAMENT_PODIUM_SHARE_HEIGHT);
      expect(context.fillText).toHaveBeenCalledWith(
        expect.stringMatching(/CAMPEONES|SUBCAMPEONES|TERCER LUGAR/),
        expect.any(Number),
        expect.any(Number),
      );
      expect(context.fillText).toHaveBeenCalledWith(
        "EN ESTE TORNEO",
        expect.any(Number),
        expect.any(Number),
      );
    },
  );
});
