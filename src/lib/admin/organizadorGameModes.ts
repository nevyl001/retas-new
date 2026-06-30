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
  permite_ajuste_puntos_manuales: boolean;
  visible_ranking_oficial: boolean;
  premium_branding_enabled: boolean;
  branding_key: string | null;
  updated_at?: string;
}

export type OrganizadorGameModesInput = Omit<
  OrganizadorGameModesRow,
  "organizador_id" | "updated_at"
>;

export interface OrganizadorAccountSettings {
  modes: Record<GameModeId, boolean>;
  permiteAjustePuntosManuales: boolean;
  visibleRankingOficial: boolean;
  premiumBrandingEnabled: boolean;
  brandingKey: string | null;
}

/** Defaults para cuentas nuevas sin fila en BD (coincide con column DEFAULT de SQL). */
export const DEFAULT_ORGANIZADOR_GAME_MODES: OrganizadorGameModesInput = {
  reta_equipos: false,
  round_robin: true,
  americano: false,
  mini_torneo: false,
  liga: false,
  duelo_2v2: true,
  permite_ajuste_puntos_manuales: true,
  visible_ranking_oficial: false,
  premium_branding_enabled: false,
  branding_key: null,
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
  if (!modes) return false;
  return modes[modeId] !== false;
}

export function inputFromEnabledModes(
  modes: Record<GameModeId, boolean>,
  permiteAjustePuntosManuales: boolean,
  visibleRankingOficial: boolean,
  premiumBrandingEnabled: boolean,
  brandingKey: string | null
): OrganizadorGameModesInput {
  return {
    reta_equipos: modes["reta-equipos"],
    round_robin: modes["round-robin"],
    americano: modes.americano,
    mini_torneo: modes["mini-torneo"],
    liga: modes.liga,
    duelo_2v2: modes["duelo-2v2"],
    permite_ajuste_puntos_manuales: permiteAjustePuntosManuales,
    visible_ranking_oficial: visibleRankingOficial,
    premium_branding_enabled: premiumBrandingEnabled,
    branding_key: brandingKey?.trim() || null,
  };
}

export function rowToAccountSettings(
  row: OrganizadorGameModesRow | OrganizadorGameModesInput | null | undefined
): OrganizadorAccountSettings {
  const base = row ?? DEFAULT_ORGANIZADOR_GAME_MODES;
  return {
    modes: rowToEnabledModes(base),
    permiteAjustePuntosManuales: base.permite_ajuste_puntos_manuales !== false,
    visibleRankingOficial: base.visible_ranking_oficial === true,
    premiumBrandingEnabled: base.premium_branding_enabled === true,
    brandingKey: base.branding_key?.trim() || null,
  };
}
