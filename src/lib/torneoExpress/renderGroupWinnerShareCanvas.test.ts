import {
  GROUP_WINNER_SHARE_HEIGHT,
  GROUP_WINNER_SHARE_WIDTH,
  computeCoverCrop,
  formatSignedNumber,
  initialsFromName,
  renderGroupWinnerShareCanvas,
  slugifyGroupWinnerShareFileName,
  type GroupWinnerShareData,
} from "./renderGroupWinnerShareCanvas";

const baseData: GroupWinnerShareData = {
  tournamentName: "Summer Open",
  categoryName: "3ra Fuerza",
  groupName: "Grupo A",
  pairName: "Pablo Pérez / David Díaz",
  player1: { name: "Pablo Pérez" },
  player2: { name: "David Díaz" },
  position: 1,
  points: 6,
  played: 3,
  wins: 3,
  fav: 18,
  con: 6,
  diff: 12,
};

function canvasContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: jest.fn() };
  return {
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "high",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    globalAlpha: 1,
    beginPath: jest.fn(),
    closePath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    arcTo: jest.fn(),
    arc: jest.fn(),
    clip: jest.fn(),
    fill: jest.fn(),
    stroke: jest.fn(),
    fillRect: jest.fn(),
    fillText: jest.fn(),
    drawImage: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    createLinearGradient: jest.fn(() => gradient),
    measureText: jest.fn((text: string) => ({
      width: text.length * 14,
    })),
  } as unknown as CanvasRenderingContext2D;
}

describe("renderGroupWinnerShareCanvas", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("usa un canvas Story fijo de 1080×1920", async () => {
    const context = canvasContext();
    const canvas = {
      width: 0,
      height: 0,
      getContext: jest.fn(() => context),
      toBlob: jest.fn(),
    } as unknown as HTMLCanvasElement;
    const realCreate = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation((tag: string) =>
      tag === "canvas" ? canvas : realCreate(tag)
    );

    await expect(renderGroupWinnerShareCanvas(baseData)).resolves.toBe(canvas);
    expect(canvas.width).toBe(GROUP_WINNER_SHARE_WIDTH);
    expect(canvas.height).toBe(GROUP_WINNER_SHARE_HEIGHT);
    expect(context.fillText).toHaveBeenCalledWith(
      expect.stringContaining("GRUPO A"),
      expect.any(Number),
      expect.any(Number)
    );
  });

  it("admite datos dinámicos, nombres largos y diferencias con signo", async () => {
    expect(formatSignedNumber(12)).toBe("+12");
    expect(formatSignedNumber(-4)).toBe("-4");
    expect(formatSignedNumber(0)).toBe("0");
    expect(initialsFromName("Ana María de la Torre")).toBe("AT");
    expect(
      slugifyGroupWinnerShareFileName({
        ...baseData,
        tournamentName: "Verano Ágil 2026",
        categoryName: "Categoría Súper Larga",
        groupName: "Grupo B",
      })
    ).toBe("riviera-open-verano-agil-2026-categoria-super-larga-grupo-b.png");
    expect(computeCoverCrop(1600, 900, 220, 220)).toMatchObject({
      sw: 900,
      sh: 900,
    });
  });

  it("renderiza Grupo B aunque una foto falle por CORS o red", async () => {
    const context = canvasContext();
    const canvas = {
      width: 0,
      height: 0,
      getContext: jest.fn(() => context),
      toBlob: jest.fn(),
    } as unknown as HTMLCanvasElement;
    const realCreate = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation((tag: string) =>
      tag === "canvas" ? canvas : realCreate(tag)
    );
    const previousImage = global.Image;
    class FailingImage {
      crossOrigin = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 0;
      naturalHeight = 0;
      width = 0;
      height = 0;

      set src(_value: string) {
        this.onerror?.();
      }
    }
    Object.defineProperty(global, "Image", {
      configurable: true,
      value: FailingImage,
    });

    await expect(
      renderGroupWinnerShareCanvas({
        ...baseData,
        tournamentName: "Copa de Verano con Nombre Muy Largo",
        groupName: "Grupo B",
        pairName: "Pablo Maximiliano Pérez / David Alejandro Díaz",
        player1: { name: "Pablo Maximiliano Pérez", avatarUrl: "https://bad.example/a.jpg" },
        player2: { name: "David Alejandro Díaz" },
        diff: -4,
      })
    ).resolves.toBe(canvas);
    expect(context.fillText).toHaveBeenCalledWith(
      expect.stringContaining("GRUPO B"),
      expect.any(Number),
      expect.any(Number)
    );
    Object.defineProperty(global, "Image", {
      configurable: true,
      value: previousImage,
    });
  });
});
