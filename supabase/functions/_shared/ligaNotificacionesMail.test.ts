import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isFakeOrInvalidEmail,
  renderBienvenidaWorker,
  renderComunicacionWorker,
  renderVerificacionWorker,
  resolveLigaMailBrandingWorker,
} from "./ligaNotificacionesMail.ts";

Deno.test("1. Render con club con branding completo (Hack Pádel)", () => {
  const branding = resolveLigaMailBrandingWorker({
    clubNombre: "Hack Pádel",
    brandingKey: "hack-padel",
    premiumBrandingEnabled: true,
    appBaseUrl: "https://appriviera.rivieraopen.com",
  });

  assertEquals(branding.isClubBranded, true);
  assertEquals(branding.brandSupportLabel, "by Riviera Open");
  assertEquals(branding.brandAccentColor, "#BFFF00");
  assertStringIncludes(branding.brandLogoUrl ?? "", "brands/hack-padel/logo-transparent.png");

  const mail = renderBienvenidaWorker({
    clubNombre: branding.brandName,
    ligaNombre: "Liga 5ta Advance",
    jugadorNombre: "Edgardo T",
    perfilUrl: "https://appriviera.rivieraopen.com/players/p-123",
    ligaUrl: "https://appriviera.rivieraopen.com/public/liga/l-456",
    branding,
  });

  assertStringIncludes(mail.asunto, "Bienvenido a Liga 5ta Advance");
  assertStringIncludes(mail.html, "brands/hack-padel/logo-transparent.png");
  assertStringIncludes(mail.html, "by Riviera Open");
  assertStringIncludes(mail.html, "Liga 5ta Advance");
  assertStringIncludes(mail.html, "Edgardo T");
  assertStringIncludes(mail.html, "#BFFF00");
  assertStringIncludes(mail.html, "VER MI PERFIL");
  assertStringIncludes(mail.html, "Enviado por Hack Pádel");
  assertStringIncludes(mail.html, "Gestionado con Riviera Open");
  assertStringIncludes(mail.text, "Hack Pádel");
});

Deno.test("2. Render con club sin logo (monograma y badge sobrio)", () => {
  const branding = resolveLigaMailBrandingWorker({
    clubNombre: "Club Deportivo Padel San Juan",
    brandingKey: null,
    appBaseUrl: "https://appriviera.rivieraopen.com",
  });

  assertEquals(branding.isClubBranded, true);
  assertEquals(branding.brandLogoUrl, null);
  assertEquals(branding.initials, "CDP");
  assertEquals(branding.brandSupportLabel, "by Riviera Open");

  const mail = renderComunicacionWorker({
    clubNombre: branding.brandName,
    ligaNombre: "Liga Nocturna",
    asunto: "Aviso de jornada 3",
    cuerpoTexto: "Hola jugadores,\n\nLa jornada se reprograma para el sábado.",
    branding,
  });

  assertStringIncludes(mail.html, "CDP");
  assertStringIncludes(mail.html, "Club Deportivo Padel San Juan");
  assertStringIncludes(mail.html, "by Riviera Open");
  assertStringIncludes(mail.html, "Aviso de jornada 3");
  assertStringIncludes(mail.html, "La jornada se reprograma para el sábado.");
  assertStringIncludes(mail.html, "Enviado por Club Deportivo Padel San Juan");
});

Deno.test("3. Render con club sin colores configurados (paleta oscura premium por defecto)", () => {
  const branding = resolveLigaMailBrandingWorker({
    clubNombre: "Padel Point",
    brandingKey: null,
  });

  assertEquals(branding.brandPrimaryColor, "#15191F");
  assertEquals(branding.brandSecondaryColor, "#232830");
  assertEquals(branding.brandAccentColor, "#BFFF00");

  const mail = renderVerificacionWorker({
    clubNombre: branding.brandName,
    ligaNombre: "Torneo Primavera",
    jugadorNombre: "Carlos M",
    verificarUrl: "https://appriviera.rivieraopen.com/public/verificar-correo?t=xyz",
    branding,
  });

  assertStringIncludes(mail.html, "Padel Point");
  assertStringIncludes(mail.html, "VERIFICAR MI CORREO");
  assertStringIncludes(mail.html, "Confirma tu correo electrónico");
  assertStringIncludes(mail.html, "Torneo Primavera");
});

