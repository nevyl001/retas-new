/** Visible solo cuando reset_torneo_express_grupo puede correr. */
export function puedeReiniciarFaseDeGrupos(input: {
  faseTorneo: string;
  estado: string;
  eliminatoriaCount: number;
  gruposCount: number;
}): boolean {
  return (
    input.faseTorneo === "grupos" &&
    input.estado !== "finalizado" &&
    input.eliminatoriaCount === 0 &&
    input.gruposCount > 0
  );
}

export const RESET_FASE_STALE_COPY =
  "El grupo cambió mientras estabas confirmando. Actualizamos la información; vuelve a intentar.";

export function resetFaseErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === "STALE_GROUP_VERSION") return RESET_FASE_STALE_COPY;
    if (code === "GROUP_NOT_EDITABLE") {
      return "No se puede reiniciar: la categoría está cerrada, finalizada o ya tiene eliminatoria.";
    }
    if (code === "GROUP_NOT_FOUND") return "No se encontró el grupo.";
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return "No se pudo reiniciar la fase de grupos.";
}
