import type { GameModeId } from "../components/home/gameModesConfig";
import {
  isMarkedAmericanoTournament,
  loadAmericanoDinamicoSnapshot,
} from "./americanoDinamicoStorage";

export type TournamentDbFormat = "round_robin" | "teams";
export type StartTournamentFormat = "roundRobin" | "teams";

const MODE_STORAGE_PREFIX = "rivieraapp_mode_";
const GAME_MODE_STORAGE_PREFIX = "rivieraapp_game_mode_";
const LAST_GAME_MODE_KEY = "rivieraapp_last_game_mode";

export function persistLastGameMode(modeId: GameModeId): void {
  try {
    sessionStorage.setItem(LAST_GAME_MODE_KEY, modeId);
  } catch {
    /* ignore */
  }
}

export function readLastGameMode(): GameModeId | null {
  try {
    const v = sessionStorage.getItem(LAST_GAME_MODE_KEY);
    if (
      v === "reta-equipos" ||
      v === "round-robin" ||
      v === "americano" ||
      v === "mini-torneo"
    ) {
      return v;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function gameModeIdToTournamentFormat(
  modeId: GameModeId
): TournamentDbFormat | undefined {
  switch (modeId) {
    case "reta-equipos":
      return "teams";
    case "round-robin":
      return "round_robin";
    default:
      return undefined;
  }
}

export function tournamentFormatToStartFormat(
  format?: string | null
): StartTournamentFormat | null {
  if (format === "round_robin") return "roundRobin";
  if (format === "teams") return "teams";
  return null;
}

export function getStartFormatLabel(format: StartTournamentFormat): string {
  return format === "teams" ? "Reta por Equipos" : "Round Robin";
}

export function persistTournamentMode(
  tournamentId: string,
  format: TournamentDbFormat
): void {
  try {
    sessionStorage.setItem(`${MODE_STORAGE_PREFIX}${tournamentId}`, format);
  } catch {
    /* ignore */
  }
}

export function readPersistedTournamentMode(
  tournamentId: string
): TournamentDbFormat | null {
  try {
    const v = sessionStorage.getItem(`${MODE_STORAGE_PREFIX}${tournamentId}`);
    if (v === "round_robin" || v === "teams") return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function persistTournamentGameMode(
  tournamentId: string,
  modeId: GameModeId
): void {
  try {
    sessionStorage.setItem(`${GAME_MODE_STORAGE_PREFIX}${tournamentId}`, modeId);
  } catch {
    /* ignore */
  }
}

export function readPersistedTournamentGameMode(
  tournamentId: string
): GameModeId | null {
  try {
    const v = sessionStorage.getItem(
      `${GAME_MODE_STORAGE_PREFIX}${tournamentId}`
    );
    if (
      v === "reta-equipos" ||
      v === "round-robin" ||
      v === "americano" ||
      v === "mini-torneo"
    ) {
      return v;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Modo de juego de una reta (DB format > persistido > marca americano). */
export function resolveTournamentGameMode(tournament: {
  id: string;
  format?: string;
}): GameModeId {
  const persistedMode = readPersistedTournamentGameMode(tournament.id);
  if (persistedMode) return persistedMode;

  if (tournament.format === "round_robin") return "round-robin";
  if (tournament.format === "teams") return "reta-equipos";

  const persistedFormat = readPersistedTournamentMode(tournament.id);
  if (persistedFormat === "round_robin") return "round-robin";
  if (persistedFormat === "teams") return "reta-equipos";

  if (isMarkedAmericanoTournament(tournament.id)) return "americano";

  const snap = loadAmericanoDinamicoSnapshot(tournament.id);
  if (snap && !tournament.format && !persistedFormat) return "americano";

  return "round-robin";
}

export function isAmericanoTournament(tournament: {
  id: string;
  format?: string;
}): boolean {
  return resolveTournamentGameMode(tournament) === "americano";
}

export function resolveTournamentStartFormat(tournament: {
  id: string;
  format?: string;
}): StartTournamentFormat {
  const fromDb =
    tournamentFormatToStartFormat(tournament.format) ??
    tournamentFormatToStartFormat(readPersistedTournamentMode(tournament.id));

  if (fromDb) return fromDb;

  const lastMode = readLastGameMode();
  if (lastMode) {
    const fromLast = gameModeIdToTournamentFormat(lastMode);
    const start = tournamentFormatToStartFormat(fromLast);
    if (start) return start;
  }

  return "roundRobin";
}
