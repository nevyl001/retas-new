import {
  guardarPlantillaLiga,
  plantillaParaRedactar,
} from "./plantillasGuardadas";

describe("plantillas guardadas", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("guarda el texto de una plantilla y no pisa las demás", () => {
    expect(
      guardarPlantillaLiga(
        "liga-1",
        "bienvenida",
        "  Mi bienvenida  ",
        "Hola {{nombre}}"
      )
    ).toBe(true);
    expect(plantillaParaRedactar("liga-1", "bienvenida").asunto).toBe(
      "Mi bienvenida"
    );
    expect(plantillaParaRedactar("liga-1", "jornada").asunto).toMatch(/jornada/i);
    expect(plantillaParaRedactar("liga-2", "bienvenida").asunto).toBe(
      "Bienvenido a {{liga}}"
    );
  });

  it("un texto vacío no reemplaza la plantilla", () => {
    expect(guardarPlantillaLiga("liga-1", "bienvenida", "   ", "cuerpo")).toBe(
      false
    );
    expect(plantillaParaRedactar("liga-1", "bienvenida").cuerpo).toMatch(
      /bienvenida/i
    );
  });
});
