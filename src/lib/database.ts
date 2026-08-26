import { supabase, supabasePublicRead } from "./supabaseClient";
import { debugLog } from "./debug/debugLog";
import { GLOBAL_TOURNAMENT_ID, isMissingColumnError } from "./db/schemaHelpers";
import {
  buildCreatePairPayload,
  PAIR_SELECT_WITH_PLAYERS,
} from "./createPairPayload";
import type {
  Game,
  Match,
  Pair,
  Player,
  Tournament,
  TournamentTeamConfig,
} from "./db/types";
import {
  isAmericanoResumable,
  isMarkedAmericanoTournament,
  listMarkedAmericanoTournamentIds,
  readAmericanoActiveTournamentId,
  readAmericanoTournamentIdFromSession,
  type AmericanoDinamicoSnapshotV1,
  type AmericanoSnapshotPlayer,
  type AmericanoSnapshotRosterEntry,
  type AmericanoSnapshotRound,
  type AmericanoSnapshotTournamentPhase,
} from "./americanoDinamicoStorage";
import { isAmericanoResumableAsync } from "./americanoDinamicoSync";

export type {
  Game,
  Match,
  Pair,
  Player,
  Tournament,
  TournamentTeamConfig,
} from "./db/types";

// Funciones para Retas
export const createTournament = async (
  name: string,
  userId: string,
  description?: string,
  courts: number = 1,
  format?: "round_robin" | "teams"
) => {
  debugLog("Creating tournament:", { name, description, courts, userId, format });

  const base = {
    name,
    description,
    courts,
    user_id: userId,
    is_public: true,
    ...(format ? { format } : {}),
  };

  let { data, error } = await supabase
    .from("tournaments")
    .insert([base])
    .select()
    .single();

  if (isMissingColumnError(error, "tournaments", "is_public")) {
    const withoutPublic = { name, description, courts, user_id: userId, ...(format ? { format } : {}) };
    ({ data, error } = await supabase
      .from("tournaments")
      .insert([withoutPublic])
      .select()
      .single());
  }

  if (isMissingColumnError(error, "tournaments", "format")) {
    ({ data, error } = await supabase
      .from("tournaments")
      .insert([
        {
          name,
          description,
          courts,
          user_id: userId,
          is_public: true,
        },
      ])
      .select()
      .single());
    if (isMissingColumnError(error, "tournaments", "is_public")) {
      ({ data, error } = await supabase
        .from("tournaments")
        .insert([{ name, description, courts, user_id: userId }])
        .select()
        .single());
    }
  }

  if (error) {
    console.error("Error creating tournament:", error);
    throw error;
  }

  return data;
};

export const getTournaments = async (
  userId?: string,
  opts?: { includeArchived?: boolean }
) => {
  const includeArchived = opts?.includeArchived === true;
  let query = supabase.from("tournaments").select("*");

  if (!includeArchived) {
    query = query.is("archived_at", null);
  }

  if (userId) {
    query = query.eq("user_id", userId);
  }

  query = query.order("created_at", { ascending: false });

  let { data, error } = await query;

  if (
    error &&
    /archived_at|column .* does not exist|42703/i.test(error.message ?? "")
  ) {
    let fallback = supabase.from("tournaments").select("*");
    if (userId) fallback = fallback.eq("user_id", userId);
    fallback = fallback.order("created_at", { ascending: false });
    const res = await fallback;
    data = res.data;
    error = res.error;
  }

  if (error) {
    console.error("Error fetching tournaments:", error);
    throw error;
  }

  return data || [];
};

/** Lectura de torneo sin sesión (vista pública; mismo criterio que fetchAmericanoLivePublic). */
export const getTournamentByIdPublic = async (tournamentId: string) => {
  const tid = tournamentId.trim();
  if (!tid) return null;
  const { data, error } = await supabasePublicRead
    .from("tournaments")
    .select("*")
    .eq("id", tid)
    .maybeSingle();
  if (error) throw error;
  return data;
};

/** Obtiene un torneo por id (app con sesión: detalle de reta, edición). */
export const getTournamentById = async (tournamentId: string) => {
  const { data, error } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .maybeSingle();
  if (error) throw error;
  return data;
};

/** Torneo Americano en curso del usuario (no crear uno nuevo al re-entrar). */
export const findResumableAmericanoTournament = async (
  userId: string
): Promise<Tournament | null> => {
  const tried = new Set<string>();

  const tryId = async (id: string | null): Promise<Tournament | null> => {
    const tid = id?.trim();
    if (!tid || tried.has(tid)) return null;
    tried.add(tid);
    const t = await getTournamentById(tid);
    if (!t || t.user_id !== userId || t.is_finished) return null;
    if (isAmericanoResumable(tid)) return t;
    if (
      isMarkedAmericanoTournament(tid) &&
      (await isAmericanoResumableAsync(tid))
    ) {
      return t;
    }
    return null;
  };

  const candidateIds = [
    readAmericanoActiveTournamentId(),
    readAmericanoTournamentIdFromSession(),
    ...listMarkedAmericanoTournamentIds(),
  ];

  for (const id of candidateIds) {
    const hit = await tryId(id);
    if (hit) return hit;
  }

  const { data: recent, error } = await supabase
    .from("tournaments")
    .select("*")
    .eq("user_id", userId)
    .eq("is_finished", false)
    .order("created_at", { ascending: false })
    .limit(8);

  if (!error && recent?.length) {
    for (const t of recent) {
      if (tried.has(t.id)) continue;
      if (!isAmericanoResumable(t.id) && !isMarkedAmericanoTournament(t.id)) {
        continue;
      }
      if (isAmericanoResumable(t.id) || (await isAmericanoResumableAsync(t.id))) {
        return t;
      }
    }
  }

  return null;
};

