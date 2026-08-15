import {
  downloadGroupWinnerPng,
  shareGroupWinnerImage,
} from "./shareGroupWinnerImage";
import * as renderer from "./renderGroupWinnerShareCanvas";

const data: renderer.GroupWinnerShareData = {
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

describe("shareGroupWinnerImage", () => {
  const originalShare = navigator.share;
  const originalCanShare = (navigator as Navigator & { canShare?: unknown })
    .canShare;

  beforeEach(() => {
    jest
      .spyOn(renderer, "renderGroupWinnerSharePng")
      .mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: jest.fn(() => "blob:group-winner"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: jest.fn(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: originalShare,
    });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: originalCanShare,
    });
  });

  it("comparte exclusivamente el archivo PNG, sin URL", async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: jest.fn().mockReturnValue(true),
    });

    await expect(shareGroupWinnerImage(data)).resolves.toEqual({
      status: "shared",
    });
    const payload = share.mock.calls[0][0] as ShareData;
    expect(payload).toEqual({ files: expect.any(Array) });
    expect(payload.files?.[0]).toBeInstanceOf(File);
    expect(payload.files?.[0].type).toBe("image/png");
    expect(payload).not.toHaveProperty("url");
    expect(payload).not.toHaveProperty("text");
    expect(payload).not.toHaveProperty("title");
  });

  it("descarga el PNG cuando no puede compartir archivos", async () => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: undefined,
    });
    const click = jest.fn();
    const remove = jest.fn();
    const originalCreate = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") {
        return {
          href: "",
          download: "",
          rel: "",
          style: { display: "" },
          click,
          remove,
        } as unknown as HTMLAnchorElement;
      }
      return originalCreate(tag);
    });
    jest.spyOn(document.body, "appendChild").mockImplementation((node) => node);

    await expect(shareGroupWinnerImage(data)).resolves.toMatchObject({
      status: "downloaded",
      fileName: "riviera-open-summer-open-3ra-fuerza-grupo-a.png",
    });
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("no muestra error ni descarga cuando se cancela el share sheet", async () => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: jest.fn().mockReturnValue(true),
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: jest.fn().mockRejectedValue(
        Object.assign(new Error("cancelled"), { name: "AbortError" })
      ),
    });
    await expect(shareGroupWinnerImage(data)).resolves.toEqual({
      status: "cancelled",
    });
  });

  it("expone descarga utilizable", () => {
    const click = jest.fn();
    const remove = jest.fn();
    jest.spyOn(document, "createElement").mockReturnValue({
      href: "",
      download: "",
      rel: "",
      style: { display: "" },
      click,
      remove,
    } as unknown as HTMLAnchorElement);
    jest.spyOn(document.body, "appendChild").mockImplementation((node) => node);

    downloadGroupWinnerPng(new Blob(["png"], { type: "image/png" }), "story.png");
    expect(click).toHaveBeenCalled();
  });
});
