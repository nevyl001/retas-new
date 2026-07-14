import { formatSupabaseErrorMessage } from "./supabaseErrorMessage";

describe("formatSupabaseErrorMessage", () => {
  it("usa message cuando es el texto de RAISE EXCEPTION", () => {
    expect(
      formatSupabaseErrorMessage({
        message:
          "No se puede eliminar un jugador concedido desde este club. Revoca el acceso desde Admin Principal.",
        code: "P0001",
      })
    ).toContain("jugador concedido");
  });

  it("prefiere details cuando message es Bad Request", () => {
    expect(
      formatSupabaseErrorMessage({
        message: "Bad Request",
        details: "Sin permiso para eliminar este jugador",
        code: "P0001",
      })
    ).toBe("Sin permiso para eliminar este jugador");
  });

  it("combina message + hint si aportan info distinta", () => {
    const msg = formatSupabaseErrorMessage({
      message: "Jugador no encontrado o sin permiso para eliminarlo",
      hint: "Verifica el club activo",
    });
    expect(msg).toContain("Jugador no encontrado");
    expect(msg).toContain("Verifica el club activo");
  });

  it("usa fallback si no hay texto útil", () => {
    expect(formatSupabaseErrorMessage({ code: "P0001" }, "Falló el borrado")).toBe(
      "Falló el borrado (P0001)"
    );
  });
});
