export type AmericanoMobileTabId = "ronda" | "partidos" | "ranking" | "jugadores";

export type AmericanoNextAction = {
  label: string;
  tabId: AmericanoMobileTabId;
};

export function resolveAmericanoStatusLabel(input: {
  phase: "registration" | "playing" | "finished";
}): { label: string; variant: "live" | "pending" | "gold" | "muted" } {
  if (input.phase === "finished") return { label: "Finalizado", variant: "gold" };
  if (input.phase === "playing") return { label: "En curso", variant: "live" };
  return { label: "Registro", variant: "pending" };
}

export function resolveAmericanoNextAction(input: {
  phase: "registration" | "playing" | "finished";
  playersCount: number;
  hasCurrentRound: boolean;
}): AmericanoNextAction | null {
  if (input.phase === "finished") {
    return { label: "Ver ranking", tabId: "ranking" };
  }
  if (input.phase === "registration") {
    if (input.playersCount < 4) {
      return { label: "Agregar jugadores", tabId: "jugadores" };
    }
    return { label: "Iniciar torneo", tabId: "jugadores" };
  }
  if (input.hasCurrentRound) {
    return { label: "Registrar resultados", tabId: "ronda" };
  }
  return { label: "Ver ranking", tabId: "ranking" };
}

export function resolveAmericanoSummary(input: {
  phase: "registration" | "playing" | "finished";
  playersCount: number;
  currentRound: number;
  totalRounds: number;
}): string {
  if (input.phase === "registration") {
    return `${input.playersCount} jugadores registrados`;
  }
  if (input.phase === "finished") {
    return `${input.playersCount} jugadores · ${input.totalRounds} rondas`;
  }
  return `Ronda ${input.currentRound} de ${input.totalRounds} · ${input.playersCount} jugadores`;
}
