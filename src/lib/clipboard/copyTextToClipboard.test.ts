import { copyTextToClipboard, legacyExecCopy } from "./copyTextToClipboard";

describe("copyTextToClipboard", () => {
  const originalClipboard = navigator.clipboard;
  const originalExec = document.execCommand;

  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
      share: jest.fn().mockResolvedValue(undefined),
      canShare: jest.fn().mockReturnValue(true),
    });
    document.execCommand = jest.fn().mockReturnValue(true);
  });

  afterEach(() => {
    Object.assign(navigator, {
      clipboard: originalClipboard,
    });
    document.execCommand = originalExec;
  });

  it("usa clipboard.writeText cuando funciona", async () => {
    const ok = await copyTextToClipboard("hola");
    expect(ok).toBe(true);
    expect(navigator.clipboard?.writeText).toHaveBeenCalledWith("hola");
  });

  it("nunca llama navigator.share (botón es Copiar, no Compartir)", async () => {
    await copyTextToClipboard("convocatoria");
    expect(navigator.share).not.toHaveBeenCalled();
  });

  it("hace fallback a execCommand si writeText falla", async () => {
    (navigator.clipboard!.writeText as jest.Mock).mockRejectedValue(
      new Error("denied")
    );
    const ok = await copyTextToClipboard("mensaje largo");
    expect(ok).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(navigator.share).not.toHaveBeenCalled();
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
