/** Clasifica filas de cola/historial: comunicaciones operativas vs exclusiones de elegibilidad. */

export const MOTIVOS_EXCLUSION_ELEGIBILIDAD = [
  "deshabilitado",
  "sin_autorizacion",
  "sin_correo",
  "correo_invalido",
  "correo_ambiguo",
] as const;

export type MotivoExclusionElegibilidad =
  (typeof MOTIVOS_EXCLUSION_ELEGIBILIDAD)[number];

const MOTIVOS_CICLO_OPERATIVO = new Set([
  "cancelado",
  "automatizacion_apagada",
  "recordatorio_vencido",
  "jornada_sin_horario",
  "horarios_distintos",
  "plantilla_incompleta",
  "sin_url_publica",
]);

export function normalizarMotivoNotificacion(
  motivo: string | null | undefined
): string {
  return (motivo ?? "").trim().toLowerCase();
}

export function esMotivoExclusionElegibilidad(
  motivo: string | null | undefined
): boolean {
  const clave = normalizarMotivoNotificacion(motivo);
  return (MOTIVOS_EXCLUSION_ELEGIBILIDAD as readonly string[]).includes(clave);
}

/** Omitidos/pausados por no elegibilidad: no van al historial operativo. */
export function esExclusionElegibilidadHistorial(input: {
  estado: string;
  motivo?: string | null;
}): boolean {
  if (input.estado !== "omitido" && input.estado !== "pausado") return false;
  return esMotivoExclusionElegibilidad(input.motivo);
}

export function esComunicacionOperativaHistorial(input: {
  estado: string;
  motivo?: string | null;
}): boolean {
  return !esExclusionElegibilidadHistorial(input);
}

export function etiquetaEntregaComunicacion(
  estado: string,
  proveedor: string | null | undefined,
  motivo?: string | null
): string {
  if (proveedor === "entregado") return "Entregado";
  if (estado === "enviado" || proveedor === "aceptado") return "Aceptado";
  if (estado === "procesando") return "Procesando";
  if (estado === "pendiente" && motivo === "error_temporal") {
    return "Pendiente de reintento";
  }
  if (estado === "pendiente") {
    return "Pendiente";
  }
  if (estado === "error") return "Error";
  if (estado === "omitido" || estado === "pausado") {
    const clave = normalizarMotivoNotificacion(motivo);
    if (MOTIVOS_CICLO_OPERATIVO.has(clave)) return "Cancelado";
    if (esMotivoExclusionElegibilidad(clave)) return "Excluido";
    return "Omitido";
  }
  return estado;
}

export function resumenElegibilidadDestinatarios(
  visuales: Array<{ visual: string }>
): { elegibles: number; excluidos: number; total: number } {
  const elegibles = visuales.filter((fila) => fila.visual === "habilitado").length;
  const total = visuales.length;
  return {
    elegibles,
    excluidos: Math.max(0, total - elegibles),
    total,
  };
}

export function etiquetaMotivoExclusionCorta(
  motivo: string | null | undefined
): string {
  switch (normalizarMotivoNotificacion(motivo)) {
    case "sin_correo":
      return "Sin correo";
    case "correo_invalido":
      return "Correo inválido";
    case "correo_ambiguo":
      return "Correo ambiguo";
    case "sin_autorizacion":
      return "Sin autorización";
    case "deshabilitado":
      return "Deshabilitado";
    default:
      return "No elegible";
  }
}