/**
 * Config pública del torneo (lectura anónima). Tabla tournament_public_config con RLS: SELECT para anon.
 * Si la tabla no existe, devuelve null.
 */
export type TournamentPublicConfigSnippet = {
  format?: string | null;
  team_config?: TournamentTeamConfig | null;
};

/** Config pública en lote (home, listados). Lectura anónima vía tournament_public_config. */
export async function getTournamentsPublicConfigsByIds(
  tournamentIds: string[]
): Promise<Map<string, TournamentPublicConfigSnippet>> {
  const unique = Array.from(
    new Set(tournamentIds.map((id) => id.trim()).filter(Boolean))
  );
  if (unique.length === 0) return new Map();

  try {
    const { data, error } = await supabasePublicRead
      .from("tournament_public_config")
      .select("tournament_id, format, team_config")
      .in("tournament_id", unique);

    if (error) {
      console.warn("getTournamentsPublicConfigsByIds:", error.message);
      return new Map();
    }

    const map = new Map<string, TournamentPublicConfigSnippet>();
    for (const row of data ?? []) {
      const tid = row?.tournament_id as string | undefined;
      if (!tid) continue;
      map.set(tid, {
        format: row.format ?? undefined,
        team_config: (row.team_config as TournamentTeamConfig | null) ?? undefined,
      });
    }
    return map;
  } catch (e) {
    console.warn("getTournamentsPublicConfigsByIds:", e);
    return new Map();
  }
}

export function mergeTournamentWithPublicConfig<T extends Tournament>(
  tournament: T,
  publicConfig?: TournamentPublicConfigSnippet | null
): T {
  if (!publicConfig) return tournament;

  const format =
    publicConfig.format === "teams" || publicConfig.format === "round_robin"
      ? publicConfig.format
      : tournament.format;
  const team_config = publicConfig.team_config ?? tournament.team_config;

  if (format === tournament.format && team_config === tournament.team_config) {
    return tournament;
  }

  return {
    ...tournament,
    ...(format ? { format } : {}),
    ...(team_config ? { team_config } : {}),
  };
}

export const getTournamentPublicConfig = async (tournamentId: string): Promise<{ format: string; team_config: TournamentTeamConfig } | null> => {
  try {
    const { data, error } = await supabasePublicRead
      .from("tournament_public_config")
      .select("format, team_config")
      .eq("tournament_id", tournamentId.trim())
      .maybeSingle();
    if (error || !data) return null;
    if (data.format === "teams" && data.team_config?.teamNames?.length && data.team_config?.pairToTeam) return data as { format: string; team_config: TournamentTeamConfig };
    return null;
  } catch {
    return null;
  }
};

/** Config pública extendida (equipos + remontada final si existe la columna). */
export const getTournamentPublicConfigExtended = async (
  tournamentId: string
): Promise<{
  format?: string;
  team_config?: TournamentTeamConfig | null;
  championship_config?: unknown;
} | null> => {
  try {
    const { data, error } = await supabasePublicRead
      .from("tournament_public_config")
      .select("*")
      .eq("tournament_id", tournamentId.trim())
      .maybeSingle();
    if (error || !data) return null;
    return data as {
      format?: string;
      team_config?: TournamentTeamConfig | null;
      championship_config?: unknown;
    };
  } catch {
    return null;
  }
};

/**
 * Snapshot Americano para vista pública (columna americano_live en tournament_public_config).
 * Requiere columna americano_live en tournament_public_config.
 */
export type FetchAmericanoLivePublicResult =
  | { status: "ok"; snapshot: AmericanoDinamicoSnapshotV1 }
  | { status: "empty" }
  | { status: "missing_column" }
  | { status: "fetch_error"; message: string };

export const fetchAmericanoLivePublic = async (
  tournamentId: string
): Promise<FetchAmericanoLivePublicResult> => {
  const tid = tournamentId.trim();
  if (!tid) {
    return { status: "fetch_error", message: "tournamentId vacío" };
  }
  try {
    // `select("*")` evita 400 de PostgREST si `americano_live` aún no existe en el esquema:
    // con `select("americano_live")` PostgREST valida la columna y falla aunque la fila exista.
    const { data, error } = await supabasePublicRead
      .from("tournament_public_config")
      .select("*")
      .eq("tournament_id", tid)
      .maybeSingle();
    if (error) {
      if (
        isMissingColumnError(error, "tournament_public_config", "americano_live")
      ) {
        return { status: "missing_column" };
      }
      return { status: "fetch_error", message: error.message || "Error de lectura" };
    }
    if (!data) {
      return { status: "empty" };
    }
    const row = data as Record<string, unknown>;
    /** Sin clave en el JSON ⇒ PostgREST no expone la columna (no ejecutaste la migración). */
    if (!("americano_live" in row)) {
      return { status: "missing_column" };
    }
    const raw = row.americano_live as unknown;
    if (!raw || typeof raw !== "object") {
      return { status: "empty" };
    }
    const s = raw as Record<string, unknown>;
    if (
      s.version !== 1 ||
      !Array.isArray(s.rounds) ||
      !Array.isArray(s.ranking)
    ) {
      return { status: "empty" };
    }
    return { status: "ok", snapshot: raw as AmericanoDinamicoSnapshotV1 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: "fetch_error", message: msg };
  }
};

/**
 * Publica el estado del Americano para /public/americano/{id} (anon puede leer).
 */
