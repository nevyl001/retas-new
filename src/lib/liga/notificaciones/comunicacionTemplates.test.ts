import {
  PLANTILLAS_COMUNICACION,
  jornadaEnCursoParaCorreo,
  plantillaPorId,
  renderComunicacionEmail,
  resolverVariablesComunicacion,
  rutaPublicaJornada,
} from "./comunicacionTemplates";

describe("comunicacionTemplates", () => {
  it("elige la jornada en curso y, si no hay, la próxima", () => {
    expect(
      jornadaEnCursoParaCorreo([
        { numero: 2, estado: "completed" },
        { numero: 4, estado: "upcoming" },
        { numero: 3, estado: "in_progress" },
      ])
    ).toEqual({ numero: 3, estado: "in_progress" });
    expect(
      jornadaEnCursoParaCorreo([
        { numero: 5, estado: "upcoming" },
        { numero: 4, estado: "upcoming" },
        { numero: 1, estado: "completed" },
      ])
    ).toEqual({ numero: 4, estado: "upcoming" });
    expect(
      jornadaEnCursoParaCorreo([{ numero: 1, estado: "completed" }])
    ).toBeNull();
    expect(rutaPublicaJornada("liga-1", 3)).toBe(
      "/public/liga/liga-1/jornada/3"
    );
  });

  it("resuelve variables sin inyectar HTML", () => {
    const out = resolverVariablesComunicacion(
      "Hola {{nombre}} — {{liga}} / {{club}}",
      { nombre: "Ana <b>", liga: "Liga X", club: "Club Y" }
    );
    expect(out).toContain("Ana <b>");
    const view = renderComunicacionEmail({
      clubNombre: "Club Y",
      ligaNombre: "Liga X",
      jugadorNombre: "Ana <script>",
      asunto: "Hola {{nombre}}",
      cuerpo: "Mensaje para {{nombre}} en {{liga}}",
      vistaPrevia: true,
    });
    expect(view.html).toContain("VISTA PREVIA");
    expect(view.html).toContain("Ana &lt;script&gt;");
    expect(view.html).not.toContain("<script>");
    expect(view.subject).toContain("Ana <script>");
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
      const view = renderComunicacionEmail({
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
        jornadaUrl: "https://appriviera.rivieraopen.com/public/liga/liga-123/jornada/4",
      });

      // 1. Jerarquía y títulos
      expect(view.html).toContain("¡Tu próxima jornada te espera!");
      expect(view.html).toContain("Liga 5ta Advance");
      expect(view.html).toContain("Hola Edgardo T,");

      // 2. Tarjeta de información de jornada
      expect(view.html).toContain("FECHA");
      expect(view.html).toContain("Sábado 15 de Noviembre");
      expect(view.html).toContain("HORARIO");
      expect(view.html).toContain("10:00 AM");
      expect(view.html).toContain("SEDE");
      expect(view.html).toContain("Hack Pádel");

      // 3. Botón de acción con URL real
      expect(view.html).toContain("VER MI JORNADA");
      expect(view.html).toContain(
        'href="https://appriviera.rivieraopen.com/public/liga/liga-123/jornada/4"'
      );

      // 4. Cierre oficial
      expect(view.html).toContain("RIVIERA OPEN");
      expect(view.html).toContain("Compite. Juega limpio. Vive Riviera Open.");
      expect(view.html).toContain("Cada partido cuenta.");

      // 5. Co-branding y cabecera negra
      expect(view.html).toContain("#0D0F12");
      expect(view.html).toContain("by Riviera Open");
      expect(view.html).toContain("max-width:640px");

      // 6. Ausencia de Markdown visible
      expect(view.html).not.toContain("##");
      expect(view.html).not.toContain("**");

      // 7. Versión en texto plano completa
      expect(view.text).toContain("¡Tu próxima jornada te espera!");
      expect(view.text).toContain("TARJETA DE JORNADA:");
      expect(view.text).toContain(
        "VER MI JORNADA: https://appriviera.rivieraopen.com/public/liga/liga-123/jornada/4"
      );
      expect(view.text).toContain("Compite. Juega limpio. Vive Riviera Open.");
    });

    it("omite el botón si la única dirección es la de la liga", () => {
      const plantilla = plantillaPorId("jornada");
      const view = renderComunicacionEmail({
        clubNombre: "Hack Pádel",
        ligaNombre: "Liga 5ta Advance",
        jugadorNombre: "Edgardo T",
        asunto: plantilla.asunto,
        cuerpo: plantilla.cuerpo,
        vistaPrevia: false,
        tipo: "jornada",
        ligaUrl: "https://appriviera.rivieraopen.com/public/liga/liga-123",
      });

      expect(view.html).not.toContain("VER MI JORNADA");
      expect(view.html).toContain("Ver la liga");
    });

    it("omite el botón si no hay jornada pública", () => {
      const plantilla = plantillaPorId("jornada");
      const view = renderComunicacionEmail({
        clubNombre: "Hack Pádel",
        ligaNombre: "Liga 5ta Advance",
        jugadorNombre: "Edgardo T",
        asunto: plantilla.asunto,
        cuerpo: plantilla.cuerpo,
        vistaPrevia: false,
        tipo: "jornada",
      });

      expect(view.html).not.toContain("VER MI JORNADA");
    });
  });
});
