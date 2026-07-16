/**
 * Guardado de configuración de reta.
 * Canchas: RPC atómica (courts + unassign). Remontada: BD canónica.
 */
import { supabase } from "../supabaseClient";
import type { Tournament, Match } from "../db/types";
import {
  getTournamentPublicConfigExtended,
  updateTournament,
} from "../database";
import {
  initChampionshipConfig,
  loadChampionshipConfig,
  parseChampionshipConfig,
  saveChampionshipConfig,
  clampChampionshipRounds,
  type RoundRobinChampionshipConfig,
} from "../roundRobinChampionship";
import {
  fieldEditability,
  planCourtsChange,
  preferDbChampionshipOverLocal,
  type RetaEditPhase,
  type RetaConfigFieldKey,
} from "./retaConfigEditRules";

export type RetaConfigFormValues = {
  name: string;
  description: string;
  courts: number;
  championshipEnabled: boolean;
  championshipRounds: number;
  lugar: string;
  mostrar_lugar: boolean;
  cancha: string;
  programado_en: string;
  duration_minutes: number;
};

export type SaveRetaConfigInput = {
  tournament: Tournament;
  matches: Match[];
  phase: RetaEditPhase;
  values: RetaConfigFormValues;
  loadedUpdatedAt: string | null;
  courtsDecreaseConfirmed?: boolean;
};

export type SaveRetaConfigResult =
  | { ok: true; tournament: Tournament; message: string }
  | {
      ok: false;
      error: string;
      needsCourtsConfirm?: { message: string };
      conflict?: boolean;
    };

function durationMinutesBetween(
  fromIso: string,
  untilIso: string | null | undefined
): number {
  if (!untilIso) return 90;
  const a = Date.parse(fromIso);
  const b = Date.parse(untilIso);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 90;
  return Math.round((b - a) / 60000);
}

