import type { GameModeId } from "../components/home/gameModesConfig";
import { GAME_MODES } from "../components/home/gameModesConfig";
import { inferAmericanoCourtsFromSnapshot } from "./americanoDinamicoStorage";
import type { Tournament } from "./db/types";
import { resolveTournamentGameMode } from "./gameModeMapping";

export type TournamentModeBadge =
  | "mode-equipos"
  | "mode-robin"
  | "mode-americano"
  | "mode-torneo";

export type TournamentStatusBadge = "active" | "finished" | "pending";

const MODE_BADGE_VARIANT: Record<GameModeId, TournamentModeBadge> = {
  "reta-equipos": "mode-equipos",
  "round-robin": "mode-robin",
  americano: "mode-americano",
  "mini-torneo": "mode-torneo",
};

export function getTournamentModeBadge(tournament: Tournament): {
  variant: TournamentModeBadge;
  label: string;
  color: string;
} {
  const modeId = resolveTournamentGameMode(tournament);
  const config = GAME_MODES.find((m) => m.id === modeId);
  return {
    variant: MODE_BADGE_VARIANT[modeId],
    label: config?.title ?? modeId,
    color: config?.accentColor ?? "#3B82F6",
  };
}

/** Canchas efectivas (Americano: snapshot o BD; otros modos: BD). */
export function getTournamentCourtsCount(tournament: Tournament): number {
  if (resolveTournamentGameMode(tournament) === "americano") {
    const fromSnapshot = inferAmericanoCourtsFromSnapshot(tournament.id);
    if (fromSnapshot) return fromSnapshot;
  }
  const n = tournament.courts;
  return n && n > 0 ? n : 1;
}

export function formatTournamentCourtsLabel(count: number): string {
  return count === 1 ? "1 cancha" : `${count} canchas`;
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