export const upsertAmericanoLivePublic = async (
  tournamentId: string,
  snapshot: AmericanoDinamicoSnapshotV1
): Promise<boolean> => {
  try {
    const { data: existing, error: selErr } = await supabase
      .from("tournament_public_config")
      .select("format, team_config")
      .eq("tournament_id", tournamentId)
      .maybeSingle();
    if (selErr && !isMissingColumnError(selErr, "tournament_public_config", "americano_live")) {
      console.warn("tournament_public_config select:", selErr);
    }

    const { error } = await supabase.from("tournament_public_config").upsert(
      {
        tournament_id: tournamentId,
        format: (existing?.format as string) || "americano_dinamico",
        team_config:
          existing && existing.team_config != null
            ? existing.team_config
            : null,
        americano_live: snapshot as unknown as Record<string, unknown>,
      },
      { onConflict: "tournament_id" }
    );
    if (error) {
      if (
        isMissingColumnError(error, "tournament_public_config", "americano_live")
      ) {
        console.warn(
          "Columna americano_live ausente en tournament_public_config (Supabase)."
        );
        return false;
      }
      console.warn("upsertAmericanoLivePublic:", error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("upsertAmericanoLivePublic:", e);
    return false;
  }
};

export type ApplyAmericanoLiveMatchScoreResult =
  | { status: "ok"; snapshot: AmericanoDinamicoSnapshotV1 }
  | { status: "conflict"; scoreA: number; scoreB: number }
  | { status: "not_found" }
  | { status: "invalid" }
  | { status: "error"; message: string };

/**
 * Guardado atómico server-side de UN partido del Americano en vivo (BLK-02):
 * localiza el partido por `matchId` dentro del `rounds` vigente en el
 * servidor (bajo lock de fila) y solo parchea su score — dos dispositivos
 * guardando partidos DISTINTOS nunca se pisan. Ver
 * supabase/migrations/0004_apply_americano_live_match_score.sql.
 */
export const applyAmericanoLiveMatchScore = async (params: {
  tournamentId: string;
  matchId: string;
  scoreA: number;
  scoreB: number;
  ranking?: AmericanoSnapshotPlayer[];
  phase?: AmericanoSnapshotTournamentPhase;
  totalRounds?: number;
  roster?: AmericanoSnapshotRosterEntry[];
  force?: boolean;
}): Promise<ApplyAmericanoLiveMatchScoreResult> => {
  const { data, error } = await supabase.rpc("apply_americano_live_match_score", {
    p_tournament_id: params.tournamentId,
    p_match_id: params.matchId,
    p_score_a: params.scoreA,
    p_score_b: params.scoreB,
    p_ranking: params.ranking ?? null,
    p_phase: params.phase ?? null,
    p_total_rounds: params.totalRounds ?? null,
    p_roster: params.roster ?? null,
    p_force: params.force ?? false,
  });

  if (error) return { status: "error", message: error.message };

  const result = data as
    | {
        ok: boolean;
        error?: string;
        snapshot?: AmericanoDinamicoSnapshotV1;
        score_a?: number;
        score_b?: number;
      }
    | null;

  if (!result) return { status: "error", message: "Respuesta inválida del servidor." };

  if (!result.ok) {
    if (result.error === "conflict") {
      return {
        status: "conflict",
        scoreA: result.score_a ?? 0,
        scoreB: result.score_b ?? 0,
      };
    }
    if (result.error === "not_found" || result.error === "match_not_found") {
      return { status: "not_found" };
    }
    if (result.error === "invalid_score" || result.error === "invalid_match") {
      return { status: "invalid" };
    }
    return { status: "error", message: result.error ?? "No se pudo guardar el resultado." };
  }

  return { status: "ok", snapshot: result.snapshot as AmericanoDinamicoSnapshotV1 };
};

/**
 * Actualiza SOLO ranking/fase/totalRounds/roster del Americano en vivo, sin
 * tocar `rounds` (que durante "playing"/"finished" es propiedad exclusiva de
 * applyAmericanoLiveMatchScore). Evita que este guardado de metadata
 * sobreescriba en silencio el resultado de un partido guardado por otro
 * dispositivo momentos antes.
 */
export const applyAmericanoLiveMetadata = async (params: {
  tournamentId: string;
  ranking?: AmericanoSnapshotPlayer[];
  phase?: AmericanoSnapshotTournamentPhase;
  totalRounds?: number;
  roster?: AmericanoSnapshotRosterEntry[];
}): Promise<boolean> => {
  try {
    const { data, error } = await supabase.rpc("apply_americano_live_metadata", {
      p_tournament_id: params.tournamentId,
      p_ranking: params.ranking ?? null,
      p_phase: params.phase ?? null,
      p_total_rounds: params.totalRounds ?? null,
      p_roster: params.roster ?? null,
    });
    if (error) {
      console.warn("applyAmericanoLiveMetadata:", error);
      return false;
    }
    const result = data as { ok: boolean } | null;
    return Boolean(result?.ok);
  } catch (e) {
    console.warn("applyAmericanoLiveMetadata:", e);
    return false;
  }
};

export type ApplyAmericanoNewRoundResult =
  | { status: "created" | "exists"; round: AmericanoSnapshotRound & { idempotencyKey: string } }
  | { status: "out_of_order"; expectedRoundNumber: number }
  | { status: "invalid" }
  | { status: "not_found" }
  | { status: "error"; message: string };

/**
 * Agrega la ESTRUCTURA de una ronda nueva (FC-01, Fase C1) al `rounds`
 * vigente en el servidor — startTournament()/nextRound() generan la ronda
 * localmente pero, a diferencia de un marcador puntual, nunca tenían forma
 * de empujarla al servidor (regresión real de BLK-02: ver
 * supabase/migrations/0007_apply_americano_new_round.sql). Idempotente por
 * `idempotencyKey` estable (no un UUID aleatorio): un reintento de red de la
 * MISMA operación produce la MISMA key, así que nunca duplica una ronda ya
 * creada por otro dispositivo o por un reintento anterior.
 */
export const applyAmericanoNewRound = async (params: {
  tournamentId: string;
  roundNumber: number;
  idempotencyKey: string;
  round: AmericanoSnapshotRound;
  ranking?: AmericanoSnapshotPlayer[];
  phase?: AmericanoSnapshotTournamentPhase;
  totalRounds?: number;
  roster?: AmericanoSnapshotRosterEntry[];
}): Promise<ApplyAmericanoNewRoundResult> => {
  const { data, error } = await supabase.rpc("apply_americano_new_round", {
    p_tournament_id: params.tournamentId,
    p_round_number: params.roundNumber,
    p_idempotency_key: params.idempotencyKey,
    p_round_data: params.round,
    p_ranking: params.ranking ?? null,
    p_phase: params.phase ?? null,
    p_total_rounds: params.totalRounds ?? null,
    p_roster: params.roster ?? null,
  });

  if (error) return { status: "error", message: error.message };

  const result = data as
    | {
        ok: boolean;
        error?: string;
        status?: string;
        round?: AmericanoSnapshotRound & { idempotencyKey: string };
        expected_round_number?: number;
      }
    | null;

  if (!result) return { status: "error", message: "Respuesta inválida del servidor." };

  if (!result.ok) {
    if (result.error === "out_of_order") {
      return {
        status: "out_of_order",
        expectedRoundNumber: result.expected_round_number ?? params.roundNumber,
      };
    }
    if (result.error === "not_found") return { status: "not_found" };
    if (result.error === "invalid_round_number" || result.error === "invalid_round_data" || result.error === "invalid_idempotency_key") {
      return { status: "invalid" };
    }
    return { status: "error", message: result.error ?? "No se pudo guardar la ronda." };
  }

  if (!result.round) {
    return { status: "error", message: "Respuesta sin ronda del servidor." };
  }

  return {
    status: result.status === "exists" ? "exists" : "created",
    round: result.round,
  };
};

const publicConfigColumnCache = new Map<string, boolean>();

/**
 * Comprueba si una columna opcional existe en tournament_public_config (PostgREST).
 * Evita POST 400 al hacer upsert con campos que aún no están en el esquema.
 */
export const isTournamentPublicConfigColumnAvailable = async (
  column: string
): Promise<boolean> => {
  if (publicConfigColumnCache.has(column)) {
    return publicConfigColumnCache.get(column)!;
  }

  const { error } = await supabase
    .from("tournament_public_config")
    .select(column)
    .limit(1);

  const available =
    !error ||
    !isMissingColumnError(error, "tournament_public_config", column);

  if (error && !available) {
    publicConfigColumnCache.set(column, false);
    return false;
  }

  if (error) {
    console.warn(`tournament_public_config probe (${column}):`, error.message);
    publicConfigColumnCache.set(column, false);
    return false;
  }

  publicConfigColumnCache.set(column, available);
  return available;
};

/**
 * Guarda config pública para que la vista pública (anon) pueda mostrar tabla por equipos.
 * Llamar al iniciar reta por equipos. Tabla tournament_public_config con RLS: INSERT/UPDATE para authenticated.
 * Si el payload nuevo no trae logos, conserva los de la fila existente.
 */
export const upsertTournamentPublicConfig = async (
  tournamentId: string,
  format: "teams" | "round_robin",
  team_config: TournamentTeamConfig | null
) => {
  try {
    let nextConfig = team_config;
    const incomingHasLogos =
      Array.isArray(team_config?.teamLogos) &&
      team_config!.teamLogos!.some(
        (url) => typeof url === "string" && url.trim().length > 0
      );

    if (team_config && !incomingHasLogos) {
      const { data: existing } = await supabase
        .from("tournament_public_config")
        .select("team_config")
        .eq("tournament_id", tournamentId)
        .maybeSingle();
      const existingLogos = (
        existing?.team_config as TournamentTeamConfig | null | undefined
      )?.teamLogos;
      const existingHasLogos =
        Array.isArray(existingLogos) &&
        existingLogos.some(
          (url) => typeof url === "string" && url.trim().length > 0
        );
      if (existingHasLogos) {
        nextConfig = { ...team_config, teamLogos: existingLogos };
      }
    }

    const { error } = await supabase.from("tournament_public_config").upsert(
      { tournament_id: tournamentId, format, team_config: nextConfig ?? null },
      { onConflict: "tournament_id" }
    );
    if (error) {
      console.warn("tournament_public_config no disponible:", error.message);
    }
  } catch (e) {
    console.warn("tournament_public_config no disponible:", e);
  }
};

export const updateTournament = async (
  id: string,
  updates: Partial<Tournament>
) => {
  const { data, error } = await supabase
    .from("tournaments")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteTournament = async (id: string) => {
  await archiveTournament(id);
};

/**
 * Soft-archive de reta: oculta de Mis retas; conserva padre + carrera.
 */
export const archiveTournament = async (id: string) => {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("tournaments")
    .update({ archived_at: now })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (/archived_at|column .* does not exist|42703/i.test(error.message ?? "")) {
      throw new Error(
        "Falta aplicar supabase/sql/patch-soft-archive-mis-retas.sql en Supabase para archivar sin borrar la carrera."
      );
    }
    throw error;
  }
  return data;
};

export const restoreArchivedTournament = async (id: string) => {
  const { data, error } = await supabase
    .from("tournaments")
    .update({ archived_at: null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Funciones para Jugadores

/** @deprecated No usar para identidad. Alta explícita crea siempre fila nueva. */
export async function findLegacyPlayerExisting(
  name: string,
  email?: string | null,
  organizadorId?: string
): Promise<Player | null> {
  // Conservado solo por compatibilidad de imports; no atribuye identidad en altas.
  void name;
  void email;
  void organizadorId;
  return null;
}

/** Inserta en `players` sin tocar riviera_jugadores (usar playerPoolSync para enlazar).
 * Alta explícita: siempre crea fila nueva. Homónimos con distinto id son válidos. */
export const insertLegacyPlayer = async (
  name: string,
  userId: string,
  options?: { email?: string | null; tournamentId?: string }
): Promise<Player> => {
  const trimmed = name.trim();
  const email =
    options?.email?.trim() ||
    `${trimmed.toLowerCase().replace(/\s+/g, "")}@padel.local`;

  const basePayload = {
    name: trimmed,
    email,
  };

  const tournamentId = options?.tournamentId;
  const insertCandidates: Array<Record<string, unknown>> = [];
  insertCandidates.push({
    ...basePayload,
    user_id: userId,
    tournament_id: GLOBAL_TOURNAMENT_ID,
  });
  insertCandidates.push({
    ...basePayload,
    user_id: userId,
  });
  insertCandidates.push({
    ...basePayload,
    tournament_id: GLOBAL_TOURNAMENT_ID,
  });
  insertCandidates.push(basePayload);
  if (tournamentId) {
    insertCandidates.push({
      ...basePayload,
      tournament_id: tournamentId,
      user_id: userId,
    });
    insertCandidates.push({
      ...basePayload,
      tournament_id: tournamentId,
    });
  }

  let data: Player | null = null;
  let error: { code?: string; message?: string } | null = null;

  for (const payload of insertCandidates) {
    const result = await supabase
      .from("players")
      .insert([payload])
      .select()
      .single();

    if (!result.error) {
      data = result.data;
      error = null;
      break;
    }

    error = result.error;
    const isSchemaCompatibilityError =
      isMissingColumnError(error, "players", "user_id") ||
      isMissingColumnError(error, "players", "tournament_id") ||
      (error.code === "23502" &&
        typeof error.message === "string" &&
        error.message.includes('"tournament_id"'));

    if (!isSchemaCompatibilityError) {
      break;
    }
  }

  if (error) {
    console.error("Error creating player:", error);
    throw error;
  }
  if (!data) {
    throw new Error("No se pudo crear el jugador");
  }

  return data;
};

export const createPlayer = async (
  name: string,
  userId: string,
  tournamentId?: string
) => {
  const data = await insertLegacyPlayer(name, userId, { tournamentId });

  try {
    const { ensureRivieraJugadorForLegacyPlayer } = await import(
      "./rivieraJugadores/rivieraJugadoresService"
    );
    await ensureRivieraJugadorForLegacyPlayer(userId, {
      id: data.id,
      name: data.name,
      email: data.email,
    });
  } catch (linkErr) {
    console.warn("Riviera jugador link skipped:", linkErr);
  }

  return data;
};

export type { RegistrarParticipacionParams } from "./rivieraJugadores/types";
export { registrarParticipacion } from "./rivieraJugadores/rivieraJugadoresService";

type PlayerRow = Player & { user_id?: string | null };

function legacyPlayerKeepScore(p: PlayerRow): number {
  let score = 0;
  if (p.user_id) score += 20;
  const email = p.email?.trim().toLowerCase() ?? "";
  if (email && !email.endsWith("@padel.local")) score += 10;
  return score;
}

/** Un solo jugador por `players.id`. Homónimos con IDs distintos se conservan. */
export function dedupeLegacyPlayersById(players: Player[]): Player[] {
  const byId = new Map<string, PlayerRow>();

  for (const raw of players) {
    const p = raw as PlayerRow;
    const id = p.id?.trim();
    if (!id) continue;
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, p);
      continue;
    }
    const prevScore = legacyPlayerKeepScore(prev);
    const nextScore = legacyPlayerKeepScore(p);
    if (nextScore > prevScore) {
      byId.set(id, p);
      continue;
    }
    if (nextScore < prevScore) continue;
    if (p.created_at < prev.created_at) {
      byId.set(id, p);
    }
  }

  return Array.from(byId.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "es")
  );
}

/** @deprecated Use dedupeLegacyPlayersById — no dedupe por nombre. */
export const dedupeLegacyPlayersByName = dedupeLegacyPlayersById;

/**
 * Pool de jugadores para retas/torneos.
 * Con organizador: solo riviera_jugadores (fuente del ranking), enlazados a `players`.
 * Sin organizador: lectura legacy deduplicada (admin).
 *
 * Coalesce in-flight: llamadas concurrentes al mismo userId comparten una sola
 * promesa (p. ej. StrictMode / remount del armador) sin cambiar el resultado.
 */
const inflightLegacyPoolByUser = new Map<string, Promise<Player[]>>();

export const fetchLegacyPlayersPool = async (
  userId?: string
): Promise<Player[]> => {
  if (!userId) {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .order("name", { ascending: true });
    if (error) {
      const retry = await supabase.from("players").select("*");
      if (retry.error) throw retry.error;
      return dedupeLegacyPlayersById((retry.data ?? []) as Player[]);
    }
    return dedupeLegacyPlayersById((data ?? []) as Player[]);
  }

  const existing = inflightLegacyPoolByUser.get(userId);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const { getCachedLegacyPlayersPool } = await import(
        "./rivieraJugadores/playersPoolCache"
      );
      const cached = getCachedLegacyPlayersPool(userId);
      if (cached) return cached;

      const { buildLegacyPlayersFromRivieraRegistry } = await import(
        "./rivieraJugadores/playerPoolSync"
      );
      return await buildLegacyPlayersFromRivieraRegistry(userId);
    } finally {
      inflightLegacyPoolByUser.delete(userId);
    }
  })();

  inflightLegacyPoolByUser.set(userId, promise);
  return promise;
};

