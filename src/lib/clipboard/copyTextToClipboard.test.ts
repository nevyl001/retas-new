import { copyTextToClipboard, legacyExecCopy } from "./copyTextToClipboard";

describe("copyTextToClipboard", () => {
  const originalClipboard = navigator.clipboard;
  const originalShare = navigator.share;
  const originalCanShare = navigator.canShare;
  const originalExec = document.execCommand;

  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
      share: undefined,
      canShare: undefined,
    });
    document.execCommand = jest.fn().mockReturnValue(true);
  });

  afterEach(() => {
    Object.assign(navigator, {
      clipboard: originalClipboard,
      share: originalShare,
      canShare: originalCanShare,
    });
    document.execCommand = originalExec;
  });

  it("usa clipboard.writeText cuando funciona", async () => {
    const ok = await copyTextToClipboard("hola");
    expect(ok).toBe(true);
    expect(navigator.clipboard?.writeText).toHaveBeenCalledWith("hola");
  });

  it("hace fallback a execCommand si writeText falla", async () => {
    (navigator.clipboard!.writeText as jest.Mock).mockRejectedValue(
      new Error("denied")
    );
    const ok = await copyTextToClipboard("mensaje largo");
    expect(ok).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("usa navigator.share cuando está disponible", async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      share,
      canShare: jest.fn().mockReturnValue(true),
    });
    const ok = await copyTextToClipboard("convocatoria");
    expect(ok).toBe(true);
    expect(share).toHaveBeenCalledWith({ text: "convocatoria" });
    expect(navigator.clipboard?.writeText).not.toHaveBeenCalled();
  });

  it("retorna false con texto vacío", async () => {
    expect(await copyTextToClipboard("   ")).toBe(false);
  });
});

describe("legacyExecCopy", () => {
  const originalExec = document.execCommand;

  afterEach(() => {
    document.execCommand = originalExec;
  });

  it("invoca execCommand copy", () => {
    document.execCommand = jest.fn().mockReturnValue(true);
    expect(legacyExecCopy("test")).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });
});
