import {
  downloadBlobAsFile,
  shareAmericanoPerformanceImage,
} from "./shareAmericanoPerformanceImage";
import * as renderMod from "./renderAmericanoPerformanceShareCanvas";

const basePayload: renderMod.AmericanoPerformanceSharePayload = {
  playerName: "Eduardo L",
  position: 1,
  isFinished: true,
  eventName: "Summer Open",
  clubName: "Club Demo",
  fotoUrl: null,
  pj: 4,
  pg: 3,
  pp: 1,
  pe: 0,
  pointsFor: 24,
  pointsAgainst: 12,
  puntos: 6,
};

describe("shareAmericanoPerformanceImage", () => {
  const originalShare = navigator.share;
  const originalCanShare = (navigator as Navigator & { canShare?: unknown })
    .canShare;

  beforeEach(() => {
    jest
      .spyOn(renderMod, "renderAmericanoPerformanceSharePng")
      .mockResolvedValue(new Blob(["png"], { type: "image/png" }));
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: jest.fn(() => "blob:mock"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
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

  it("usa Web Share con archivos cuando canShare lo permite", async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: jest.fn().mockReturnValue(true),
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });

    const result = await shareAmericanoPerformanceImage(basePayload);
    expect(result).toEqual({ status: "shared" });
    expect(share).toHaveBeenCalledTimes(1);
    const arg = share.mock.calls[0][0] as ShareData;
    expect(arg.files?.[0]).toBeInstanceOf(File);
  });

  it("descarga PNG si no hay Web Share de archivos", async () => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: jest.fn().mockReturnValue(false),
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });

    const click = jest.fn();
    const remove = jest.fn();
    const realCreate = document.createElement.bind(document);
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
      return realCreate(tag);
    });
    jest.spyOn(document.body, "appendChild").mockImplementation((n) => n);

    const result = await shareAmericanoPerformanceImage(basePayload);
    expect(result.status).toBe("downloaded");
    expect(click).toHaveBeenCalled();
  });

  it("downloadBlobAsFile crea enlace de descarga", () => {
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
    jest.spyOn(document.body, "appendChild").mockImplementation((n) => n);

    downloadBlobAsFile(new Blob(["x"]), "test.png");
    expect(click).toHaveBeenCalled();
  });

  it("marca cancelled si el usuario aborta el share", async () => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: jest.fn().mockReturnValue(true),
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: jest.fn().mockRejectedValue(
        Object.assign(new Error("Abort"), { name: "AbortError" })
      ),
    });

    const result = await shareAmericanoPerformanceImage(basePayload);
    expect(result).toEqual({ status: "cancelled" });
  });

  it("trata cancelación por mensaje sin AbortError como cancelled", async () => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: jest.fn().mockReturnValue(true),
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: jest.fn().mockRejectedValue(new Error("Share canceled by user")),
    });

    const result = await shareAmericanoPerformanceImage(basePayload);
    expect(result).toEqual({ status: "cancelled" });
  });
});
