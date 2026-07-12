export type RetaMobileTabId =
  | "resumen"
  | "partidos"
  | "clasificacion"
  | "jugadores"
  | "configuracion";

export type RetaNextAction = {
  label: string;
  tabId: RetaMobileTabId;
};

export function resolveRetaStatusLabel(input: {
  is_started: boolean;
  is_finished: boolean;
}): { label: string; variant: "live" | "pending" | "gold" } {
  if (input.is_finished) return { label: "Finalizada", variant: "gold" };
  if (input.is_started) return { label: "En curso", variant: "live" };
  return { label: "Pendiente", variant: "pending" };
}

export function resolveRetaNextAction(input: {
  is_started: boolean;
  is_finished: boolean;
  pairsCount: number;
  playersCount: number;
}): RetaNextAction | null {
  if (input.is_finished) {
    return { label: "Revisar clasificación", tabId: "clasificacion" };
  }

  if (!input.is_started) {
    if (input.playersCount < 2) {
      return { label: "Agregar jugadores", tabId: "jugadores" };
    }
    if (input.pairsCount < 2) {
      return { label: "Formar parejas", tabId: "jugadores" };
    }
    return { label: "Iniciar torneo", tabId: "resumen" };
  }

  return { label: "Registrar resultados", tabId: "partidos" };
}

export function resolveRetaSummary(input: {
  is_started: boolean;
  is_finished: boolean;
  pairsCount: number;
  playersCount: number;
  matchesCount: number;
}): string {
  if (input.is_finished) {
    return `${input.pairsCount} parejas · ${input.matchesCount} partidos jugados`;
  }
  if (!input.is_started) {
    return `${input.playersCount} jugadores · ${input.pairsCount} parejas`;
  }
  return `${input.pairsCount} parejas · ${input.matchesCount} partidos`;
}