export const getPlayers = async (userId?: string, _tournamentId?: string) => {
  return fetchLegacyPlayersPool(userId);
};

export const deletePlayer = async (id: string) => {
  const { error } = await supabase.from("players").delete().eq("id", id);

  if (error) throw error;
};

export const updatePlayer = async (id: string, name: string) => {
  const email = `${name.toLowerCase().replace(/\s+/g, "")}@padel.local`;
  const { data, error } = await supabase
    .from("players")
    .update({ name: name.trim(), email })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Funciones para Parejas
/**
 * Inserta una pareja en `pairs` con un único request.
 * No envía `user_id` (columna inexistente → PGRST204 / 400 histórico).
 * `@param _userId` se conserva por compatibilidad de callers; no se persiste.
 */
export const createPair = async (
  tournamentId: string,
  player1Id: string,
  player2Id: string,
  _userId?: string
) => {
  // Validación temprana (sin round-trip) — nombres se completan tras fetch
  const precheck = buildCreatePairPayload({
    tournamentId,
    player1Id,
    player2Id,
    player1Name: "pending",
    player2Name: "pending",
  });
  if (!precheck.ok) {
    throw new Error(precheck.error);
  }

  const { data: player1, error: player1Error } = await supabase
    .from("players")
    .select("name")
    .eq("id", player1Id)
    .single();

  if (player1Error) {
    console.error("Error fetching player 1:", player1Error);
    throw player1Error;
  }

  const { data: player2, error: player2Error } = await supabase
    .from("players")
    .select("name")
    .eq("id", player2Id)
    .single();

  if (player2Error) {
    console.error("Error fetching player 2:", player2Error);
    throw player2Error;
  }

  const built = buildCreatePairPayload({
    tournamentId,
    player1Id,
    player2Id,
    player1Name: player1.name,
    player2Name: player2.name,
  });

  if (!built.ok) {
    throw new Error(built.error);
  }

  const { data, error } = await supabase
    .from("pairs")
    .insert([built.payload])
    .select(PAIR_SELECT_WITH_PLAYERS)
    .single();

  if (error) {
    console.error("[pair-create] supabase error", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      payload: built.payload,
    });
    throw error;
  }

  return data;
};

