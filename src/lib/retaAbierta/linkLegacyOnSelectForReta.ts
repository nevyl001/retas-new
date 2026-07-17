/**
 * Vínculo legacy estricto al seleccionar un jugador para el armado de retas.
 * SOLO por riviera_jugador_id / legacy_player_id — NUNCA por nombre/email.
 *
 * Modelo multi-club:
 *   perfil Riviera origen
 *   → organizer_player_access
 *   → perfil Riviera local del club destino
 *   → players legacy local del club destino
 *
 * Prohibido: ensureLegacyPlayerForRivieraJugador, findLegacyPlayerForRiviera,
 * findLegacyPlayerExisting, búsquedas de players por nombre/email.
 * Nunca escribe legacy_player_id sobre el perfil origen de otro club.
 */
import { supabase } from "../supabaseClient";
import { GLOBAL_TOURNAMENT_ID, isMissingColumnError } from "../db/schemaHelpers";
import type { Player } from "../db/types";
import { resolveJugadorIdForOrganizer } from "../rivieraJugadores/organizerPlayerAccess";
import { linkLegacyPlayerId } from "../rivieraJugadores/rivieraJugadoresService";
import type { RivieraJugador } from "../rivieraJugadores/types";

export type PlayerWithOwner = Player & { user_id?: string | null };

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

/** Códigos fail-closed del vínculo legacy (capa UI debe mostrar message, no reintentar por nombre). */
export type LegacyLinkErrorCode =
  | "legacy_link_unverifiable"
  | "RIVIERA_LOCAL_LEGACY_CROSS_ORG"
  | "RIVIERA_SOURCE_LEGACY_CROSS_ORG";

/** Legacy set pero no verificable / propiedad incorrecta. Fail-closed: 0 writes. */
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

export type RivieraJugadorLegacyLinkRow = Pick<
  RivieraJugador,
  | "id"
  | "nombre"
  | "email"
  | "organizador_id"
  | "legacy_player_id"
  | "foto_url"
  | "rating"
>;

export type LinkLegacyOnSelectDeps = {
  resolveJugadorIdForOrganizer: (
    organizadorId: string,
    rivieraJugadorId: string
  ) => Promise<string>;
  fetchRivieraJugadorById: (
    id: string
  ) => Promise<RivieraJugadorLegacyLinkRow | null>;
  /**
   * Lee players por id.
   * - null: fila no visible / no existe (no asumir huérfano físico).
   * - throw: error de red/permisos (no insertar).
   */
  fetchPlayerById: (id: string) => Promise<PlayerWithOwner | null>;
  /** Insert puro en players — prohibido buscar por nombre. */
  insertPlayerRow: (input: {
    name: string;
    email: string;
    userId: string;
  }) => Promise<PlayerWithOwner>;
  linkLegacyPlayerId: (
    rivieraJugadorId: string,
    legacyPlayerId: string
  ) => Promise<void>;
};

export type LinkLegacyOnSelectResult = {
  player: PlayerWithOwner;
  /** true solo si se insertó una fila nueva en players. */
  created: boolean;
  /** Perfil Riviera operativo usado para el vínculo (local del org). */
  rivieraJugadorId: string;
  /** ID solicitado por el caller (puede ser origen concedido). */
  requestedRivieraJugadorId: string;
  /** Alias explícito del perfil local/operativo. */
  resolvedLocalRivieraJugadorId: string;
};

