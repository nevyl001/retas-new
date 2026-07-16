import type { ConvocatoriaAdapterContext, OpenGameModeType } from "./types";
import { convocatoriaProductHeadline } from "./modeWhitelist";

export function defaultCapacityForMode(mode: OpenGameModeType): number {
  switch (mode) {
    case "duelo_2v2":
      return 4;
    case "americano":
      return 16;
    default:
      return 8;
  }
}

export function buildTournamentConvocatoriaContext(opts: {
  mode: "reta" | "americano";
  tournamentId: string;
  name: string;
  /** Lugar / sede. */
  locationLabel?: string;
  /** Número de cancha (opcional). */
  canchaLabel?: string;
  clubName?: string;
  tournamentFormat?: string | null;
  championshipEnabled?: boolean;
  productHeadline?: string;
}): ConvocatoriaAdapterContext {
  const productHeadline =
    opts.productHeadline ??
    convocatoriaProductHeadline({
      mode: opts.mode,
      tournamentFormat: opts.tournamentFormat,
      championshipEnabled: opts.championshipEnabled,
    });

  const club = opts.clubName?.trim() || undefined;

  return {
    mode: opts.mode,
    entityId: opts.tournamentId,
    defaultTitle: opts.name,
    defaultCapacity: defaultCapacityForMode(opts.mode),
    defaultLocation: opts.locationLabel?.trim() || club,
    defaultCancha: opts.canchaLabel?.trim() || undefined,
    defaultDurationMinutes: opts.mode === "americano" ? 120 : 90,
    clubName: club,
    productHeadline,
  };
}

/** Minutos entre inicio y fin ISO; si no hay datos válidos, usa fallback. */
export function durationMinutesBetween(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  fallback = 90
): number {
  if (!startIso?.trim() || !endIso?.trim()) return fallback;
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return fallback;
  }
  return Math.max(1, Math.round((end - start) / 60000));
}

export function buildDueloConvocatoriaContext(opts: {
  dueloId: string;
  name: string;
  /** Lugar / sede (no la cancha). */
  locationLabel?: string;
  /** Número o etiqueta de cancha. */
  canchaLabel?: string;
  scheduledAt?: string | null;
  /** Fin del encuentro (programado_hasta) — se usa para calcular duración. */
  scheduledUntil?: string | null;
  durationMinutes?: number | null;
  clubName?: string;
  categoryLabel?: string;
}): ConvocatoriaAdapterContext {
  const duration =
    opts.durationMinutes != null &&
    Number.isFinite(opts.durationMinutes) &&
    opts.durationMinutes > 0
      ? Math.round(opts.durationMinutes)
      : durationMinutesBetween(opts.scheduledAt, opts.scheduledUntil, 90);

  const club = opts.clubName?.trim() || undefined;

  return {
    mode: "duelo_2v2",
    entityId: opts.dueloId,
    defaultTitle: opts.name,
    defaultCapacity: 4,
    defaultLocation: opts.locationLabel?.trim() || club,
    defaultCancha: opts.canchaLabel?.trim() || undefined,
    defaultCategory: opts.categoryLabel,
    defaultDurationMinutes: duration,
    defaultScheduledAt: opts.scheduledAt ?? null,
    clubName: club,
    lockCapacity: true,
    productHeadline: convocatoriaProductHeadline({ mode: "duelo_2v2" }),
  };
}

/**
 * Identidad global: Riviera ID → official identity → canonical riviera_jugadores.
 * Acceso multi-club: organizer_player_access (joined_via=registration) + clon local.
 * No se crea Riviera ID ni carrera ni puntos en la inscripción.
 */
export const CONVOCATORIA_IDENTITY_CONTRACT = {
  globalKey: "riviera_official_player_identity.riviera_id / official_player_key",
  resolveRpc: "_resolve_identity_by_riviera_id",
  membership: "organizer_player_access",
  localClone: "_ensure_granted_player_local_as",
  noSportsOnJoin: true,
} as const;

/**
 * Adaptadores de sincronización (SQL): solo mueven inscritos a la estructura del modo.
 * No generan slug ni tokens — eso vive solo en las RPC comunes.
 */
export const CONVOCATORIA_SYNC_ADAPTERS = {
  reta: "none — pool en tournament_open_registration_entries; admin arma parejas",
  americano: "_open_reg_sync_americano_roster",
  duelo_2v2: "_open_reg_sync_duelo_slots",
} as const;
