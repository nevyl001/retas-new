import {
  PLANTILLAS_COMUNICACION,
  plantillaPorId,
  renderComunicacionEmail,
  resolverVariablesComunicacion,
} from "./comunicacionTemplates";

describe("comunicacionTemplates", () => {
  it("resuelve variables sin inyectar HTML", () => {
    const out = resolverVariablesComunicacion(
      "Hola {{nombre}} — {{liga}} / {{club}}",
      { nombre: "Ana <b>", liga: "Liga X", club: "Club Y" }
    );
    expect(out).toContain("Ana <b>");
    const mail = renderComunicacionEmail({
      clubNombre: "Club Y",
      ligaNombre: "Liga X",
      jugadorNombre: "Ana <script>",
      asunto: "Hola {{nombre}}",
      cuerpo: "Mensaje para {{nombre}} en {{liga}}",
      vistaPrevia: true,
    });
    expect(mail.html).toContain("VISTA PREVIA");
    expect(mail.html).toContain("Ana &lt;script&gt;");
    expect(mail.html).not.toContain("<script>");
    expect(mail.subject).toContain("Ana <script>");
  });

  it("expone las plantillas iniciales del producto", () => {
    expect(PLANTILLAS_COMUNICACION.map((item) => item.id)).toEqual([
      "bienvenida",
      "aviso_general",
      "jornada",
      "cambio_horario",
      "felicitacion",
      "personalizado",
    ]);
    expect(plantillaPorId("jornada").label).toMatch(/jornada/i);
    expect(plantillaPorId("jornada").asunto).toMatch(/jornada/i);
  });

  describe("Plantilla Premium de Próxima Jornada", () => {
    it("sustituye todas las 5 variables dinámicas (nombre, liga, club, fecha, horario) sin dejar placeholders", () => {
      const plantilla = plantillaPorId("jornada");
      const resuelto = resolverVariablesComunicacion(plantilla.cuerpo, {
        nombre: "Edgardo T",
        liga: "Liga 5ta Advance",
        club: "Hack Pádel",
        fecha: "Sábado 15 de Noviembre",
        horario: "10:00 AM",
      });

      expect(resuelto).toContain("Edgardo T");
      expect(resuelto).toContain("Liga 5ta Advance");
      expect(resuelto).toContain("Hack Pádel");
      expect(resuelto).toContain("Sábado 15 de Noviembre");
      expect(resuelto).toContain("10:00 AM");
      expect(resuelto).not.toMatch(/\{\{\s*(?:nombre|liga|club|fecha|horario)\s*\}\}/i);
    });

    it("usa fallback 'Por definir' cuando fecha u horario no se especifican", () => {
      const plantilla = plantillaPorId("jornada");
      const resuelto = resolverVariablesComunicacion(plantilla.cuerpo, {
        nombre: "Edgardo T",
        liga: "Liga 5ta Advance",
        club: "Hack Pádel",
      });

      expect(resuelto).toContain("Fecha: Por definir");
      expect(resuelto).toContain("Horario: Por definir");
      expect(resuelto).not.toMatch(/\{\{\s*fecha\s*\}\}/i);
      expect(resuelto).not.toMatch(/\{\{\s*horario\s*\}\}/i);
    });

    it("renderiza el HTML premium con tarjeta de jornada, botón de acción y cierre oficial sin markdown", () => {
      const plantilla = plantillaPorId("jornada");
      const mail = renderComunicacionEmail({
        clubNombre: "Hack Pádel",
        ligaNombre: "Liga 5ta Advance",
        jugadorNombre: "Edgardo T",
        asunto: plantilla.asunto,
        cuerpo: plantilla.cuerpo,
        vistaPrevia: false,
        tipo: "jornada",
        fecha: "Sábado 15 de Noviembre",
        horario: "10:00 AM",
        ligaUrl: "https://appriviera.rivieraopen.com/public/liga/liga-123",
      });

      // 1. Jerarquía y títulos
      expect(mail.html).toContain("¡Tu próxima jornada te espera!");
      expect(mail.html).toContain("Liga 5ta Advance");
      expect(mail.html).toContain("Hola Edgardo T,");

      // 2. Tarjeta de información de jornada
      expect(mail.html).toContain("FECHA");
      expect(mail.html).toContain("Sábado 15 de Noviembre");
      expect(mail.html).toContain("HORARIO");
      expect(mail.html).toContain("10:00 AM");
      expect(mail.html).toContain("SEDE");
      expect(mail.html).toContain("Hack Pádel");

      // 3. Botón de acción con URL real
      expect(mail.html).toContain("VER MI JORNADA");
      expect(mail.html).toContain("https://appriviera.rivieraopen.com/public/liga/liga-123");

      // 4. Cierre oficial
      expect(mail.html).toContain("RIVIERA OPEN");
      expect(mail.html).toContain("Compite. Juega limpio. Vive Riviera Open.");
      expect(mail.html).toContain("Cada partido cuenta.");

      // 5. Co-branding y cabecera negra
      expect(mail.html).toContain("#0D0F12");
      expect(mail.html).toContain("by Riviera Open");
      expect(mail.html).toContain("max-width:640px");

      // 6. Ausencia de Markdown visible
      expect(mail.html).not.toContain("##");
      expect(mail.html).not.toContain("**");

      // 7. Versión en texto plano completa
      expect(mail.text).toContain("¡Tu próxima jornada te espera!");
      expect(mail.text).toContain("TARJETA DE JORNADA:");
      expect(mail.text).toContain("VER MI JORNADA: https://appriviera.rivieraopen.com/public/liga/liga-123");
      expect(mail.text).toContain("Compite. Juega limpio. Vive Riviera Open.");
    });

    it("omite el botón si no hay ligaUrl válida", () => {
      const plantilla = plantillaPorId("jornada");
      const mail = renderComunicacionEmail({
        clubNombre: "Hack Pádel",
        ligaNombre: "Liga 5ta Advance",
        jugadorNombre: "Edgardo T",
        asunto: plantilla.asunto,
        cuerpo: plantilla.cuerpo,
        vistaPrevia: false,
        tipo: "jornada",
      });

      expect(mail.html).not.toContain("VER MI JORNADA");
    });
  });
});