export const getPairs = async (tournamentId: string) => {
  const { data, error } = await supabase
    .from("pairs")
    .select(
      `
      *,
      player1:players!player1_id(*),
      player2:players!player2_id(*)
    `
    )
    .eq("tournament_id", tournamentId)
    .order("created_at");

  if (error) {
    console.error("Database error fetching pairs:", error);
    throw error;
  }

  return data;
};

export const updatePair = async (id: string, updates: Partial<Pair>) => {
  const { data, error } = await supabase
    .from("pairs")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deletePair = async (id: string) => {
  const { error } = await supabase.from("pairs").delete().eq("id", id);

  if (error) throw error;
};

export const deletePairsByTournament = async (tournamentId: string) => {
  const { error } = await supabase
    .from("pairs")
    .delete()
    .eq("tournament_id", tournamentId);

  if (error) throw error;
};

// Funciones para Partidos
/** null = desconocido; false = columna ausente (no reintentar en cada partido). */
let matchesTableSupportsMatchType: boolean | null = null;

const MATCH_INSERT_CHUNK = 40;

export type CreateMatchBulkRow = {
  tournamentId: string;
  pair1Id: string;
  pair2Id: string;
  pair1Name: string;
  pair2Name: string;
  court: number;
  round: number;
  matchType?: "roundrobin" | "championship";
};

function buildMatchInsertPayload(
  row: CreateMatchBulkRow,
  includeMatchType: boolean
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    tournament_id: row.tournamentId,
    pair1_id: row.pair1Id,
    pair2_id: row.pair2Id,
    pair1_name: row.pair1Name,
    pair2_name: row.pair2Name,
    court: row.court,
    round: row.round,
  };
  if (includeMatchType && row.matchType) {
    payload.match_type = row.matchType;
  }
  return payload;
}

