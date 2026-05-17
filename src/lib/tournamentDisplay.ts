import type { Tournament } from "./db/types";

export type TournamentModeBadge =
  | "mode-equipos"
  | "mode-robin"
  | "mode-americano"
  | "mode-torneo";

export type TournamentStatusBadge = "active" | "finished" | "pending";

export function getTournamentModeBadge(tournament: Tournament): {
  variant: TournamentModeBadge;
  label: string;
} {
  if (tournament.format === "teams") {
    return { variant: "mode-equipos", label: "Por equipos" };
  }
  if (tournament.format === "round_robin") {
    return { variant: "mode-robin", label: "Round Robin" };
  }
  return { variant: "mode-robin", label: "Reta" };
}

export function getTournamentStatusBadge(tournament: Tournament): {
  variant: TournamentStatusBadge;
  label: string;
} {
  if (tournament.is_finished) {
    return { variant: "finished", label: "Finalizada" };
  }
  if (tournament.is_started) {
    return { variant: "active", label: "En curso" };
  }
  return { variant: "pending", label: "Pendiente" };
}

export function getTournamentGroupNames(tournament: Tournament): string[] {
  return tournament.team_config?.teamNames?.filter(Boolean) ?? [];
}
