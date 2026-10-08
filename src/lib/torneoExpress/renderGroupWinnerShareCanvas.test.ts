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
  clubName: "Valvidub Sports",
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
    createRadialGradient: jest.fn(() => gradient),
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
    const paintedText = (context.fillText as jest.Mock).mock.calls.map(
      ([text]) => text
    );
    expect(paintedText).toContain("Pablo Pérez");
    expect(paintedText).toContain("David Díaz");
    expect(paintedText).toContain("VALVIDUB SPORTS");
    expect(paintedText.join("")).toContain("BY RIVIERA OPEN");
    expect(paintedText).not.toContain(baseData.pairName);
    expect(paintedText).not.toContain("GANADORES DEL GRUPO A");
  });

  it("pinta las siete estadísticas oficiales (PJ·PG·PP·PTS·GF·GC·DIF) y no el trío anterior", async () => {
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

    await renderGroupWinnerShareCanvas({
      ...baseData,
      played: 3,
      wins: 2,
      losses: 1,
      points: 4,
      fav: 25,
      con: 13,
      diff: 12,
      // El modo ya no cambia las estadísticas que se muestran.
      clasificacionModo: "setto_pg",
    });

    const painted = (context.fillText as jest.Mock).mock.calls.map(([text]) =>
      String(text)
    );
    // Cada sigla se pinta carácter a carácter (texto con tracking).
    const joined = painted.join("");
    for (const label of ["PJ", "PG", "PP", "PTS", "GF", "GC", "DIF"]) {
      expect(joined).toContain(label);
    }
    expect(joined).not.toContain("FAV");
    // Valores oficiales, en el mismo orden que la card pública.
    const values = ["3", "2", "1", "4", "25", "13", "+12"];
    const positions = values.map((value) => painted.indexOf(value));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("sin `losses` deriva PP como jugados − ganados", async () => {
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

    await renderGroupWinnerShareCanvas({
      ...baseData,
      played: 3,
      wins: 2,
      diff: 0,
    });
    const painted = (context.fillText as jest.Mock).mock.calls.map(([text]) =>
      String(text)
    );
    expect(painted).toContain("1");
    expect(painted).toContain("0");
  });

  it("los nombres largos se ajustan a máximo 2 líneas dentro del retrato", async () => {
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

    await renderGroupWinnerShareCanvas({
      ...baseData,
      player1: { name: "Maximiliano Alejandro Hernández de la Torre" },
      player2: { name: "Jose Luis Domínguez Villaseñor" },
    });

    const calls = (context.fillText as jest.Mock).mock.calls as [
      string,
      number,
      number,
    ][];
    const nameCalls = calls.filter(([text]) =>
      /Maximiliano|Hernández|Torre|Domínguez|Villaseñor|Jose Luis/.test(text)
    );
    // Dos jugadores × hasta 2 líneas cada uno.
    expect(nameCalls.length).toBeGreaterThanOrEqual(2);
    expect(nameCalls.length).toBeLessThanOrEqual(4);
    // Con el mock (14 px por carácter) ninguna línea excede el ancho útil del retrato.
    const photoWidth = (GROUP_WINNER_SHARE_WIDTH - 76 * 2 - 24) / 2;
    const usable = photoWidth - 30 * 2;
    for (const [text] of nameCalls) {
      expect(text.replace("…", "").length * 14).toBeLessThanOrEqual(usable);
    }
  });

  it("la cuenta madre no repite by Riviera Open", async () => {
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

    await renderGroupWinnerShareCanvas({
      ...baseData,
      clubName: "Riviera Open",
    });

    const paintedText = (context.fillText as jest.Mock).mock.calls.map(
      ([text]) => String(text)
    );
    expect(paintedText).toContain("RIVIERA OPEN");
    expect(paintedText.join("")).not.toContain("BY RIVIERA OPEN");
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
              clubName: "Club con Nombre Muy Largo para la Story",
              clubLogoUrl: "https://bad.example/club-logo.png",
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

  it("integra fotos y logo disponibles sin cambiar su proporción", async () => {
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
    class LoadedImage {
      crossOrigin = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 640;
      naturalHeight = 360;
      width = 640;
      height = 360;

      set src(_value: string) {
        this.onload?.();
      }
    }
    Object.defineProperty(global, "Image", {
      configurable: true,
      value: LoadedImage,
    });

    await expect(
      renderGroupWinnerShareCanvas({
        ...baseData,
        clubLogoUrl: "https://assets.example/club-logo.png",
        player1: {
          name: "Emiliano Cárdenas Hernández",
          avatarUrl: "https://assets.example/player-1.jpg",
        },
        player2: {
          name: "Martín Rodríguez",
          avatarUrl: "https://assets.example/player-2.jpg",
        },
      })
    ).resolves.toBe(canvas);
    expect(context.drawImage).toHaveBeenCalled();
    Object.defineProperty(global, "Image", {
      configurable: true,
      value: previousImage,
    });
  });
});
