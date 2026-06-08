import { supabase, supabasePublicRead } from "./supabaseClient";
import { GLOBAL_TOURNAMENT_ID, isMissingColumnError } from "./db/schemaHelpers";
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
  readAmericanoActiveTournamentId,
  readAmericanoTournamentIdFromSession,
  type AmericanoDinamicoSnapshotV1,
} from "./americanoDinamicoStorage";
import { isAmericanoTournament } from "./gameModeMapping";
import { normalizePlayerNameKey } from "./rivieraJugadores/playerNameKey";

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
  console.log("Creating tournament:", { name, description, courts, userId, format });

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

  console.log("Tournament created successfully:", data);
  return data;
};

export const getTournaments = async (userId?: string) => {
  console.log("Fetching tournaments for user:", userId);

  let query = supabase
    .from("tournaments")
    .select("*")
    .order("created_at", { ascending: false });

  // Si se proporciona userId, filtrar por usuario
  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching tournaments:", error);
    throw error;
  }

  console.log(
    "Tournaments fetched successfully:",
    data?.length || 0,
    "tournaments"
  );
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
    if (!isAmericanoTournament(t) || !isAmericanoResumable(tid)) {
      return null;
    }
    return t;
  };

  const fromActive = await tryId(readAmericanoActiveTournamentId());
  if (fromActive) {
    console.log("Loading existing americano tournament:", fromActive.id, fromActive.name);
    return fromActive;
  }

  const fromSession = await tryId(readAmericanoTournamentIdFromSession());
  if (fromSession) {
    console.log("Loading existing americano tournament:", fromSession.id, fromSession.name);
    return fromSession;
  }

  const list = await getTournaments(userId);
  for (const t of list) {
    if (t.is_finished) continue;
    if (!isAmericanoTournament(t)) continue;
    if (!isAmericanoResumable(t.id)) continue;
    console.log("Loading existing americano tournament:", t.id, t.name);
    return t;
  }

  return null;
};

/**
 * Config pública del torneo (lectura anónima). Tabla tournament_public_config con RLS: SELECT para anon.
 * Si la tabla no existe, devuelve null.
 */
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
        format: (existing?.format as string) || "round_robin",
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
 */
