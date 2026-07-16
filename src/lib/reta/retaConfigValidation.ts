/**
 * Shared clamp/parse helpers for create + edit reta config forms.
 * RetaConfigFields and saveRetaConfig must use these (no duplicated limits).
 */
export const RETA_COURTS_MIN = 1;
export const RETA_COURTS_MAX = 20;
export const RETA_DURATION_MIN = 15;
export const RETA_DURATION_MAX = 480;
export const RETA_CHAMPIONSHIP_ROUNDS_MIN = 1;
export const RETA_CHAMPIONSHIP_ROUNDS_MAX = 10;

export function clampRetaCourts(n: unknown): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return 2;
  return Math.max(RETA_COURTS_MIN, Math.min(RETA_COURTS_MAX, v));
}

export function clampRetaDurationMinutes(n: unknown): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return 90;
  return Math.max(RETA_DURATION_MIN, Math.min(RETA_DURATION_MAX, v));
}

export function clampChampionshipRoundsShared(n: unknown): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return 2;
  return Math.max(
    RETA_CHAMPIONSHIP_ROUNDS_MIN,
    Math.min(RETA_CHAMPIONSHIP_ROUNDS_MAX, v)
  );
}

export type RetaConfigValidationErrors = {
  name?: string;
  courts?: string;
  duration_minutes?: string;
  championshipRounds?: string;
};

export function validateRetaConfigForm(input: {
  name: string;
  courts: number;
  duration_minutes: number;
  championshipEnabled: boolean;
  championshipRounds: number;
  mode: "create" | "edit";
}): RetaConfigValidationErrors {
  const errors: RetaConfigValidationErrors = {};
  if (input.mode === "edit" && !input.name.trim()) {
    errors.name = "El nombre no puede quedar vacío al editar.";
  }
  const courts = clampRetaCourts(input.courts);
  if (courts !== Math.floor(Number(input.courts))) {
    errors.courts = `Canchas entre ${RETA_COURTS_MIN} y ${RETA_COURTS_MAX}.`;
  }
  const dur = clampRetaDurationMinutes(input.duration_minutes);
  if (dur !== Math.floor(Number(input.duration_minutes))) {
    errors.duration_minutes = `Duración entre ${RETA_DURATION_MIN} y ${RETA_DURATION_MAX} min.`;
  }
  if (input.championshipEnabled) {
    const r = clampChampionshipRoundsShared(input.championshipRounds);
    if (r !== Math.floor(Number(input.championshipRounds))) {
      errors.championshipRounds = `Rondas entre ${RETA_CHAMPIONSHIP_ROUNDS_MIN} y ${RETA_CHAMPIONSHIP_ROUNDS_MAX}.`;
    }
  }
  return errors;
}

export function hasRetaConfigValidationErrors(
  errors: RetaConfigValidationErrors
): boolean {
  return Object.keys(errors).length > 0;
}
