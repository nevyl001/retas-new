export type DueloMobileTabId = "resumen" | "equipos" | "partidos" | "resultado";

export type DueloNextAction = {
  label: string;
  tabId: DueloMobileTabId;
};

export function resolveDueloStatusLabel(input: {
  finalizado: boolean;
}): { label: string; variant: "live" | "pending" | "gold" | "muted" } {
  if (input.finalizado) return { label: "Finalizado", variant: "gold" };
  return { label: "En curso", variant: "live" };
}

export function resolveDueloNextAction(input: {
  finalizado: boolean;
  hasGanador: boolean;
}): DueloNextAction | null {
  if (input.finalizado) {
    return { label: "Ver resultado", tabId: "resultado" };
  }
  if (!input.hasGanador) {
    return { label: "Registrar marcador", tabId: "partidos" };
  }
  return { label: "Finalizar duelo", tabId: "partidos" };
}

export function resolveDueloSummary(input: {
  teamAName: string;
  teamBName: string;
  setsA: number;
  setsB: number;
  finalizado: boolean;
}): string {
  const marcador = `${input.setsA} – ${input.setsB}`;
  if (input.finalizado) {
    return `${input.teamAName} vs ${input.teamBName} · ${marcador}`;
  }
  return `${input.teamAName} vs ${input.teamBName}`;
}
