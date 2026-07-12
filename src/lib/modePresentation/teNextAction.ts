export type TeMobileTabId =
  | "resumen"
  | "grupos"
  | "partidos"
  | "eliminacion"
  | "configuracion";

export type TeNextAction = {
  label: string;
  tabId: TeMobileTabId;
};

export function resolveTeStatusLabel(input: {
  faseTorneo: string;
  estado: string;
}): { label: string; variant: "live" | "pending" | "gold" | "muted" } {
  if (input.estado === "finalizado" || input.faseTorneo === "cerrado") {
    return { label: "Finalizado", variant: "gold" };
  }
  if (input.faseTorneo === "eliminatoria") {
    return { label: "Eliminatoria", variant: "live" };
  }
  if (input.estado === "en_curso") {
    return { label: "En curso", variant: "live" };
  }
  return { label: "Pendiente", variant: "pending" };
}

export function resolveTeNextAction(input: {
  faseTorneo: string;
  estado: string;
  puedeFinalizarTorneo: boolean;
  hasPendingGrupoPartidos: boolean;
  allGruposCompletos?: boolean;
}): TeNextAction | null {
  if (input.estado === "finalizado" || input.faseTorneo === "cerrado") {
    return { label: "Revisar clasificación", tabId: "grupos" };
  }

  if (input.faseTorneo === "eliminatoria") {
    if (input.puedeFinalizarTorneo) {
      return { label: "Finalizar torneo", tabId: "configuracion" };
    }
    return { label: "Registrar resultados", tabId: "eliminacion" };
  }

  if (input.hasPendingGrupoPartidos) {
    return { label: "Registrar resultados", tabId: "partidos" };
  }

  if (
    input.faseTorneo === "grupos" &&
    input.allGruposCompletos &&
    input.estado !== "finalizado"
  ) {
    return { label: "Finalizar fase", tabId: "configuracion" };
  }

  if (input.faseTorneo === "grupos") {
    return { label: "Revisar clasificación", tabId: "grupos" };
  }

  return null;
}

export function resolveTeSummary(input: {
  gruposCount: number;
  faseTorneo: string;
  estado: string;
}): string {
  const fase =
    input.faseTorneo === "eliminatoria"
      ? "Eliminatoria"
      : input.faseTorneo === "cerrado"
        ? "Cerrado"
        : "Fase de grupos";
  const estado =
    input.estado === "finalizado"
      ? "finalizado"
      : input.estado === "en_curso"
        ? "en curso"
        : "pendiente";
  return `${input.gruposCount} grupos · ${fase} · ${estado}`;
}
