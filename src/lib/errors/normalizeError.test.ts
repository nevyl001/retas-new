import {
  errorLogPayload,
  errorMessage,
  errorMessageWithCode,
  normalizeError,
} from "./normalizeError";

describe("normalizeError — nunca produce [object Object]", () => {
  it("normaliza un PostgrestError plano (caso real del incidente)", () => {
    const pgError = {
      code: "PGRST202",
      details: "Searched for the function public.registrar_participacion...",
      hint: "Perhaps you meant to call registrar_participacion_jugador",
      message: "Could not find the function in the schema cache",
    };

    const result = normalizeError(pgError);

    expect(result.message).toBe(
      "Could not find the function in the schema cache"
    );
    expect(result.code).toBe("PGRST202");
    expect(result.hint).toContain("registrar_participacion_jugador");
    expect(result.message).not.toBe("[object Object]");
  });

  it("normaliza un Error estándar", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("normaliza strings y los recorta", () => {
    expect(errorMessage("  falla de red  ")).toBe("falla de red");
  });

  it("desenvuelve respuestas { error } de Supabase", () => {
    const response = { data: null, error: { message: "row-level security" } };
    expect(errorMessage(response)).toBe("row-level security");
  });

  it("usa details/hint cuando no hay message", () => {
    expect(errorMessage({ details: "sin permisos" })).toBe("sin permisos");
    expect(errorMessage({ hint: "revisa el grant" })).toBe("revisa el grant");
  });

  it("usa el code cuando no hay texto alguno", () => {
    expect(errorMessage({ code: "42501" })).toBe("Error 42501");
  });

  it("nunca devuelve [object Object] para objetos arbitrarios", () => {
    const weird = { a: 1, b: [2, 3] };
    const message = errorMessage(weird);
    expect(message).not.toBe("[object Object]");
    expect(message).toContain("\"a\":1");
  });

  it("maneja null, undefined y objetos vacíos", () => {
    expect(errorMessage(null)).toBe("Error desconocido");
    expect(errorMessage(undefined)).toBe("Error desconocido");
    expect(errorMessage({})).toBe("Error desconocido");
  });

  it("maneja referencias circulares sin lanzar", () => {
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;
    expect(() => errorMessage(circular)).not.toThrow();
    expect(errorMessage(circular)).not.toBe("[object Object]");
  });

  it("descarta un message inútil y cae a details", () => {
    const err = { message: "[object Object]", details: "causa real" };
    expect(errorMessage(err)).toBe("causa real");
  });

  it("agrega códigos con errorMessageWithCode", () => {
    expect(
      errorMessageWithCode({ message: "falló", code: "PGRST202" })
    ).toBe("falló [PGRST202]");
    expect(errorMessageWithCode(new Error("simple"))).toBe("simple");
  });

  it("agrega múltiples errores de un array", () => {
    expect(errorMessage([new Error("uno"), { message: "dos" }])).toBe(
      "uno; dos"
    );
  });

  it("produce payload de log solo con campos presentes", () => {
    expect(errorLogPayload({ message: "x", code: "1", status: 404 })).toEqual({
      message: "x",
      code: "1",
      status: 404,
    });
  });

  it("conserva el valor original en raw para logging", () => {
    const original = { message: "algo" };
    expect(normalizeError(original).raw).toBe(original);
  });
});
