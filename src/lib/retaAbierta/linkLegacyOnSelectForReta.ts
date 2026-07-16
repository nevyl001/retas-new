/**
 * Vínculo legacy estricto al seleccionar un concedido en el armado de retas.
 * SOLO por riviera_jugador_id / legacy_player_id — NUNCA por nombre.
 * Prohibido: ensure crudo del pool sync, find-by-name, insertLegacy con match por nombre.
 */
import { supabase } from "../supabaseClient";
import { GLOBAL_TOURNAMENT_ID, isMissingColumnError } from "../db/schemaHelpers";
import type { Player } from "../db/types";
import { linkLegacyPlayerId } from "../rivieraJugadores/rivieraJugadoresService";
import type { RivieraJugador } from "../rivieraJugadores/types";

function isRealEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  return !email.trim().toLowerCase().endsWith("@padel.local");
}

/** Email sintético único por riviera_jugador_id (homónimos no colisionan). */
export function syntheticEmailForRivieraJugadorId(
  rivieraJugadorId: string
): string {
  const compact = rivieraJugadorId.replace(/-/g, "").toLowerCase();
  return `reta-link-${compact}@padel.local`;
}

export type LinkLegacyOnSelectDeps = {
  fetchRivieraJugadorById: (
    id: string
  ) => Promise<Pick<
    RivieraJugador,
    "id" | "nombre" | "email" | "legacy_player_id" | "foto_url" | "rating"
  > | null>;
  fetchPlayerById: (id: string) => Promise<Player | null>;
  /** Insert puro en players — prohibido buscar por nombre. */
  insertPlayerRow: (input: {
    name: string;
    email: string;
    userId: string;
  }) => Promise<Player>;
  linkLegacyPlayerId: (
    rivieraJugadorId: string,
    legacyPlayerId: string
  ) => Promise<void>;
};

export type LinkLegacyOnSelectResult = {
  player: Player;
  /** true solo si se insertó una fila nueva en players. */
  created: boolean;
  rivieraJugadorId: string;
};

async function defaultFetchRivieraJugadorById(
  id: string
): Promise<Pick<
  RivieraJugador,
  "id" | "nombre" | "email" | "legacy_player_id" | "foto_url" | "rating"
> | null> {
  const { data, error } = await supabase
    .from("riviera_jugadores")
    .select("id, nombre, email, legacy_player_id, foto_url, rating")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Pick<
    RivieraJugador,
    "id" | "nombre" | "email" | "legacy_player_id" | "foto_url" | "rating"
  > | null;
}

async function defaultFetchPlayerById(id: string): Promise<Player | null> {
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return null;
  return (data as Player) ?? null;
}

/**
 * Inserta en `players` sin búsqueda previa por nombre/email.
 * Copia nombre + email de la ficha (o email sintético por riviera id).
 */
export async function insertPlayerRowWithoutNameLookup(input: {
  name: string;
  email: string;
  userId: string;
}): Promise<Player> {
  const trimmed = input.name.trim();
  const email = input.email.trim();
  if (!trimmed || !email) {
    throw new Error("Faltan nombre o email para vincular al pool de retas");
  }

  const basePayload = { name: trimmed, email };
  const candidates: Array<Record<string, unknown>> = [
    {
      ...basePayload,
      user_id: input.userId,
      tournament_id: GLOBAL_TOURNAMENT_ID,
    },
    { ...basePayload, user_id: input.userId },
    { ...basePayload, tournament_id: GLOBAL_TOURNAMENT_ID },
    basePayload,
  ];

  let data: Player | null = null;
  let lastError: { code?: string; message?: string } | null = null;

  for (const payload of candidates) {
    const result = await supabase
      .from("players")
      .insert([payload])
      .select()
      .single();
    if (!result.error) {
      data = result.data as Player;
      lastError = null;
      break;
    }
    lastError = result.error;
    const schemaOk =
      isMissingColumnError(lastError, "players", "user_id") ||
      isMissingColumnError(lastError, "players", "tournament_id") ||
      (lastError.code === "23502" &&
        typeof lastError.message === "string" &&
        lastError.message.includes('"tournament_id"'));
    if (!schemaOk) break;
  }

  if (lastError || !data) {
    throw lastError ?? new Error("No se pudo crear el player legacy");
  }
  return data;
}

function defaultDeps(): LinkLegacyOnSelectDeps {
  return {
    fetchRivieraJugadorById: defaultFetchRivieraJugadorById,
    fetchPlayerById: defaultFetchPlayerById,
    insertPlayerRow: insertPlayerRowWithoutNameLookup,
    linkLegacyPlayerId,
  };
}

/**
 * Vincula (o reutiliza) players.id para un riviera_jugador_id existente.
 * Idempotente por id. No crea Riviera ID ni identidad.
 *
 * Tres casos:
 * 1) legacy_player_id + fila players existe → devolver (0 inserts)
 * 2) legacy_player_id HUÉRFANO (fila players inexistente / no visible) →
 *    crear players + re-vincular linkLegacyPlayerId (repara el puntero)
 * 3) sin legacy_player_id → crear + vincular
 */
export async function linkLegacyOnSelectForReta(
  organizadorId: string,
  rivieraJugadorId: string,
  depsPartial?: Partial<LinkLegacyOnSelectDeps>
): Promise<LinkLegacyOnSelectResult> {
  const org = organizadorId.trim();
  const rjId = rivieraJugadorId.trim();
  if (!org || !rjId) {
    throw new Error("Faltan organizador o riviera_jugador_id");
  }

  const deps: LinkLegacyOnSelectDeps = {
    ...defaultDeps(),
    ...depsPartial,
  };

  const rj = await deps.fetchRivieraJugadorById(rjId);
  if (!rj) {
    throw new Error("No encontramos al jugador en el registro Riviera");
  }

  const existingLegacyId = rj.legacy_player_id?.trim() || null;
  if (existingLegacyId) {
    const existing = await deps.fetchPlayerById(existingLegacyId);
    if (existing) {
      // Caso 1: vínculo sano
      return {
        player: {
          ...existing,
          name: rj.nombre.trim() || existing.name,
        },
        created: false,
        rivieraJugadorId: rj.id,
      };
    }
    // Caso 2: puntero huérfano — cae a crear + re-vincular (abajo)
  }

  // Caso 2 (huérfano) o 3 (sin legacy)
  const nombre = rj.nombre.trim();
  if (!nombre) {
    throw new Error("La ficha Riviera no tiene nombre");
  }

  const email = isRealEmail(rj.email)
    ? rj.email!.trim()
    : syntheticEmailForRivieraJugadorId(rj.id);

  const created = await deps.insertPlayerRow({
    name: nombre,
    email,
    userId: org,
  });

  await deps.linkLegacyPlayerId(rj.id, created.id);

  return {
    player: created,
    created: true,
    rivieraJugadorId: rj.id,
  };
}
