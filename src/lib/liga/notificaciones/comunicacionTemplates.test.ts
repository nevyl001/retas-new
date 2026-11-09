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
  });
});