export function datetimeLocalToIso(local: string): string | null {
  const t = local.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function tournamentToFormValues(
  t: Tournament,
  champ?: { championshipEnabled: boolean; championshipRounds: number }
): RetaConfigFormValues {
  const start = t.programado_en || null;
  const duration = start
    ? durationMinutesBetween(start, t.programado_hasta)
    : 90;
  return {
    name: t.name || "",
    description: t.description || "",
    courts: Math.max(1, t.courts || 1),
    championshipEnabled: Boolean(champ?.championshipEnabled),
    championshipRounds: champ?.championshipRounds ?? 2,
    lugar: t.lugar || "",
    mostrar_lugar: t.mostrar_lugar !== false,
    cancha: t.cancha || "",
    programado_en: isoToDatetimeLocal(t.programado_en),
    duration_minutes: duration,
  };
}

/**
 * Fuente canónica Remontada para reta existente: BD gana sobre localStorage.
 * localStorage solo se espeja como caché tras leer BD.
 */
export async function resolveCanonicalChampionshipConfig(
  tournamentId: string
): Promise<RoundRobinChampionshipConfig> {
  const local = loadChampionshipConfig(tournamentId);
  let dbParsed: RoundRobinChampionshipConfig | null = null;
  try {
    const pub = await getTournamentPublicConfigExtended(tournamentId);
    dbParsed = parseChampionshipConfig(pub?.championship_config);
  } catch {
    dbParsed = null;
  }

  const preferred = preferDbChampionshipOverLocal({
    db: dbParsed
      ? {
          championshipEnabled: dbParsed.championshipEnabled,
          championshipRounds: dbParsed.championshipRounds,
        }
      : null,
    local: local
      ? {
          championshipEnabled: local.championshipEnabled,
          championshipRounds: local.championshipRounds,
        }
      : null,
  });

  const resolved: RoundRobinChampionshipConfig = {
    championshipEnabled: preferred.championshipEnabled,
    championshipRounds: clampChampionshipRounds(preferred.championshipRounds),
    championshipRoundsGenerated: dbParsed?.championshipRoundsGenerated ??
      local?.championshipRoundsGenerated ??
      0,
    regularRoundsMax: dbParsed?.regularRoundsMax ?? local?.regularRoundsMax,
  };

  // Espejo caché (no decide autoridad)
  if (dbParsed) {
    saveChampionshipConfig(tournamentId, resolved);
  }
  return resolved;
}

function pickAllowedUpdates(
  phase: RetaEditPhase,
  values: RetaConfigFormValues,
  current: Tournament
): Partial<Tournament> {
  const updates: Partial<Tournament> = {};
  const allow = (f: RetaConfigFieldKey) => fieldEditability(f, phase).editable;

  if (allow("name") && values.name.trim() !== (current.name || "")) {
    updates.name = values.name.trim() || current.name;
  }
  if (allow("description")) {
    const next = values.description.trim();
    if (next !== (current.description || "")) {
      updates.description = next || undefined;
    }
  }
  if (allow("lugar")) {
    const next = values.lugar.trim() || null;
    if (next !== (current.lugar ?? null)) updates.lugar = next;
  }
  if (
    allow("mostrar_lugar") &&
    values.mostrar_lugar !== (current.mostrar_lugar !== false)
  ) {
    updates.mostrar_lugar = values.mostrar_lugar;
  }
  if (allow("cancha")) {
    const next = values.cancha.trim() || null;
    if (next !== (current.cancha ?? null)) updates.cancha = next;
  }
  if (
    allow("programado_en") ||
    allow("programado_hasta") ||
    allow("duration_minutes")
  ) {
    const startIso = datetimeLocalToIso(values.programado_en);
    if (startIso) {
      updates.programado_en = startIso;
      const mins = Math.max(
        15,
        Math.min(480, Math.floor(values.duration_minutes) || 90)
      );
      updates.programado_hasta = new Date(
        Date.parse(startIso) + mins * 60_000
      ).toISOString();
    } else if (!values.programado_en.trim() && current.programado_en) {
      updates.programado_en = null;
      updates.programado_hasta = null;
    }
  }
  return updates;
}

async function applyCourtsAtomically(input: {
  tournamentId: string;
  newCourts: number;
  expectedUpdatedAt: string | null;
}): Promise<
  | { ok: true; updated_at: string | null; unassigned_count: number }
  | { ok: false; error: string; conflict?: boolean }
> {
  const { data, error } = await supabase.rpc(
    "update_tournament_courts_and_unassign",
    {
      p_tournament_id: input.tournamentId,
      p_new_courts: input.newCourts,
      p_expected_updated_at: input.expectedUpdatedAt,
    }
  );
  if (error) {
    return {
      ok: false,
      error:
        error.message.includes("update_tournament_courts_and_unassign") ||
        error.code === "42883"
          ? "Falta aplicar SQL patch-update-tournament-courts-unassign.sql en Supabase."
          : error.message,
    };
  }
  const row = data as {
    ok?: boolean;
    error?: string;
    message?: string;
    updated_at?: string;
    unassigned_count?: number;
  } | null;
  if (!row?.ok) {
    const conflict = row?.error === "conflict";
    return {
      ok: false,
      conflict,
      error:
        row?.message ||
        (conflict
          ? "La configuración cambió en otra sesión. Recarga los datos antes de guardar."
          : row?.error || "No se pudieron actualizar las canchas"),
    };
  }
  return {
    ok: true,
    updated_at: row.updated_at ?? null,
    unassigned_count: Number(row.unassigned_count) || 0,
  };
}

export async function saveRetaConfig(
  input: SaveRetaConfigInput
): Promise<SaveRetaConfigResult> {
  const { tournament, matches, phase, values, loadedUpdatedAt } = input;

  if (
    loadedUpdatedAt &&
    tournament.updated_at &&
    loadedUpdatedAt !== tournament.updated_at
  ) {
    return {
      ok: false,
      conflict: true,
      error:
        "La configuración cambió en otra sesión. Recarga los datos antes de guardar.",
    };
  }

  const courtsPlan = planCourtsChange({
    currentCourts: tournament.courts,
    nextCourts: values.courts,
    matches,
  });

  if (
    courtsPlan.kind === "decrease" &&
    courtsPlan.affectedPendingCount > 0 &&
    !input.courtsDecreaseConfirmed
  ) {
    return {
      ok: false,
      needsCourtsConfirm: { message: courtsPlan.confirmationMessage },
      error: courtsPlan.confirmationMessage,
    };
  }

  let workingUpdatedAt = loadedUpdatedAt;
  let workingTournament: Tournament = { ...tournament };
  const messages: string[] = [];

  // 1) Courts vía RPC atómica (incluye unassign + lock)
  if (
    fieldEditability("courts", phase).editable &&
    values.courts !== tournament.courts
  ) {
    const courtsRes = await applyCourtsAtomically({
      tournamentId: tournament.id,
      newCourts: Math.max(1, Math.min(20, Math.floor(values.courts) || 1)),
      expectedUpdatedAt: workingUpdatedAt,
    });
    if (!courtsRes.ok) {
      return {
        ok: false,
        conflict: courtsRes.conflict,
        error: courtsRes.error,
      };
    }
    workingTournament = {
      ...workingTournament,
      courts: values.courts,
      updated_at: courtsRes.updated_at || workingTournament.updated_at,
    };
    workingUpdatedAt = courtsRes.updated_at || workingUpdatedAt;
    if (courtsRes.unassigned_count > 0) {
      messages.push(
        `${courtsRes.unassigned_count} partido(s) quedaron sin cancha (Por asignar).`
      );
    }
  }

  // 2) Resto de campos con optimistic lock
  const updates = pickAllowedUpdates(phase, values, workingTournament);
  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();
    let query = supabase
      .from("tournaments")
      .update(updates)
      .eq("id", tournament.id);
    if (workingUpdatedAt) {
      query = query.eq("updated_at", workingUpdatedAt);
    }
    const { data, error } = await query.select().maybeSingle();
    if (error) {
      return { ok: false, error: error.message };
    }
    if (!data) {
      return {
        ok: false,
        conflict: true,
        error:
          "La configuración cambió en otra sesión. Recarga los datos antes de guardar.",
      };
    }
    workingTournament = { ...workingTournament, ...(data as Tournament) };
    workingUpdatedAt = (data as Tournament).updated_at || workingUpdatedAt;
  }

  // 3) Remontada → BD (saveChampionshipConfig sync público)
  if (fieldEditability("championship", phase).editable) {
    const canonical = await resolveCanonicalChampionshipConfig(tournament.id);
    const changed =
      canonical.championshipEnabled !== values.championshipEnabled ||
      canonical.championshipRounds !== values.championshipRounds;
    if (changed) {
      const next: RoundRobinChampionshipConfig = {
        championshipEnabled: values.championshipEnabled,
        championshipRounds: clampChampionshipRounds(values.championshipRounds),
        championshipRoundsGenerated: canonical.championshipRoundsGenerated,
        regularRoundsMax: canonical.regularRoundsMax,
      };
      if (
        !canonical.championshipRoundsGenerated &&
        values.championshipEnabled
      ) {
        initChampionshipConfig(tournament.id, {
          enabled: values.championshipEnabled,
          rounds: values.championshipRounds,
        });
      } else {
        saveChampionshipConfig(tournament.id, next);
      }
      messages.push("Remontada Final actualizada.");
    }
  }

  if (
    messages.length === 0 &&
    Object.keys(updates).length === 0 &&
    values.courts === tournament.courts
  ) {
    return { ok: false, error: "No hay cambios para guardar." };
  }

  return {
    ok: true,
    tournament: workingTournament,
    message: messages.length ? messages.join(" ") : "Cambios guardados.",
  };
}

export async function saveRetaConfigFallback(
  input: SaveRetaConfigInput
): Promise<SaveRetaConfigResult> {
  const result = await saveRetaConfig(input);
  if (result.ok || result.conflict !== true) return result;
  const updates = pickAllowedUpdates(
    input.phase,
    input.values,
    input.tournament
  );
  if (!Object.keys(updates).length) return result;
  try {
    const data = await updateTournament(input.tournament.id, updates);
    return {
      ok: true,
      tournament: { ...input.tournament, ...data },
      message: "Cambios guardados.",
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al guardar",
    };
  }
}