export const upsertTournamentPublicConfig = async (
  tournamentId: string,
  format: "teams" | "round_robin",
  team_config: TournamentTeamConfig | null
) => {
  try {
    const { error } = await supabase.from("tournament_public_config").upsert(
      { tournament_id: tournamentId, format, team_config: team_config ?? null },
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
  const { error } = await supabase.from("tournaments").delete().eq("id", id);

  if (error) throw error;
};

// Funciones para Jugadores

function normalizeLegacyPlayerKey(name: string): string {
  return normalizePlayerNameKey(name);
}

/** Busca jugador existente en el pool global (evita duplicados en players). */
export async function findLegacyPlayerExisting(
  name: string,
  email?: string | null,
  organizadorId?: string
): Promise<Player | null> {
  const nameKey = normalizeLegacyPlayerKey(name);
  const emailKey = email?.trim().toLowerCase();

  if (emailKey) {
    const { data: byEmail } = await supabase
      .from("players")
      .select("*")
      .ilike("email", emailKey);
    if (byEmail?.length) {
      const match = (byEmail as Player[]).find(
        (p) => normalizeLegacyPlayerKey(p.name) === nameKey
      );
      if (match) return match;
    }
  }

  const { data: byName } = await supabase
    .from("players")
    .select("*")
    .ilike("name", name.trim());
  if (byName?.length) {
    const matches = (byName as Player[]).filter(
      (p) => normalizeLegacyPlayerKey(p.name) === nameKey
    );
    if (!matches.length) return null;
    if (organizadorId) {
      const withUser = matches.find(
        (p) => (p as Player & { user_id?: string }).user_id === organizadorId
      );
      if (withUser) return withUser;
    }
    return matches[0];
  }

  return null;
}

/** Inserta en `players` sin tocar riviera_jugadores (usar playerPoolSync para enlazar). */
export const insertLegacyPlayer = async (
  name: string,
  userId: string,
  options?: { email?: string | null; tournamentId?: string }
): Promise<Player> => {
  const trimmed = name.trim();
  const email =
    options?.email?.trim() ||
    `${trimmed.toLowerCase().replace(/\s+/g, "")}@padel.local`;

  const existing = await findLegacyPlayerExisting(trimmed, email, userId);
  if (existing) {
    if (userId && playersTableSupportsUserIdFilter !== false) {
      const row = existing as Player & { user_id?: string | null };
      if (!row.user_id) {
        const { error: uidErr } = await supabase
          .from("players")
          .update({ user_id: userId })
          .eq("id", existing.id);
        if (
          uidErr &&
          isMissingColumnError(uidErr, "players", "user_id")
        ) {
          playersTableSupportsUserIdFilter = false;
        }
      }
    }
    return existing;
  }

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
  console.log("Creating player:", { name, userId, tournamentId });

  const data = await insertLegacyPlayer(name, userId, { tournamentId });

  console.log("Player created successfully:", data);

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

/** Evita repetir GET con filtro user_id si el esquema no tiene esa columna (42703 / PGRST204). */
let playersTableSupportsUserIdFilter: boolean | null = null;

type PlayerRow = Player & { user_id?: string | null };

function normalizePlayerName(name: string): string {
  return normalizePlayerNameKey(name);
}

function legacyPlayerKeepScore(p: PlayerRow): number {
  let score = 0;
  if (p.user_id) score += 20;
  const email = p.email?.trim().toLowerCase() ?? "";
  if (email && !email.endsWith("@padel.local")) score += 10;
  return score;
}

/** Un solo jugador por nombre (evita duplicados tras sync o migración). */
export function dedupeLegacyPlayersByName(players: Player[]): Player[] {
  const byName = new Map<string, PlayerRow>();

  for (const raw of players) {
    const p = raw as PlayerRow;
    const key = normalizePlayerName(p.name);
    if (!key) continue;
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, p);
      continue;
    }
    const prevScore = legacyPlayerKeepScore(prev);
    const nextScore = legacyPlayerKeepScore(p);
    if (nextScore > prevScore) {
      byName.set(key, p);
      continue;
    }
    if (nextScore < prevScore) continue;
    if (p.created_at < prev.created_at) {
      byName.set(key, p);
    }
  }

  return Array.from(byName.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "es")
  );
}

/**
 * Pool de jugadores para retas/torneos.
 * Con organizador: solo riviera_jugadores (fuente del ranking), enlazados a `players`.
 * Sin organizador: lectura legacy deduplicada (admin).
 */
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
      return dedupeLegacyPlayersByName((retry.data ?? []) as Player[]);
    }
    return dedupeLegacyPlayersByName((data ?? []) as Player[]);
  }

  const { buildLegacyPlayersFromRivieraRegistry } = await import(
    "./rivieraJugadores/playerPoolSync"
  );
  return buildLegacyPlayersFromRivieraRegistry(userId);
};

