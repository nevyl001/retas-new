import type { GameModeId } from "../../components/home/gameModesConfig";

/** Columnas en `organizador_game_modes`. */
export const GAME_MODE_DB_KEYS: Record<GameModeId, keyof OrganizadorGameModesRow> = {
  "reta-equipos": "reta_equipos",
  "round-robin": "round_robin",
  americano: "americano",
  "mini-torneo": "mini_torneo",
  liga: "liga",
  "duelo-2v2": "duelo_2v2",
};

export interface OrganizadorGameModesRow {
  organizador_id: string;
  reta_equipos: boolean;
  round_robin: boolean;
  americano: boolean;
  mini_torneo: boolean;
  liga: boolean;
  duelo_2v2: boolean;
  updated_at?: string;
}

export type OrganizadorGameModesInput = Omit<
  OrganizadorGameModesRow,
  "organizador_id" | "updated_at"
>;

export const DEFAULT_ORGANIZADOR_GAME_MODES: OrganizadorGameModesInput = {
  reta_equipos: true,
  round_robin: true,
  americano: true,
  mini_torneo: true,
  liga: true,
  duelo_2v2: true,
};

export const GAME_MODE_LABELS: Record<GameModeId, string> = {
  "reta-equipos": "Reta por equipos",
  "round-robin": "Round Robin",
  americano: "Pádel americano",
  "mini-torneo": "Torneos (Express)",
  liga: "Liga",
  "duelo-2v2": "Duelo 2 vs 2",
};

export function rowToEnabledModes(
  row: OrganizadorGameModesInput | null | undefined
): Record<GameModeId, boolean> {
  const base = row ?? DEFAULT_ORGANIZADOR_GAME_MODES;
  return {
    "reta-equipos": base.reta_equipos,
    "round-robin": base.round_robin,
    americano: base.americano,
    "mini-torneo": base.mini_torneo,
    liga: base.liga,
    "duelo-2v2": base.duelo_2v2,
  };
}

export function isGameModeEnabled(
  modes: Record<GameModeId, boolean> | null | undefined,
  modeId: GameModeId
): boolean {
  if (!modes) return true;
  return modes[modeId] !== false;
}

export function inputFromEnabledModes(
  modes: Record<GameModeId, boolean>
): OrganizadorGameModesInput {
  return {
    reta_equipos: modes["reta-equipos"],
    round_robin: modes["round-robin"],
    americano: modes.americano,
    mini_torneo: modes["mini-torneo"],
    liga: modes.liga,
    duelo_2v2: modes["duelo-2v2"],
  };
}
