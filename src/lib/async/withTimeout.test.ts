import { isTimeoutError, TimeoutError, withTimeout } from "./withTimeout";

describe("withTimeout — el spinner nunca queda sin salida", () => {
  it("resuelve normalmente si la promesa responde a tiempo", async () => {
    await expect(
      withTimeout(Promise.resolve("ok"), { timeoutMs: 1000 })
    ).resolves.toBe("ok");
  });

  it("rechaza con TimeoutError si la promesa nunca resuelve", async () => {
    const nunca = new Promise<string>(() => {
      /* simula fetch colgado en móvil */
    });

    await expect(
      withTimeout(nunca, { timeoutMs: 10, label: "La carga de retas" })
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it("incluye la etiqueta y los segundos en el mensaje", async () => {
    const nunca = new Promise<string>(() => {});
    await expect(
      withTimeout(nunca, { timeoutMs: 2000, label: "El cierre de la reta" })
    ).rejects.toThrow(/El cierre de la reta tardó más de 2s/);
  });

  it("propaga el error original si la promesa falla antes del timeout", async () => {
    await expect(
      withTimeout(Promise.reject(new Error("falla real")), { timeoutMs: 1000 })
    ).rejects.toThrow("falla real");
  });

  it("isTimeoutError reconoce el error por código", () => {
    expect(isTimeoutError(new TimeoutError("x"))).toBe(true);
    expect(isTimeoutError({ code: "ETIMEOUT" })).toBe(true);
    expect(isTimeoutError(new Error("otro"))).toBe(false);
  });
});
