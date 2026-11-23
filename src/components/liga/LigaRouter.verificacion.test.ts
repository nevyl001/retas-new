import { isLigaPublicPath, parseLigaPath } from "./LigaRouter";

describe("ruta pública de verificación", () => {
  it("reconoce /public/verificar-correo sin exigir sesión de liga", () => {
    expect(parseLigaPath("/public/verificar-correo")).toEqual({
      kind: "verificarCorreo",
    });
    expect(isLigaPublicPath("/public/verificar-correo")).toBe(true);
  });

  it("abre la pantalla pública de una jornada flex", () => {
    expect(parseLigaPath("/public/liga/liga-1/jornada/3/pantalla")).toEqual({
      kind: "publicaPantalla",
      ligaId: "liga-1",
      numero: 3,
    });
    expect(isLigaPublicPath("/public/liga/liga-1/jornada/3/pantalla")).toBe(true);
  });
});