/**
 * Inserta muchos partidos en pocos requests (chunks).
 * Usa nombres ya en memoria — no re-fetch de pairs por partido.
 * Sin `user_id` (columna inexistente en prod).
 */
export async function createMatchesBulk(
  rows: CreateMatchBulkRow[]
): Promise<Match[]> {
  if (rows.length === 0) return [];

  const wantsMatchType =
    matchesTableSupportsMatchType !== false &&
    rows.some((r) => Boolean(r.matchType));

  const out: Match[] = [];
  for (let i = 0; i < rows.length; i += MATCH_INSERT_CHUNK) {
    const chunk = rows.slice(i, i + MATCH_INSERT_CHUNK);
    let payloads = chunk.map((r) =>
      buildMatchInsertPayload(r, wantsMatchType)
    );

    let { data, error } = await supabase
      .from("matches")
      .insert(payloads)
      .select("*");

    if (
      error &&
      wantsMatchType &&
      isMissingColumnError(error, "matches", "match_type")
    ) {
      matchesTableSupportsMatchType = false;
      payloads = chunk.map((r) => buildMatchInsertPayload(r, false));
      ({ data, error } = await supabase
        .from("matches")
        .insert(payloads)
        .select("*"));
    }

    if (error) {
      console.error(
        "Database error creating matches bulk:",
        error.message,
        error
      );
      throw error;
    }
    if (data?.length) out.push(...(data as Match[]));
  }
  return out;
}

