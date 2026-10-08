import {
  buildNuevoGrupoPartidos,
  nextGrupoNombre,
  nextGrupoOrden,
  validateNuevoGrupo,
} from "./nuevoGrupo";

describe("nextGrupoNombre", () => {
  it("continúa la secuencia de letras", () => {
    expect(nextGrupoNombre(["Grupo A", "Grupo B", "Grupo C"])).toBe("Grupo D");
  });

  it("ignora huecos y mayúsculas", () => {
    expect(nextGrupoNombre(["grupo a", "GRUPO C"])).toBe("Grupo D");
  });

  it("con nombres personalizados sigue por cantidad sin repetir", () => {
    expect(nextGrupoNombre(["Norte", "Sur"])).toBe("Grupo C");
    expect(nextGrupoNombre([])).toBe("Grupo A");
  });
});

describe("nextGrupoOrden", () => {
  it("devuelve el siguiente orden libre", () => {
    expect(nextGrupoOrden([1, 2, 3])).toBe(4);
    expect(nextGrupoOrden([])).toBe(1);
  });
});

describe("validateNuevoGrupo", () => {
  const base = { nombre: "Grupo D", existingNames: ["Grupo A"], parejaCount: 2 };

  it("acepta un grupo válido", () => {
    expect(validateNuevoGrupo(base)).toBeNull();
  });

  it("rechaza nombre vacío, repetido o con pocas parejas", () => {
    expect(validateNuevoGrupo({ ...base, nombre: "  " })).toMatch(/nombre/i);
    expect(validateNuevoGrupo({ ...base, nombre: " grupo  a " })).toMatch(
      /ya existe/i
    );
    expect(validateNuevoGrupo({ ...base, parejaCount: 1 })).toMatch(/al menos 2/);
  });
});

describe("buildNuevoGrupoPartidos", () => {
  it("genera todos contra todos sin horario", () => {
    const rows = buildNuevoGrupoPartidos(["a", "b", "c"]);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.estado).toBe("pendiente");
      expect(row.cancha).toBeNull();
      expect(row.programado_en).toBeNull();
    }
    const keys = new Set(
      rows.map((r) => [r.pareja_local_id, r.pareja_visitante_id].sort().join("|"))
    );
    expect(keys.size).toBe(3);
  });
});
