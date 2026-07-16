import type { OpenGameModeType } from "./types";

/**
 * Convocatoria Riviera es un SERVICIO COMÚN del ecosistema.
 * No es una función del Duelo / Americano / Reta: esos modos solo lo consumen.
 *
 * mode_type en DB (única capa):
 *   - reta        → Reta por Equipos, Round Robin y Remontada Final
 *                   (Remontada Final = fase championship del mismo tournament RR)
 *   - americano   → Americano dinámico
 *   - duelo_2v2   → Duelo 2 vs 2
 *
 * Round Robin NO tiene mode_type propio: usa `reta`.
 * Remontada Final NO tiene mode_type propio: usa `reta` + championshipEnabled.
 */

/** Modos técnicos admitidos (whitelist servidor + UI). */
export const CONVOCATORIA_ALLOWED_MODES = [
  "reta",
  "americano",
  "duelo_2v2",
] as const satisfies readonly OpenGameModeType[];

export type ConvocatoriaAllowedMode = (typeof CONVOCATORIA_ALLOWED_MODES)[number];

/** Productos de juego cubiertos por el servicio (pueden compartir mode_type). */
export const CONVOCATORIA_COVERED_PRODUCTS = [
  "reta-equipos",
  "round-robin",
  "remontada-final",
  "americano",
  "duelo-2v2",
] as const;

export type ConvocatoriaCoveredProduct =
  (typeof CONVOCATORIA_COVERED_PRODUCTS)[number];

/** Modos formalmente excluidos (no mostrar CTA ni aceptar en RPC). */
export const CONVOCATORIA_EXCLUDED_MODES = [
  "liga",
  "torneo",
  "torneo_express",
  "evento_multicategoria",
  "mini-torneo",
] as const;

export type ConvocatoriaExcludedMode =
  (typeof CONVOCATORIA_EXCLUDED_MODES)[number];

export function isConvocatoriaAllowedMode(
  mode: string | null | undefined
): mode is ConvocatoriaAllowedMode {
  return (
    mode === "reta" || mode === "americano" || mode === "duelo_2v2"
  );
}

export function isConvocatoriaExcludedMode(
  mode: string | null | undefined
): mode is ConvocatoriaExcludedMode {
  return (
    mode === "liga" ||
    mode === "torneo" ||
    mode === "torneo_express" ||
    mode === "evento_multicategoria" ||
    mode === "mini-torneo"
  );
}

export function assertConvocatoriaAllowedMode(mode: string): ConvocatoriaAllowedMode {
  if (isConvocatoriaExcludedMode(mode)) {
    throw new Error("Este modo no admite convocatoria por WhatsApp.");
  }
  if (!isConvocatoriaAllowedMode(mode)) {
    throw new Error("Este modo no admite convocatoria por WhatsApp.");
  }
  return mode;
}

/**
 * Round Robin, Reta por Equipos y Remontada Final → mode_type `reta`.
 * Remontada Final no es entidad aparte: es championship del Round Robin.
 */
export function convocatoriaModeFromTournamentFormat(
  _format: string | null | undefined,
  isAmericano: boolean
): ConvocatoriaAllowedMode {
  if (isAmericano) return "americano";
  return "reta";
}

/** Headline de producto para el mensaje WhatsApp (mismo mode_type `reta`). */
export function convocatoriaProductHeadline(opts: {
  mode: OpenGameModeType;
  tournamentFormat?: string | null;
  championshipEnabled?: boolean;
}): string {
  if (opts.mode === "americano") return "AMERICANO ABIERTO";
  if (opts.mode === "duelo_2v2") return "DUELO 2 VS 2";
  if (opts.championshipEnabled) return "REMONTADA FINAL";
  if (opts.tournamentFormat === "round_robin") return "ROUND ROBIN";
  return "RETA ABIERTA";
}