/**
 * Inserta un partido. La tabla `matches` en producción NO tiene `user_id` ni
 * (a menudo) `match_type` — mandarlos provoca PGRST204/400 por cada partido
 * del cuadro y deja la UI de "Iniciar reta" llena de errores rojos.
 * `@param _userId` se conserva por compatibilidad de callers; no se persiste.
 *
 * Preferir `createMatchesBulk` al armar el cuadro completo (inicio de reta).
 */
export const createMatch = async (
  tournamentId: string,
  pair1Id: string,
  pair2Id: string,
  court: number,
  round: number = 1,
  _userId: string,
  matchType?: "roundrobin" | "championship"
) => {
  // First, get the pair names from the pairs table
  const { data: pair1, error: pair1Error } = await supabase
    .from("pairs")
    .select("player1_name, player2_name")
    .eq("id", pair1Id)
    .single();

  if (pair1Error) {
    console.error("Error fetching pair 1:", pair1Error);
    throw pair1Error;
  }

  const { data: pair2, error: pair2Error } = await supabase
    .from("pairs")
    .select("player1_name, player2_name")
    .eq("id", pair2Id)
    .single();

  if (pair2Error) {
    console.error("Error fetching pair 2:", pair2Error);
    throw pair2Error;
  }

  const [row] = await createMatchesBulk([
    {
      tournamentId,
      pair1Id,
      pair2Id,
      pair1Name: `${pair1.player1_name}/${pair1.player2_name}`,
      pair2Name: `${pair2.player1_name}/${pair2.player2_name}`,
      court,
      round,
      matchType,
    },
  ]);
  if (!row) {
    throw new Error("No se pudo crear el partido");
  }
  return row;
};

export const getMatches = async (tournamentId: string) => {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("court");

  if (error) throw error;
  return data;
};

export const updateMatch = async (id: string, updates: Partial<Match>) => {
  const { data, error } = await supabase
    .from("matches")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteMatchesByTournament = async (tournamentId: string) => {
  const { error } = await supabase
    .from("matches")
    .delete()
    .eq("tournament_id", tournamentId);

  if (error) throw error;
};

export type SafeMatchDeleteOutcome =
  | { outcome: "deleted"; warning?: string }
  | { outcome: "cancelled"; warning: string }
  | { outcome: "noop" };

/**
 * Borra partidos de una reta tras archivar en rivieraopen.com (si hay finalizados).
 * Si el archivado falla o está incompleto, pide confirmación explícita al organizador.
 */
export async function deleteMatchesByTournamentSafely(
  tournamentId: string,
  confirmDestructive: (prompt: string) => boolean
): Promise<SafeMatchDeleteOutcome> {
  const { decideSafeMatchDeletion } = await import("./retaArchive/retaArchiveApi");
  const matches = await getMatches(tournamentId);
  if (matches.length === 0) {
    return { outcome: "noop" };
  }

  const finishedCount = matches.filter((m) => m.status === "finished").length;
  if (finishedCount > 0) {
    const decision = await decideSafeMatchDeletion(
      tournamentId,
      finishedCount,
      confirmDestructive
    );
    if (!decision.proceed) {
      return {
        outcome: "cancelled",
        warning:
          decision.warning ??
          "Operación cancelada para preservar el detalle de partidos.",
      };
    }
    await deleteMatchesByTournament(tournamentId);
    return { outcome: "deleted", warning: decision.warning };
  }

  await deleteMatchesByTournament(tournamentId);
  return { outcome: "deleted" };
}

// Funciones para Juegos
export type CreateGameScores = Pick<
  Game,
  | "pair1_games"
  | "pair2_games"
  | "is_tie_break"
  | "tie_break_pair1_points"
  | "tie_break_pair2_points"
>;

export const getNextGameNumber = async (matchId: string): Promise<number> => {
  const existing = await getGames(matchId);
  if (existing.length === 0) return 1;
  return Math.max(...existing.map((g) => g.game_number)) + 1;
};

const insertGameRow = async (row: Record<string, unknown>) =>
  supabase.from("games").insert([row]).select().single();

function isDuplicateGameError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  const msg = (error.message || "").toLowerCase();
  return msg.includes("duplicate") || msg.includes("unique");
}

function formatGameInsertError(error: { code?: string; message?: string } | null): string {
  if (!error) return "Error desconocido";
  const code = error.code ? `[${error.code}] ` : "";
  return `${code}${error.message || "Error al guardar"}`;
}