Deno.test("4. Render directo desde Riviera Open (sin redundancia de co-branding)", () => {
  const branding = resolveLigaMailBrandingWorker({
    clubNombre: "Riviera Open",
    brandingKey: "riviera",
  });

  assertEquals(branding.isClubBranded, false);
  assertEquals(branding.brandSupportLabel, "");
  assertEquals(branding.brandName, "Riviera Open");

  const mail = renderBienvenidaWorker({
    clubNombre: branding.brandName,
    ligaNombre: "Liga Riviera Master",
    jugadorNombre: "Laura G",
    perfilUrl: "https://appriviera.rivieraopen.com/players/laura",
    ligaUrl: "https://appriviera.rivieraopen.com/public/liga/master",
    branding,
  });

  // No debe aparecer "Riviera Open by Riviera Open"
  const matches = mail.html.match(/by Riviera Open/g);
  assertEquals(matches, null);
  assertStringIncludes(mail.html, "Enviado por Riviera Open");
  assertStringIncludes(mail.html, "Gestionado con Riviera Open");
});

Deno.test("5. Compatibilidad móvil y estructura segura de email", () => {
  const mail = renderComunicacionWorker({
    clubNombre: "Hack Pádel",
    ligaNombre: "Liga 5ta Advance",
    asunto: "Bienvenido",
    cuerpoTexto: "Mensaje de prueba para verificar viewport y tablas.",
  });

  assertStringIncludes(mail.html, 'name="viewport"');
  assertStringIncludes(mail.html, "max-width:600px");
  assertStringIncludes(mail.html, 'role="presentation"');
  assertEquals(mail.html.includes("display:flex"), false);
  assertEquals(mail.html.includes("display:grid"), false);
});

Deno.test("6. Textos largos y escape estricto de HTML sin romper layout", () => {
  const mail = renderComunicacionWorker({
    clubNombre: "Club <Acento & Más>",
    ligaNombre: "Liga <Prueba>",
    asunto: "Asunto con <script>alert(1)</script> y caracteres especiales",
    cuerpoTexto:
      "Línea 1 con <b style='color:red;'>HTML no permitido</b>.\n\n" +
      "Párrafo 2 con texto extremadamente largo que simula un anuncio detallado con normas del torneo, código de conducta, instrucciones de estacionamiento y datos de contacto sin romper la tabla ni desbordar el contenedor de 600px de ancho.",
  });

  assertEquals(mail.html.includes("<script>"), false);
  assertEquals(mail.html.includes("alert(1)"), true);
  assertStringIncludes(mail.html, "&lt;script&gt;");
  assertStringIncludes(mail.html, "&lt;Prueba&gt;");
  assertStringIncludes(mail.html, "Párrafo 2 con texto extremadamente largo");
});

Deno.test("7. Validación segura de correos", () => {
  assertEquals(isFakeOrInvalidEmail("edgardo@gmail.com"), false);
  assertEquals(isFakeOrInvalidEmail("jugador@padel.local"), true);
  assertEquals(isFakeOrInvalidEmail(null), true);
  assertEquals(isFakeOrInvalidEmail(""), true);
  assertEquals(isFakeOrInvalidEmail("no-es-correo"), true);
});

Deno.test("8. Render de Próxima Jornada en worker (tarjeta estructurada, botón VER MI JORNADA y cierre oficial)", () => {
  const mail = renderComunicacionWorker({
    clubNombre: "Hack Pádel",
    ligaNombre: "Liga 5ta Advance",
    asunto: "¡Tu próxima jornada te espera! — Liga 5ta Advance",
    cuerpoTexto:
      "Hola Edgardo T,\n\n¡La emoción continúa en Liga 5ta Advance!\n\nUna nueva jornada está por comenzar.\n\nFecha: Sábado 15 de Noviembre\nHorario: 10:00 AM\nSede: Hack Pádel",
    tipo: "jornada",
    ligaUrl: "https://appriviera.rivieraopen.com/public/liga/liga-123",
  });

  assertStringIncludes(mail.html, "¡Tu próxima jornada te espera!");
  assertStringIncludes(mail.html, "FECHA");
  assertStringIncludes(mail.html, "Sábado 15 de Noviembre");
  assertStringIncludes(mail.html, "HORARIO");
  assertStringIncludes(mail.html, "10:00 AM");
  assertStringIncludes(mail.html, "SEDE");
  assertStringIncludes(mail.html, "Hack Pádel");
  assertStringIncludes(mail.html, "VER MI JORNADA");
  assertStringIncludes(mail.html, "https://appriviera.rivieraopen.com/public/liga/liga-123");
  assertStringIncludes(mail.html, "RIVIERA OPEN");
  assertStringIncludes(mail.html, "Compite. Juega limpio. Vive Riviera Open.");
  assertStringIncludes(mail.html, "Cada partido cuenta.");
  assertStringIncludes(mail.html, "#0D0F12");
  assertStringIncludes(mail.html, "max-width:640px");

  assertStringIncludes(mail.text, "TARJETA DE JORNADA:");
  assertStringIncludes(mail.text, "VER MI JORNADA: https://appriviera.rivieraopen.com/public/liga/liga-123");
});

