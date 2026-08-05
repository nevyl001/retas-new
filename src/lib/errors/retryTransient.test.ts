import { isTransientError, retryTransient } from "./retryTransient";

describe("isTransientError — solo reintentar lo que vale la pena", () => {
  it("trata los fallos de red como transitorios", () => {
    expect(isTransientError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isTransientError({ message: "network request failed" })).toBe(true);
    expect(isTransientError({ message: "Load failed" })).toBe(true);
  });

  it("trata 5xx y 429 como transitorios", () => {
    expect(isTransientError({ status: 503, message: "unavailable" })).toBe(true);
    expect(isTransientError({ status: 429, message: "rate limited" })).toBe(true);
  });

  it("NO reintenta errores deterministas", () => {
    // RPC ausente: reintentar solo alarga el cierre.
    expect(
      isTransientError({ code: "PGRST202", message: "Could not find function" })
    ).toBe(false);
    // RLS / permisos.
    expect(isTransientError({ code: "42501", message: "denied" })).toBe(false);
    // 4xx determinista.
    expect(isTransientError({ status: 404, message: "not found" })).toBe(false);
    // Unique violation (idempotencia ya resuelta en BD).
    expect(isTransientError({ code: "23505", message: "duplicate" })).toBe(false);
  });

  it("reintenta deadlocks y timeouts de statement de Postgres", () => {
    expect(isTransientError({ code: "40P01", message: "deadlock" })).toBe(true);
    expect(isTransientError({ code: "57014", message: "canceled" })).toBe(true);
  });
});

describe("retryTransient", () => {
  it("no reintenta cuando el primer intento funciona", async () => {
    const fn = jest.fn().mockResolvedValue("ok");
    await expect(retryTransient(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("reintenta un fallo transitorio y termina bien", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue("ok");

    await expect(
      retryTransient(fn, { baseDelayMs: 1 })
    ).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("no reintenta un error determinista", async () => {
    const fn = jest.fn().mockRejectedValue({ code: "PGRST202", message: "no fn" });

    await expect(retryTransient(fn, { baseDelayMs: 1 })).rejects.toMatchObject({
      code: "PGRST202",
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("respeta el máximo de intentos y relanza el último error", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("timeout"));

    await expect(
      retryTransient(fn, { attempts: 3, baseDelayMs: 1 })
    ).rejects.toThrow("timeout");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("permite vetar el reintento con shouldRetry", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("Failed to fetch"));

    await expect(
      retryTransient(fn, { baseDelayMs: 1, shouldRetry: () => false })
    ).rejects.toThrow("Failed to fetch");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
