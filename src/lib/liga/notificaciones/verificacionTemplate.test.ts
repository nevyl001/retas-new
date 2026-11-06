import { renderVerificacionEmail } from "./verificacionTemplate";

describe("plantilla de verificación", () => {
  it("mantiene el tono institucional y no incluye el correo en el enlace", () => {
    const { html, text, asunto } = renderVerificacionEmail({
      clubNombre: "Hack Pádel",
      logoUrl: "https://cdn.example.com/hack.png",
      acentoHex: "#123456",
      ligaNombre: "Liga Nocturna",
      jugadorNombre: "Saúl Moreno",
      verificarUrl:
        "https://appriviera.rivieraopen.com/public/verificar-correo?t=" +
        "a".repeat(64),
      footerLine: null,
      vistaPrevia: true,
    });
    expect(asunto).toContain("Verifica tu correo");
    expect(html).toContain("Confirma tu correo electrónico");
    expect(html).toContain("VERIFICAR MI CORREO");
    expect(html).toContain("VISTA PREVIA");
    expect(html).toContain("by Riviera Open");
    expect(html).toContain("caduca en 24 horas");
    expect(html).not.toContain("@example");
    expect(text).toContain("Saúl Moreno");
    expect(text).toContain("/public/verificar-correo?t=");
  });

  it("la cuenta Riviera Open no duplica la atribución", () => {
    const { html } = renderVerificacionEmail({
      clubNombre: "Riviera Open",
      logoUrl: null,
      acentoHex: "#d4af37",
      ligaNombre: "Liga",
      jugadorNombre: null,
      verificarUrl:
        "https://appriviera.rivieraopen.com/public/verificar-correo?t=" +
        "b".repeat(64),
      footerLine: null,
      vistaPrevia: false,
    });
    expect(html).not.toContain("by Riviera Open");
    expect(html).toContain("Hola:");
  });
});
