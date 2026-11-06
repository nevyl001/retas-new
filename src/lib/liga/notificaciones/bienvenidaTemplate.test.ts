import {
  acentoSeguro,
  enlacePerfilBienvenida,
  renderBienvenidaEmail,
} from "./bienvenidaTemplate";

const RIVIERA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LIGA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function mensaje(partial: Partial<Parameters<typeof renderBienvenidaEmail>[0]> = {}) {
  const enlaces = enlacePerfilBienvenida({
    rivieraJugadorId: RIVIERA,
    ligaId: LIGA,
  });
  return renderBienvenidaEmail({
    clubNombre: "Hack Pádel",
    logoUrl: "https://cdn.example.com/hack-padel.png",
    acentoHex: "#123456",
    ligaNombre: "Liga Nocturna",
    jugadorNombre: "Saúl Moreno",
    categoria: "Cuarta",
    temporada: "Temporada 1",
    perfilUrl: enlaces.perfilUrl,
    ligaUrl: enlaces.ligaUrl,
    footerLine: null,
    vistaPrevia: true,
    ...partial,
  });
}

describe("plantilla de bienvenida", () => {
  it("21. en móvil el documento es legible: viewport, ancho máximo y texto completo", () => {
    const { html, text } = mensaje();
    expect(html).toContain('name="viewport"');
    expect(html).toContain("max-width:600px");
    expect(html).not.toContain("display:flex");
    expect(html).not.toContain("display:grid");
    expect(text).toContain("Hola, Saúl Moreno:");
    expect(text).toContain("Tu inscripción a Liga Nocturna ha sido confirmada.");
    expect(html.length).toBeGreaterThan(text.length);
  });

  it("22. en escritorio conserva la presentación institucional", () => {
    const { html, asunto } = mensaje();
    expect(asunto).toBe("Bienvenido a Liga Nocturna");
    expect(html).toContain("¡Bienvenido a tu liga!");
    expect(html).toContain("VER MI PERFIL");
    expect(html).toContain("Compite. Juega limpio. Vive Riviera Open.");
    expect(html).toContain("VISTA PREVIA");
    expect(html).toContain("https://cdn.example.com/hack-padel.png");
    expect(html).toContain("by Riviera Open");
    expect(html).not.toMatch(/#(?:d4af37|c9a227|ffd700|22c55e|7c3aed)/i);
    expect(html.match(/by Riviera Open/g)).toHaveLength(1);
  });

  it("23. los enlaces son rutas reales y no llevan datos privados", () => {
    const enlaces = enlacePerfilBienvenida({
      rivieraJugadorId: RIVIERA,
      ligaId: LIGA,
    });
    expect(enlaces.perfilUrl).toMatch(
      new RegExp(`/players/${RIVIERA}$`)
    );
    expect(enlaces.ligaUrl).toMatch(new RegExp(`/public/liga/${LIGA}$`));
    expect(enlaces.perfilUrl.startsWith("https://")).toBe(true);
    expect(enlaces.perfilUrl.includes("?")).toBe(false);
    const sinFicha = enlacePerfilBienvenida({
      rivieraJugadorId: null,
      ligaId: LIGA,
    });
    expect(sinFicha.perfilUrl).toBe(sinFicha.ligaUrl);

    const { html, text } = mensaje();
    expect(html).toContain(enlaces.perfilUrl);
    expect(html).not.toContain("@");
    expect(text).not.toContain("@");
    expect(html).not.toContain("token=");
    expect(html).not.toContain("email=");
  });

  it("la cuenta Riviera Open no repite la atribución", () => {
    const { html } = mensaje({ clubNombre: "Riviera Open", acentoHex: "#d4af37" });
    expect(html).not.toContain("by Riviera Open");
    expect(acentoSeguro("#d4af37")).toBeNull();
    expect(html).toContain("border-top:3px solid #f5f5f5");
  });

  it("un club aliado puede usar un acento que no sea dorado, verde ni morado", () => {
    expect(acentoSeguro("#123456")).toBe("#123456");
    expect(acentoSeguro("#22c55e")).toBeNull();
    expect(acentoSeguro("#7c3aed")).toBeNull();
    const { html } = mensaje();
    expect(html).toContain("border-top:3px solid #123456");
  });

  it("omite categoría y temporada cuando no existen", () => {
    const { text } = mensaje({ categoria: null, temporada: "  " });
    expect(text).not.toContain("Categoría:");
    expect(text).not.toContain("Temporada:");
    expect(text).toContain("Club: Hack Pádel");
  });
});
