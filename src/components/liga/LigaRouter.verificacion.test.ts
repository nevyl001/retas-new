import { isLigaPublicPath, parseLigaPath } from "./LigaRouter";

describe("ruta pública de verificación", () => {
  it("reconoce /public/verificar-correo sin exigir sesión de liga", () => {
    expect(parseLigaPath("/public/verificar-correo")).toEqual({
      kind: "verificarCorreo",
    });
    expect(isLigaPublicPath("/public/verificar-correo")).toBe(true);
  });
});
