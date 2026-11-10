import {
  esComunicacionOperativaHistorial,
  esExclusionElegibilidadHistorial,
  esMotivoExclusionElegibilidad,
  etiquetaEntregaComunicacion,
  etiquetaMotivoExclusionCorta,
  resumenElegibilidadDestinatarios,
} from "./historialComunicaciones";

describe("historialComunicaciones", () => {
  it("clasifica exclusiones de elegibilidad sin mezclarlas con operativas", () => {
    expect(esMotivoExclusionElegibilidad("sin_correo")).toBe(true);
    expect(esMotivoExclusionElegibilidad("correo_ambiguo")).toBe(true);
    expect(esMotivoExclusionElegibilidad("cancelado")).toBe(false);

    expect(
      esExclusionElegibilidadHistorial({
        estado: "omitido",
        motivo: "sin_correo",
      })
    ).toBe(true);
    expect(
      esComunicacionOperativaHistorial({
        estado: "omitido",
        motivo: "cancelado",
      })
    ).toBe(true);
    expect(
      esComunicacionOperativaHistorial({
        estado: "pendiente",
        motivo: null,
      })
    ).toBe(true);
    expect(
      esComunicacionOperativaHistorial({
        estado: "enviado",
        motivo: null,
      })
    ).toBe(true);
  });

  it("etiqueta estados operativos y exclusiones de forma clara", () => {
    expect(etiquetaEntregaComunicacion("pendiente", null, null)).toBe(
      "Pendiente"
    );
    expect(etiquetaEntregaComunicacion("procesando", null, null)).toBe(
      "Procesando"
    );
    expect(etiquetaEntregaComunicacion("enviado", "aceptado", null)).toBe(
      "Aceptado"
    );
    expect(etiquetaEntregaComunicacion("error", null, null)).toBe("Error");
    expect(
      etiquetaEntregaComunicacion("omitido", null, "recordatorio_vencido")
    ).toBe("Cancelado");
    expect(etiquetaEntregaComunicacion("omitido", null, "sin_correo")).toBe(
      "Excluido"
    );
  });

  it("resume elegibles y excluidos con la misma regla visual del panel", () => {
    expect(
      resumenElegibilidadDestinatarios([
        { visual: "habilitado" },
        { visual: "habilitado" },
        { visual: "sin_correo" },
        { visual: "correo_ambiguo" },
      ])
    ).toEqual({ elegibles: 2, excluidos: 2, total: 4 });
  });

  it("expone motivos cortos sin datos personales", () => {
    expect(etiquetaMotivoExclusionCorta("sin_autorizacion")).toBe(
      "Sin autorización"
    );
    expect(etiquetaMotivoExclusionCorta("correo_invalido")).toBe(
      "Correo inválido"
    );
  });
});