export const getPlayers = async (userId?: string, tournamentId?: string) => {
  console.log(
    "Fetching global players for user:",
    userId,
    "tournament (ignored for pool):",
    tournamentId
  );

  const data = await fetchLegacyPlayersPool(userId);
  console.log("Players fetched successfully:", data.length, "players");
  return data;
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
export const createPair = async (
  tournamentId: string,
  player1Id: string,
  player2Id: string,
  userId: string
) => {
  console.log("=== CREATING PAIR IN DATABASE ===");
  console.log("Tournament ID:", tournamentId);
  console.log("Player 1 ID:", player1Id);
  console.log("Player 2 ID:", player2Id);

  // First, get the player names from the players table
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

  console.log("Player 1 name:", player1.name);
  console.log("Player 2 name:", player2.name);

  const { data, error } = await supabase
    .from("pairs")
    .insert([
      {
        tournament_id: tournamentId,
        player1_id: player1Id,
        player2_id: player2Id,
        player1_name: player1.name,
        player2_name: player2.name,
        user_id: userId,
      },
    ])
    .select(
      `
      *,
      player1:players!player1_id(*),
      player2:players!player2_id(*)
    `
    )
    .single();

  let pairData = data;
  let pairError = error;

  if (isMissingColumnError(pairError, "pairs", "user_id")) {
    ({ data: pairData, error: pairError } = await supabase
      .from("pairs")
      .insert([
        {
          tournament_id: tournamentId,
          player1_id: player1Id,
          player2_id: player2Id,
          player1_name: player1.name,
          player2_name: player2.name,
        },
      ])
      .select(
        `
      *,
      player1:players!player1_id(*),
      player2:players!player2_id(*)
    `
      )
      .single());
  }

  if (pairError) {
    console.error("Database error creating pair:", pairError);
    throw pairError;
  }

  console.log("Pair created in database:", pairData);
  return pairData;
};

export const getPairs = async (tournamentId: string) => {
  console.log("=== FETCHING PAIRS FROM DATABASE ===");
  console.log("Tournament ID:", tournamentId);

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

  console.log("Pairs fetched from database:", data);
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
export const createMatch = async (
  tournamentId: string,
  pair1Id: string,
  pair2Id: string,
  court: number,
  round: number = 1,
  userId: string,
  matchType?: "roundrobin" | "championship"
) => {
  console.log("=== CREATING MATCH IN DATABASE ===");
  console.log("Tournament ID:", tournamentId);
  console.log("Pair 1 ID:", pair1Id);
  console.log("Pair 2 ID:", pair2Id);
  console.log("Court:", court);
  console.log("Round:", round);

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

  const pair1Name = `${pair1.player1_name}/${pair1.player2_name}`;
  const pair2Name = `${pair2.player1_name}/${pair2.player2_name}`;

  console.log("Pair 1 name:", pair1Name);
  console.log("Pair 2 name:", pair2Name);

  // Crear el objeto de inserción sin el campo round por ahora
  const insertData: any = {
    tournament_id: tournamentId,
    pair1_id: pair1Id,
    pair2_id: pair2Id,
    pair1_name: pair1Name,
    pair2_name: pair2Name,
    court,
    user_id: userId,
  };

  insertData.round = round;
  if (matchType) {
    insertData.match_type = matchType;
  }

  const insertOnce = async (payload: Record<string, unknown>) =>
    supabase.from("matches").insert([payload]).select("*").single();

  let { data, error } = await insertOnce(insertData);

  if (error && matchType) {
    const { match_type: _omit, ...withoutType } = insertData;
    ({ data, error } = await insertOnce(withoutType));
  }

  if (error && isMissingColumnError(error, "matches", "user_id")) {
    const { user_id: _omitUserId, match_type: _omitType, ...withoutUser } =
      insertData;
    ({ data, error } = await insertOnce(withoutUser));
  }

  if (error) {
    console.error("Database error creating match:", error.message, error);
    throw error;
  }

  console.log("Match created in database:", data);
  return data;
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

// Funciones para Juegos
export const createGame = async (
  matchId: string,
  gameNumber: number,
  userId: string
) => {
  let { data, error } = await supabase
    .from("games")
    .insert([
      {
        match_id: matchId,
        game_number: gameNumber,
        user_id: userId,
      },
    ])
    .select()
    .single();

  if (isMissingColumnError(error, "games", "user_id")) {
    ({ data, error } = await supabase
      .from("games")
      .insert([
        {
          match_id: matchId,
          game_number: gameNumber,
        },
      ])
      .select()
      .single());
  }

  if (error) throw error;
  return data;
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
