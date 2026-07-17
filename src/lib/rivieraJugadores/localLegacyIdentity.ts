/**
 * Identidad legacy local fail-closed (compartido Reta Bloque 1 + Fase 3 modos).
 * Nunca escribe source.legacy_player_id desde contexto de un grantee.
 * Nunca resuelve identidad por nombre/email.
 */
import { supabase } from "../supabaseClient";
import { GLOBAL_TOURNAMENT_ID, isMissingColumnError } from "../db/schemaHelpers";
import type { Player } from "../db/types";
import { resolveJugadorIdForOrganizer } from "./organizerPlayerAccess";
import { linkLegacyPlayerId } from "./rivieraJugadoresService";
import type { RivieraJugador } from "./types";

export type PlayerWithOwner = Player & { user_id?: string | null };

export type LegacyLinkErrorCode =
  | "legacy_link_unverifiable"
  | "RIVIERA_LEGACY_NOT_VERIFIABLE"
  | "RIVIERA_LOCAL_LEGACY_CROSS_ORG"
  | "RIVIERA_SOURCE_LEGACY_CROSS_ORG"
  | "RIVIERA_IDENTITY_LOCAL_RESOLUTION_INVALID";

export class LegacyLinkUnverifiableError extends Error {
  readonly code: LegacyLinkErrorCode;

  constructor(
    message: string,
    code: LegacyLinkErrorCode = "legacy_link_unverifiable"
  ) {
    super(message);
    this.name = "LegacyLinkUnverifiableError";
    this.code = code;
  }
}

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

/**
 * Inserta en `players` sin búsqueda previa por nombre/email.
 */
export async function insertPlayerRowWithoutNameLookup(input: {
  name: string;
  email: string;
  userId: string;
}): Promise<PlayerWithOwner> {
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

  let data: PlayerWithOwner | null = null;
  let lastError: { code?: string; message?: string } | null = null;

  for (const payload of candidates) {
    const result = await supabase
      .from("players")
      .insert([payload])
      .select()
      .single();
    if (!result.error) {
      data = result.data as PlayerWithOwner;
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

export function assertResolvedLocalProfileSafe(
  profile: Pick<RivieraJugador, "id" | "organizador_id">,
  resolvedLocalJugadorId: string,
  organizadorId: string
): void {
  if (profile.id.trim() !== resolvedLocalJugadorId.trim()) {
    throw new LegacyLinkUnverifiableError(
      "El perfil operativo resuelto no coincide con el id local. No se modificó el vínculo.",
      "RIVIERA_IDENTITY_LOCAL_RESOLUTION_INVALID"
    );
  }
  const profileOrg = profile.organizador_id?.trim();
  if (!profileOrg || profileOrg !== organizadorId) {
    throw new LegacyLinkUnverifiableError(
      "El perfil operativo no pertenece a este club. No se escribe legacy sobre el origen de otro organizador.",
      "RIVIERA_IDENTITY_LOCAL_RESOLUTION_INVALID"
    );
  }
}

export function assertPlayerBelongsToOrganizer(
  player: PlayerWithOwner,
  organizadorId: string
): void {
  const owner = player.user_id?.trim();
  if (!owner) return;
  if (owner !== organizadorId) {
    throw new LegacyLinkUnverifiableError(
      "El vínculo legacy del perfil local apunta a un players de otro club. No se modificó el vínculo.",
      "RIVIERA_LOCAL_LEGACY_CROSS_ORG"
    );
  }
}

export async function fetchPlayerByIdStrict(
  id: string
): Promise<PlayerWithOwner | null> {
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as PlayerWithOwner) ?? null;
}

export async function fetchRivieraJugadorRowById(
  id: string
): Promise<RivieraJugador | null> {
  const { data, error } = await supabase
    .from("riviera_jugadores")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as RivieraJugador) ?? null;
}

/**
 * Resuelve perfil LOCAL del anfitrión y asegura players legacy sin matching por nombre.
 * Solo escribe link en el perfil local.
 */
export async function ensureLocalPlayersLegacyForRivieraJugador(
  organizadorId: string,
  requestedRivieraJugadorId: string,
  requestedProfile?: RivieraJugador | null
): Promise<{ player: PlayerWithOwner; created: boolean; localId: string }> {
  const org = organizadorId.trim();
  const requestedId = requestedRivieraJugadorId.trim();
  if (!org || !requestedId) {
    throw new Error("Faltan organizador o riviera_jugador_id");
  }

  const localId = (
    await resolveJugadorIdForOrganizer(org, requestedId)
  ).trim();
  if (!localId) {
    throw new LegacyLinkUnverifiableError(
      "No se pudo resolver el perfil operativo del jugador.",
      "RIVIERA_IDENTITY_LOCAL_RESOLUTION_INVALID"
    );
  }

  let localProfile =
    requestedProfile && requestedProfile.id === localId
      ? requestedProfile
      : await fetchRivieraJugadorRowById(localId);

  if (!localProfile) {
    throw new LegacyLinkUnverifiableError(
      "No encontramos el perfil local del jugador.",
      "RIVIERA_IDENTITY_LOCAL_RESOLUTION_INVALID"
    );
  }

  assertResolvedLocalProfileSafe(localProfile, localId, org);

  const existingLegacyId = localProfile.legacy_player_id?.trim() || null;
  if (existingLegacyId) {
    let existing: PlayerWithOwner | null;
    try {
      existing = await fetchPlayerByIdStrict(existingLegacyId);
    } catch {
      throw new LegacyLinkUnverifiableError(
        "No pudimos verificar el vínculo local de este jugador. No se realizó ningún cambio.",
        "RIVIERA_LEGACY_NOT_VERIFIABLE"
      );
    }
    if (!existing) {
      throw new LegacyLinkUnverifiableError(
        "No pudimos verificar el vínculo local de este jugador. No se realizó ningún cambio.",
        "RIVIERA_LEGACY_NOT_VERIFIABLE"
      );
    }
    assertPlayerBelongsToOrganizer(existing, org);
    return { player: existing, created: false, localId };
  }

  assertResolvedLocalProfileSafe(localProfile, localId, org);

  const nombre = localProfile.nombre.trim();
  if (!nombre) {
    throw new Error("La ficha Riviera no tiene nombre");
  }
  const email = isRealEmail(localProfile.email)
    ? localProfile.email!.trim()
    : syntheticEmailForRivieraJugadorId(localProfile.id);

  const created = await insertPlayerRowWithoutNameLookup({
    name: nombre,
    email,
    userId: org,
  });
  await linkLegacyPlayerId(localProfile.id, created.id);
  return { player: created, created: true, localId };
}
