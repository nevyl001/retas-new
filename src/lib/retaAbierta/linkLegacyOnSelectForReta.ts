/**
 * Vínculo legacy estricto al seleccionar un jugador para el armado de retas.
 * SOLO por riviera_jugador_id / legacy_player_id — NUNCA por nombre/email.
 *
 * Reutiliza helpers compartidos de `localLegacyIdentity` (Fase 3).
 * Nunca escribe legacy_player_id sobre el perfil origen de otro club.
 */
import { supabase } from "../supabaseClient";
import { resolveJugadorIdForOrganizer } from "../rivieraJugadores/organizerPlayerAccess";
import { linkLegacyPlayerId } from "../rivieraJugadores/rivieraJugadoresService";
import type { RivieraJugador } from "../rivieraJugadores/types";
import {
  LegacyLinkUnverifiableError,
  assertPlayerBelongsToOrganizer,
  assertResolvedLocalProfileSafe,
  insertPlayerRowWithoutNameLookup,
  syntheticEmailForRivieraJugadorId,
  type LegacyLinkErrorCode,
  type PlayerWithOwner,
} from "../rivieraJugadores/localLegacyIdentity";

export {
  LegacyLinkUnverifiableError,
  insertPlayerRowWithoutNameLookup,
  syntheticEmailForRivieraJugadorId,
};
export type { LegacyLinkErrorCode, PlayerWithOwner };

function isRealEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  return !email.trim().toLowerCase().endsWith("@padel.local");
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
  fetchPlayerById: (id: string) => Promise<PlayerWithOwner | null>;
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
  created: boolean;
  rivieraJugadorId: string;
  requestedRivieraJugadorId: string;
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
  if (error) throw error;
  return (data as PlayerWithOwner) ?? null;
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

/**
 * Daño confirmado: origen apunta a players del grantee.
 * Si el legacy del owner no es visible, NO bloquear — seguir sobre el local.
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
  if (sourceOrg && sourceOrg === organizadorId) return;

  const sourceLegacyId = sourceRj.legacy_player_id?.trim() || null;
  if (!sourceLegacyId) return;

  let sourceLegacyPlayer: PlayerWithOwner | null;
  try {
    sourceLegacyPlayer = await deps.fetchPlayerById(sourceLegacyId);
  } catch {
    return;
  }

  if (!sourceLegacyPlayer) return;

  const owner = sourceLegacyPlayer.user_id?.trim();
  if (owner && owner === organizadorId) {
    throw new LegacyLinkUnverifiableError(
      "El perfil origen apunta a un players de este club (daño cross-org). No se modificó ningún vínculo.",
      "RIVIERA_SOURCE_LEGACY_CROSS_ORG"
    );
  }
}

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
        `No se pudo verificar el vínculo legacy del pool de retas: ${detail}. No se modificó el vínculo.`,
        "RIVIERA_LEGACY_NOT_VERIFIABLE"
      );
    }

    if (!existing) {
      throw new LegacyLinkUnverifiableError(
        "El perfil local ya tiene un vínculo legacy, pero no puede verificarse bajo la sesión actual. No se modificó el vínculo.",
        "RIVIERA_LEGACY_NOT_VERIFIABLE"
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

  await deps.linkLegacyPlayerId(effectiveRj.id, created.id);

  return {
    player: created,
    created: true,
    rivieraJugadorId: effectiveRj.id,
    requestedRivieraJugadorId: requestedId,
    resolvedLocalRivieraJugadorId: effectiveRj.id,
  };
}