async function defaultFetchRivieraJugadorById(
  id: string
): Promise<RivieraJugadorLegacyLinkRow | null> {
  const { data, error } = await supabase
    .from("riviera_jugadores")
    .select(
      "id, nombre, email, organizador_id, legacy_player_id, foto_url, rating"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as RivieraJugadorLegacyLinkRow | null;
}

async function defaultFetchPlayerById(
  id: string
): Promise<PlayerWithOwner | null> {
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  // Error de red/permisos ≠ ausencia: no silenciar.
  if (error) throw error;
  return (data as PlayerWithOwner) ?? null;
}

/**
 * Inserta en `players` sin búsqueda previa por nombre/email.
 * Copia nombre + email de la ficha (o email sintético por riviera id).
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

function defaultDeps(): LinkLegacyOnSelectDeps {
  return {
    resolveJugadorIdForOrganizer,
    fetchRivieraJugadorById: defaultFetchRivieraJugadorById,
    fetchPlayerById: defaultFetchPlayerById,
    insertPlayerRow: insertPlayerRowWithoutNameLookup,
    linkLegacyPlayerId,
  };
}

function assertPlayerBelongsToOrganizer(
  player: PlayerWithOwner,
  organizadorId: string
): void {
  const owner = player.user_id?.trim();
  // Si el esquema no expone user_id, RLS ya limitó la lectura.
  if (!owner) return;
  if (owner !== organizadorId) {
    throw new LegacyLinkUnverifiableError(
      "El vínculo legacy del perfil local apunta a un players de otro club. No se modificó el vínculo.",
      "RIVIERA_LOCAL_LEGACY_CROSS_ORG"
    );
  }
}

/**
 * Antes de cualquier insert/relink: el perfil operativo debe ser inequívoco.
 * localProfile.id === resolvedLocalJugadorId
 * localProfile.organizador_id === organizadorId
 */
function assertResolvedLocalProfileSafe(
  profile: RivieraJugadorLegacyLinkRow,
  resolvedLocalJugadorId: string,
  organizadorId: string
): void {
  if (profile.id.trim() !== resolvedLocalJugadorId.trim()) {
    throw new LegacyLinkUnverifiableError(
      "El perfil operativo resuelto no coincide con el id local. No se modificó el vínculo."
    );
  }
  const profileOrg = profile.organizador_id?.trim();
  if (!profileOrg || profileOrg !== organizadorId) {
    throw new LegacyLinkUnverifiableError(
      "El perfil operativo no pertenece a este club. No se escribe legacy sobre el origen de otro organizador."
    );
  }
}

/**
 * Daño confirmado (Caso 10): origen apunta a players del grantee.
 * Si el legacy del owner no es visible (RLS/null/error de lectura), NO bloquear:
 * no se asume inexistencia ni se reescribe el origen; el flujo sigue sobre el local.
 */
async function assertSourceLegacyNotOwnedByGrantee(
  deps: LinkLegacyOnSelectDeps,
  organizadorId: string,
  requestedId: string,
  effectiveLocalId: string
): Promise<void> {
  if (requestedId === effectiveLocalId) return;

  const sourceRj = await deps.fetchRivieraJugadorById(requestedId);
  if (!sourceRj) return;

  const sourceOrg = sourceRj.organizador_id?.trim();
  // Solo aplica cuando el requested es perfil de otro club (origen).
  if (sourceOrg && sourceOrg === organizadorId) return;

  const sourceLegacyId = sourceRj.legacy_player_id?.trim() || null;
  if (!sourceLegacyId) return;

  let sourceLegacyPlayer: PlayerWithOwner | null;
  try {
    sourceLegacyPlayer = await deps.fetchPlayerById(sourceLegacyId);
  } catch {
    // No poder leer el legacy privado del owner ≠ daño confirmado. Continuar en local.
    return;
  }

  if (!sourceLegacyPlayer) {
    // RLS-null: no declarar huérfano del origen; no escribir source. Seguir con local.
    return;
  }

  const owner = sourceLegacyPlayer.user_id?.trim();
  if (owner && owner === organizadorId) {
    throw new LegacyLinkUnverifiableError(
      "El perfil origen apunta a un players de este club (daño cross-org). No se modificó ningún vínculo.",
      "RIVIERA_SOURCE_LEGACY_CROSS_ORG"
    );
  }
}

/**
 * Vincula (o reutiliza) players.id para el perfil Riviera OPERATIVO del organizador.
 * Idempotente por perfil local. No crea Riviera ID ni identidad.
 *
 * Casos:
 * 1) Resuelve origen→local (resolveJugadorIdForOrganizer).
 * 2) Detecta daño cross-org en origen (legacy del source owned por grantee) → fail-closed.
 * 3) legacy_player_id + players visible y del org → reutilizar (0 inserts, 0 links).
 * 4) legacy_player_id set pero no verificable (RLS/null) → fail-closed, 0 writes.
 * 5) sin legacy_player_id → insert players del org + link SOLO al perfil local.
 */
export async function linkLegacyOnSelectForReta(
  organizadorId: string,
  rivieraJugadorId: string,
  depsPartial?: Partial<LinkLegacyOnSelectDeps>
): Promise<LinkLegacyOnSelectResult> {
  const org = organizadorId.trim();
  const requestedId = rivieraJugadorId.trim();
  if (!org || !requestedId) {
    throw new Error("Faltan organizador o riviera_jugador_id");
  }

  const deps: LinkLegacyOnSelectDeps = {
    ...defaultDeps(),
    ...depsPartial,
  };

  const effectiveId = (
    await deps.resolveJugadorIdForOrganizer(org, requestedId)
  ).trim();
  if (!effectiveId) {
    throw new Error("No se pudo resolver el perfil operativo del jugador");
  }

  await assertSourceLegacyNotOwnedByGrantee(
    deps,
    org,
    requestedId,
    effectiveId
  );

  const effectiveRj = await deps.fetchRivieraJugadorById(effectiveId);
  if (!effectiveRj) {
    throw new Error("No encontramos al jugador en el registro Riviera");
  }

  assertResolvedLocalProfileSafe(effectiveRj, effectiveId, org);

  const existingLegacyId = effectiveRj.legacy_player_id?.trim() || null;
  if (existingLegacyId) {
    let existing: PlayerWithOwner | null;
    try {
      existing = await deps.fetchPlayerById(existingLegacyId);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new LegacyLinkUnverifiableError(
        `No se pudo verificar el vínculo legacy del pool de retas: ${detail}. No se modificó el vínculo.`
      );
    }

    if (!existing) {
      throw new LegacyLinkUnverifiableError(
        "El perfil local ya tiene un vínculo legacy, pero no puede verificarse bajo la sesión actual. No se modificó el vínculo."
      );
    }

    assertPlayerBelongsToOrganizer(existing, org);

    return {
      player: {
        ...existing,
        name: effectiveRj.nombre.trim() || existing.name,
      },
      created: false,
      rivieraJugadorId: effectiveRj.id,
      requestedRivieraJugadorId: requestedId,
      resolvedLocalRivieraJugadorId: effectiveRj.id,
    };
  }

  // Revalidar identidad operativa justo antes de cualquier escritura.
  assertResolvedLocalProfileSafe(effectiveRj, effectiveId, org);

  const nombre = effectiveRj.nombre.trim();
  if (!nombre) {
    throw new Error("La ficha Riviera no tiene nombre");
  }

  const email = isRealEmail(effectiveRj.email)
    ? effectiveRj.email!.trim()
    : syntheticEmailForRivieraJugadorId(effectiveRj.id);

  const created = await deps.insertPlayerRow({
    name: nombre,
    email,
    userId: org,
  });

  // Solo el perfil local/operativo — nunca el origen de otro club.
  await deps.linkLegacyPlayerId(effectiveRj.id, created.id);

  return {
    player: created,
    created: true,
    rivieraJugadorId: effectiveRj.id,
    requestedRivieraJugadorId: requestedId,
    resolvedLocalRivieraJugadorId: effectiveRj.id,
  };
}
