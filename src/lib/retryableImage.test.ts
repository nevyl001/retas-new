import {
  DEFAULT_MAX_IMAGE_RETRIES,
  advanceRetryImageState,
  initialRetryImageState,
  resolveRetryImageSrc,
} from "./retryableImage";

describe("retryableImage", () => {
  it("empieza en intento 0 sin fallo", () => {
    expect(initialRetryImageState()).toEqual({ attempt: 0, failed: false });
  });

  it("reintenta hasta el máximo y luego marca failed", () => {
    let state = initialRetryImageState();
    for (let i = 1; i <= DEFAULT_MAX_IMAGE_RETRIES; i++) {
      state = advanceRetryImageState(state);
      expect(state).toEqual({ attempt: i, failed: false });
    }
    // Un error más allá del máximo agota los reintentos.
    state = advanceRetryImageState(state);
    expect(state.failed).toBe(true);
  });

  it("respeta un maxRetries personalizado", () => {
    let state = initialRetryImageState();
    state = advanceRetryImageState(state, 1);
    expect(state).toEqual({ attempt: 1, failed: false });
    state = advanceRetryImageState(state, 1);
    expect(state.failed).toBe(true);
  });

  it("es idempotente una vez en failed", () => {
    const failed = { attempt: 2, failed: true };
    expect(advanceRetryImageState(failed)).toBe(failed);
  });

  it("devuelve la url original en el intento 0", () => {
    const src = resolveRetryImageSrc("https://cdn/foto.png", {
      attempt: 0,
      failed: false,
    });
    expect(src).toBe("https://cdn/foto.png");
  });

  it("agrega cache-bust con ? cuando la url no tiene query", () => {
    const src = resolveRetryImageSrc("https://cdn/foto.png", {
      attempt: 2,
      failed: false,
    });
    expect(src).toBe("https://cdn/foto.png?_retry=2");
  });

  it("agrega cache-bust con & cuando la url ya tiene query (URL firmada)", () => {
    const src = resolveRetryImageSrc("https://cdn/foto.png?token=abc", {
      attempt: 1,
      failed: false,
    });
    expect(src).toBe("https://cdn/foto.png?token=abc&_retry=1");
  });

  it("devuelve null cuando no hay foto o cuando ya falló", () => {
    expect(resolveRetryImageSrc(null, { attempt: 0, failed: false })).toBeNull();
    expect(resolveRetryImageSrc("   ", { attempt: 0, failed: false })).toBeNull();
    expect(
      resolveRetryImageSrc("https://cdn/foto.png", { attempt: 2, failed: true })
    ).toBeNull();
  });
});
