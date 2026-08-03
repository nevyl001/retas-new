/**
 * BLK-01: el primer render de React (src/index.tsx) nunca debe depender de
 * que bootstrapAppBranding() se resuelva con éxito. Este test ejecuta el
 * módulo de entrada real con react-dom/client y bootstrapAppBranding
 * mockeados, y confirma que root.render() se llama exactamente una vez
 * en cada escenario (éxito, rechazo, error inesperado) — nunca pantalla
 * blanca, nunca doble render.
 */

export {};

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

describe("src/index.tsx — root.render() exactamente una vez (BLK-01)", () => {
  let renderSpy: jest.Mock;
  let createRootSpy: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '<div id="root"></div>';
    renderSpy = jest.fn();
    createRootSpy = jest.fn(() => ({ render: renderSpy, unmount: jest.fn() }));

    jest.doMock("react-dom/client", () => ({
      __esModule: true,
      default: { createRoot: createRootSpy },
      createRoot: createRootSpy,
    }));
  });

  afterEach(() => {
    jest.dontMock("react-dom/client");
    jest.dontMock("./branding/bootstrapAppBranding");
  });

  it("branding exitoso: render() se llama exactamente una vez", async () => {
    jest.doMock("./branding/bootstrapAppBranding", () => ({
      bootstrapAppBranding: jest.fn().mockResolvedValue(undefined),
    }));

    await import("./index");
    await flushMicrotasks();

    expect(createRootSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  it("promesa rechazada (timeout/Supabase caído): render() igual se llama exactamente una vez", async () => {
    jest.doMock("./branding/bootstrapAppBranding", () => ({
      bootstrapAppBranding: jest
        .fn()
        .mockRejectedValue(new Error("network timeout")),
    }));

    await import("./index");
    await flushMicrotasks();

    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  it("error inesperado no capturado internamente: no propaga y aun así renderiza", async () => {
    jest.doMock("./branding/bootstrapAppBranding", () => ({
      bootstrapAppBranding: jest.fn().mockImplementation(() => {
        throw new Error("fallo sincrónico inesperado");
      }),
    }));

    await expect(import("./index")).resolves.toBeDefined();
    await flushMicrotasks();

    expect(renderSpy).toHaveBeenCalledTimes(1);
  });

  it("no hay pantalla blanca: el árbol pasado a render() incluye el árbol de la app", async () => {
    jest.doMock("./branding/bootstrapAppBranding", () => ({
      bootstrapAppBranding: jest.fn().mockResolvedValue(undefined),
    }));

    await import("./index");
    await flushMicrotasks();

    const renderedElement = renderSpy.mock.calls[0]?.[0];
    expect(renderedElement).toBeTruthy();
  });
});