export const createGame = async (
  matchId: string,
  gameNumber: number,
  _userId: string,
  scores?: Partial<CreateGameScores>
) => {
  const scoresResolved = {
    pair1_games: scores?.pair1_games ?? 0,
    pair2_games: scores?.pair2_games ?? 0,
    is_tie_break: scores?.is_tie_break ?? false,
    tie_break_pair1_points: scores?.tie_break_pair1_points ?? 0,
    tie_break_pair2_points: scores?.tie_break_pair2_points ?? 0,
  };

  let gameNumberToUse = gameNumber;

  for (let duplicateRetry = 0; duplicateRetry < 2; duplicateRetry++) {
    // La tabla `games` en producción no tiene `user_id`; incluirlo devuelve PGRST204 (400).
    let row: Record<string, unknown> = {
      match_id: matchId,
      game_number: gameNumberToUse,
      pair1_games: scoresResolved.pair1_games,
      pair2_games: scoresResolved.pair2_games,
      is_tie_break: scoresResolved.is_tie_break,
      tie_break_pair1_points: scoresResolved.tie_break_pair1_points,
      tie_break_pair2_points: scoresResolved.tie_break_pair2_points,
    };

    for (let stripPass = 0; stripPass < 4; stripPass++) {
      const { data, error } = await insertGameRow(row);
      if (!error) return data;

      if (isDuplicateGameError(error) && duplicateRetry === 0) {
        gameNumberToUse = await getNextGameNumber(matchId);
        break;
      }

      const optionalColumns = [
        "is_tie_break",
        "tie_break_pair1_points",
        "tie_break_pair2_points",
      ] as const;
      const currentRow = row;
      let missingCol: (typeof optionalColumns)[number] | undefined;
      for (const col of optionalColumns) {
        if (
          col in currentRow &&
          isMissingColumnError(error, "games", col)
        ) {
          missingCol = col;
          break;
        }
      }
      if (missingCol) {
        const { [missingCol]: _removed, ...rest } = row;
        row = rest;
        continue;
      }

      const err = new Error(formatGameInsertError(error)) as Error & {
        code?: string;
      };
      err.code = error.code;
      throw err;
    }
  }

  throw new Error("No se pudo guardar el juego (número de juego duplicado)");
};

export const getGames = async (matchId: string) => {
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .eq("match_id", matchId)
    .order("game_number");

  if (error) throw error;
  return data;
};

// Nueva función para obtener todos los games de una reta
export const getTournamentGames = async (tournamentId: string) => {
  try {
    // Primero obtenemos todos los matches de la reta
    const { data: matches, error: matchesError } = await supabase
      .from("matches")
      .select("id")
      .eq("tournament_id", tournamentId);

    if (matchesError) throw matchesError;

    if (!matches || matches.length === 0) {
      return []; // No hay matches, no hay games
    }

    // Extraemos los IDs de los matches
    const matchIds = matches.map((match) => match.id);

    // Ahora obtenemos todos los games de esos matches
    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select("*")
      .in("match_id", matchIds)
      .order("game_number");

    if (gamesError) throw gamesError;
    return games || [];
  } catch (error) {
    console.error("Error getting tournament games:", error);
    throw error;
  }
};

export const updateGame = async (id: string, updates: Partial<Game>) => {
  const { data, error } = await supabase
    .from("games")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteGame = async (id: string) => {
  const { error } = await supabase.from("games").delete().eq("id", id);

  if (error) throw error;
};

export interface RetaMatchSetInput {
  pair1_games: number;
  pair2_games: number;
  is_tie_break?: boolean;
  tie_break_pair1_points?: number;
  tie_break_pair2_points?: number;
}

export type ApplyRetaMatchUpdateResult =
  | { status: "updated" | "unchanged"; pair1Score: number; pair2Score: number; sets: Game[] }
  | { status: "updated_metadata" }
  | { status: "conflict"; pair1Score: number; pair2Score: number; sets: Game[] }
  | { status: "tournament_closed" }
  /** Alineación dinámica: la ronda ya se usó para generar un bloque posterior -- ver 0010_dynamic_team_lineup_blocks.sql. */
  | { status: "dynamic_block_locked" }
  | { status: "not_found" }
  | { status: "invalid" }
  | { status: "error"; message: string };

/**
 * Guardado atómico server-side de TODA actualización de un partido de Reta
 * (FC-04 + FC-05, Fase C1): cancha/ronda y/o resultado (sets), bajo lock de
 * fila + idempotencia + conflicto explícito -- mismo patrón que ya usan
 * Liga/Torneo Express/Americano. Reemplaza el camino anterior de 3-4
 * llamadas separadas (getGames/getNextGameNumber/createGame/updateMatch)
 * sin lock. Ver supabase/migrations/0009_apply_reta_match_update.sql.
 */
export const applyRetaMatchUpdate = async (params: {
  matchId: string;
  court?: number;
  round?: number;
  sets?: RetaMatchSetInput[];
  force?: boolean;
  adminOverride?: boolean;
  adminReason?: string;
}): Promise<ApplyRetaMatchUpdateResult> => {
  const { data, error } = await supabase.rpc("apply_reta_match_update", {
    p_match_id: params.matchId,
    p_court: params.court ?? null,
    p_round: params.round ?? null,
    p_sets: params.sets ?? null,
    p_force: params.force ?? false,
    p_admin_override: params.adminOverride ?? false,
    p_admin_reason: params.adminReason ?? null,
  });

  if (error) return { status: "error", message: error.message };

  const result = data as
    | {
        ok: boolean;
        error?: string;
        status?: string;
        pair1_score?: number;
        pair2_score?: number;
        sets?: Game[];
      }
    | null;

  if (!result) return { status: "error", message: "Respuesta inválida del servidor." };

  if (!result.ok) {
    if (result.error === "conflict") {
      return {
        status: "conflict",
        pair1Score: result.pair1_score ?? 0,
        pair2Score: result.pair2_score ?? 0,
        sets: (result.sets as Game[]) ?? [],
      };
    }
    if (result.error === "tournament_closed") return { status: "tournament_closed" };
    if (result.error === "dynamic_block_locked") return { status: "dynamic_block_locked" };
    if (result.error === "not_found") return { status: "not_found" };
    if (result.error === "invalid_sets") return { status: "invalid" };
    return { status: "error", message: result.error ?? "No se pudo guardar el resultado." };
  }

  if (result.status === "updated_metadata") {
    return { status: "updated_metadata" };
  }

  return {
    status: result.status === "unchanged" ? "unchanged" : "updated",
    pair1Score: result.pair1_score ?? 0,
    pair2Score: result.pair2_score ?? 0,
    sets: (result.sets as Game[]) ?? [],
  };
};
