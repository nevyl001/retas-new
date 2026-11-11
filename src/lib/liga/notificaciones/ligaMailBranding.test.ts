import {
  getClubInitials,
  resolveLigaMailBranding,
} from "./ligaMailBranding";
import { renderComunicacionEmail } from "./comunicacionTemplates";
import { renderBienvenidaEmail } from "./bienvenidaTemplate";
import { renderVerificacionEmail } from "./verificacionTemplate";

describe("Rediseño Premium de Templates de Correo", () => {
  it("1. Render de correo con club con branding completo (ej. Hack Pádel)", () => {
    const branding = resolveLigaMailBranding({
      clubNombre: "Hack Pádel",
      logoUrl: "https://appriviera.rivieraopen.com/brands/hack-padel/logo-transparent.png",
      acentoHex: "#bfff00",
      manifest: {
        id: "hack-padel",
        brandingKey: "hack-padel",
        active: true,
        displayName: "Hack Pádel",
        colors: {
          primary: "#000000",
          secondary: "#4c4c4c",
          accent: "#bfff00",
          text: "#ffffff",
          surface: "#000000",
          surfaceAlt: "#0f0f0f",
          border: "#4c4c4c",
          muted: "#4c4c4c",
          success: "#bfff00",
          warning: "#fbbf24",
          danger: "#f87171",
        },
      } as any,
    });

    expect(branding.isClubBranded).toBe(true);
    expect(branding.brandSupportLabel).toBe("by Riviera Open");
    expect(branding.brandAccentColor).toBe("#bfff00");

    const email = renderBienvenidaEmail({
      clubNombre: "Hack Pádel",
      logoUrl: branding.brandLogoUrl,
      acentoHex: branding.brandAccentColor,
      ligaNombre: "Liga 5ta Advance",
      jugadorNombre: "Edgardo T",
      categoria: "5ta Advance",
      temporada: "2026",
      perfilUrl: "https://appriviera.rivieraopen.com/players/p-123",
      ligaUrl: "https://appriviera.rivieraopen.com/public/liga/l-456",
      footerLine: null,
      vistaPrevia: false,
      branding,
    });

    expect(email.asunto).toBe("Bienvenido a Liga 5ta Advance");
    expect(email.html).toContain("brands/hack-padel/logo-transparent.png");
    expect(email.html).toContain("by Riviera Open");
    expect(email.html).toContain("Liga 5ta Advance");
    expect(email.html).toContain("Edgardo T");
    expect(email.html).toContain("#bfff00");
    expect(email.html).toContain("VER MI PERFIL");
    expect(email.html).toContain("Enviado por Hack Pádel");
    expect(email.html).toContain("Gestionado con Riviera Open");
  });

  it("2. Render de correo con club sin logo (monograma y badge tipográfico)", () => {
    const branding = resolveLigaMailBranding({
      clubNombre: "Club Deportivo Padel San Juan",
      logoUrl: null,
      acentoHex: null,
    });

    expect(branding.isClubBranded).toBe(true);
    expect(branding.brandLogoUrl).toBeNull();
    expect(branding.initials).toBe("CDP");
    expect(branding.brandSupportLabel).toBe("by Riviera Open");

    const email = renderComunicacionEmail({
      clubNombre: "Club Deportivo Padel San Juan",
      ligaNombre: "Liga Nocturna",
      jugadorNombre: "Carlos",
      asunto: "Aviso de {{liga}}",
      cuerpo: "Hola {{nombre}},\n\nPróxima fecha confirmada para el viernes.",
      vistaPrevia: false,
      branding,
    });

    expect(email.html).toContain("CDP");
    expect(email.html).toContain("Club Deportivo Padel San Juan");
    expect(email.html).toContain("by Riviera Open");
    expect(email.html).toContain("Aviso de Liga Nocturna");
    expect(email.html).toContain("Próxima fecha confirmada para el viernes.");
    expect(email.html).toContain("Enviado por Club Deportivo Padel San Juan");
  });

  it("3. Render de correo con club sin colores configurados (paleta oscura premium por defecto)", () => {
    const branding = resolveLigaMailBranding({
      clubNombre: "Padel Point",
      logoUrl: null,
      acentoHex: null,
    });

    expect(branding.brandPrimaryColor).toBe("#15191F");
    expect(branding.brandSecondaryColor).toBe("#232830");
    expect(branding.brandAccentColor).toBe("#BFFF00");

    const email = renderVerificacionEmail({
      clubNombre: "Padel Point",
      logoUrl: null,
      acentoHex: null,
      ligaNombre: "Torneo Primavera",
      jugadorNombre: "Carlos M",
      verificarUrl: "https://appriviera.rivieraopen.com/public/verificar-correo?t=xyz",
      footerLine: null,
      vistaPrevia: false,
      branding,
    });

    expect(email.html).toContain("Padel Point");
    expect(email.html).toContain("VERIFICAR MI CORREO");
    expect(email.html).toContain("Confirma tu correo electrónico");
    expect(email.html).toContain("Torneo Primavera");
  });

  it("4. Render directo desde Riviera Open (sin redundancia de co-branding)", () => {
    const branding = resolveLigaMailBranding({
      clubNombre: "Riviera Open",
    });

    expect(branding.isClubBranded).toBe(false);
    expect(branding.brandSupportLabel).toBe("");
    expect(branding.brandName).toBe("Riviera Open");

    const email = renderBienvenidaEmail({
      clubNombre: "Riviera Open",
      logoUrl: null,
      acentoHex: null,
      ligaNombre: "Liga Riviera Master",
      jugadorNombre: "Laura G",
      categoria: "Master",
      temporada: "2026",
      perfilUrl: "https://appriviera.rivieraopen.com/players/laura",
      ligaUrl: "https://appriviera.rivieraopen.com/public/liga/master",
      footerLine: null,
      vistaPrevia: false,
      branding,
    });

    // No debe aparecer "Riviera Open by Riviera Open"
    expect(email.html).not.toContain("by Riviera Open");
    expect(email.html).toContain("Enviado por Riviera Open");
    expect(email.html).toContain("Gestionado con Riviera Open");
  });

  it("5. Compatibilidad móvil (layout centrado, responsive, max-width 640px, sin flex/grid)", () => {
    const email = renderComunicacionEmail({
      clubNombre: "Hack Pádel",
      ligaNombre: "Liga 5ta Advance",
      jugadorNombre: "Edgardo",
      asunto: "Bienvenido",
      cuerpo: "Mensaje para verificar viewport y tablas.",
      vistaPrevia: false,
    });

    expect(email.html).toContain('name="viewport"');
    expect(email.html).toContain("max-width:640px");
    expect(email.html).toContain('role="presentation"');
    expect(email.html).not.toContain("display:flex");
    expect(email.html).not.toContain("display:grid");
  });

  it("6. Textos largos no rompen el layout y se escapan correctamente", () => {
    const email = renderComunicacionEmail({
      clubNombre: "Club <Acento & Más>",
      ligaNombre: "Liga <Prueba>",
      jugadorNombre: "Jugador <X>",
      asunto: "Asunto con <script>alert(1)</script> y caracteres especiales",
      cuerpo:
        "Línea 1 con <b style='color:red;'>HTML no permitido</b>.\n\n" +
        "Párrafo 2 con texto extremadamente largo que simula un anuncio detallado con normas del torneo, código de conducta, instrucciones de estacionamiento y datos de contacto sin romper la tabla ni desbordar el contenedor de 600px de ancho.",
      vistaPrevia: true,
    });

    expect(email.html).toContain("VISTA PREVIA");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).toContain("&lt;Prueba&gt;");
    expect(email.html).toContain("Párrafo 2 con texto extremadamente largo");
  });

  it("7. getClubInitials genera iniciales correctas para distintos tipos de nombres", () => {
    expect(getClubInitials("Hack Pádel")).toBe("HP");
    expect(getClubInitials("Padel Court Series")).toBe("PCS");
    expect(getClubInitials("Acapulco Padel Tour")).toBe("APT");
    expect(getClubInitials("Valvidub Sports")).toBe("VS");
    expect(getClubInitials("Tenis")).toBe("TE");
    expect(getClubInitials("")).toBe("RO");
  });
});

