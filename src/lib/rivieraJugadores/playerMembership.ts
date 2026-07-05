import { supabase } from "../supabaseClient";
import type {
  AddOrganizerMembershipResult,
  LeaveOrganizerMembershipResult,
  OrganizerMembershipRow,
  PlayerMembershipJoinedVia,
  RivieraIdResolveResult,
} from "./playerMembership.types";

export type {
  AddOrganizerMembershipResult,
  LeaveOrganizerMembershipResult,
  OrganizerMembershipRow,
  PlayerMembershipJoinedVia,
  RivieraIdResolveResult,
} from "./playerMembership.types";

const RIVIERA_ID_EXACT = /^RIV-[0-9]{8}$/;

function isJoinedVia(value: unknown): value is PlayerMembershipJoinedVia {
  return (
    value === "admin_legacy" ||
    value === "riviera_id" ||
    value === "registration" ||
    value === "qr"
  );
}

/** Normaliza entrada Riviera ID (exacta, sin búsqueda parcial). */
export function normalizeRivieraIdInput(input: string): string | null {
  const trimmed = input?.trim() ?? "";
  if (!trimmed || !RIVIERA_ID_EXACT.test(trimmed)) return null;
  return trimmed;
}

export function parseRivieraIdResolveResult(
  raw: unknown
): RivieraIdResolveResult | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;

  if (row.found !== true && row.found !== false) return null;

  return {
    found: row.found === true,
    rivieraId: typeof row.riviera_id === "string" ? row.riviera_id : null,
    displayName:
      typeof row.display_name === "string" ? row.display_name : null,
    registrationOrganizerId:
      typeof row.registration_organizer_id === "string"
        ? row.registration_organizer_id
        : null,
    alreadyMember: row.already_member === true,
    localJugadorId:
      typeof row.local_jugador_id === "string" ? row.local_jugador_id : null,
    membershipId:
      typeof row.membership_id === "string" ? row.membership_id : null,
  };
}

export function parseAddOrganizerMembershipResult(
  raw: unknown
): AddOrganizerMembershipResult | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;

  const membershipId =
    typeof row.membership_id === "string" ? row.membership_id : null;
  const localJugadorId =
    typeof row.local_jugador_id === "string" ? row.local_jugador_id : null;
  const sourceJugadorId =
    typeof row.source_jugador_id === "string" ? row.source_jugador_id : null;
  const rivieraId =
    typeof row.riviera_id === "string" ? row.riviera_id : null;
  const displayName =
    typeof row.display_name === "string" ? row.display_name : null;
  const registrationOrganizerId =
    typeof row.registration_organizer_id === "string"
      ? row.registration_organizer_id
      : null;

  if (
    !membershipId ||
    !localJugadorId ||
    !sourceJugadorId ||
    !rivieraId ||
    !displayName ||
    !registrationOrganizerId
  ) {
    return null;
  }

  return {
    membershipId,
    localJugadorId,
    sourceJugadorId,
    rivieraId,
    displayName,
    registrationOrganizerId,
    created: row.created === true,
    reactivated: row.reactivated === true,
    alreadyMember: row.already_member === true,
    profileLinkCreated: row.profile_link_created === true,
  };
}

export function parseLeaveOrganizerMembershipResult(
  raw: unknown
): LeaveOrganizerMembershipResult | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;

  const membershipId =
    typeof row.membership_id === "string" ? row.membership_id : null;
  const sourceJugadorId =
    typeof row.source_jugador_id === "string" ? row.source_jugador_id : null;
  const leftAt = typeof row.left_at === "string" ? row.left_at : null;

  if (!membershipId || !sourceJugadorId || !leftAt) return null;

  return {
    membershipId,
    localJugadorId:
      typeof row.local_jugador_id === "string" ? row.local_jugador_id : null,
    sourceJugadorId,
    leftAt,
    joinedVia: isJoinedVia(row.joined_via) ? row.joined_via : null,
  };
}

export function parseOrganizerMembershipRow(
  raw: unknown
): OrganizerMembershipRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;

  const membershipId =
    typeof row.membership_id === "string" ? row.membership_id : null;
  const sourceJugadorId =
    typeof row.source_jugador_id === "string" ? row.source_jugador_id : null;
  const displayName =
    typeof row.display_name === "string" ? row.display_name : null;
  const registrationOrganizerId =
    typeof row.registration_organizer_id === "string"
      ? row.registration_organizer_id
      : null;
  const joinedAt = typeof row.joined_at === "string" ? row.joined_at : null;
  const accessType =
    typeof row.access_type === "string" ? row.access_type : null;

  if (
    !membershipId ||
    !sourceJugadorId ||
    !displayName ||
    !registrationOrganizerId ||
    !joinedAt ||
    !accessType
  ) {
    return null;
  }

  return {
    membershipId,
    sourceJugadorId,
    localJugadorId:
      typeof row.local_jugador_id === "string" ? row.local_jugador_id : null,
    rivieraId: typeof row.riviera_id === "string" ? row.riviera_id : null,
    displayName,
    registrationOrganizerId,
    joinedAt,
    joinedVia: isJoinedVia(row.joined_via) ? row.joined_via : null,
    accessType,
    isPublicRanking: row.is_public_ranking === true,
  };
}

function parseOrganizerMembershipList(raw: unknown): OrganizerMembershipRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => parseOrganizerMembershipRow(item))
    .filter((item): item is OrganizerMembershipRow => item !== null);
}

/**
 * Resuelve jugador por Riviera ID exacto (preview antes de agregar).
 * No busca por nombre/correo/teléfono.
 */
export async function resolvePlayerByRivieraId(
  rivieraId: string
): Promise<RivieraIdResolveResult | null> {
  const normalized = normalizeRivieraIdInput(rivieraId);
  if (!normalized) return null;

  const { data, error } = await supabase.rpc("resolve_player_by_riviera_id", {
    p_riviera_id: normalized,
  });

  if (error) throw error;
  return parseRivieraIdResolveResult(data);
}

/**
 * Agrega membresía al organizador autenticado por Riviera ID exacto.
 * Reutiliza Carrera existente; no crea Riviera ID ni modifica debut.
 */
export async function addOrganizerMembershipByRivieraId(
  rivieraId: string
): Promise<AddOrganizerMembershipResult | null> {
  const normalized = normalizeRivieraIdInput(rivieraId);
  if (!normalized) {
    throw new Error("Riviera ID inválido — formato exacto RIV-00000001");
  }

  const { data, error } = await supabase.rpc(
    "add_organizer_membership_by_riviera_id",
    { p_riviera_id: normalized }
  );

  if (error) throw error;
  return parseAddOrganizerMembershipResult(data);
}

/** Baja de membresía (soft) del organizador autenticado. */
export async function leaveOrganizerMembership(
  localJugadorId: string
): Promise<LeaveOrganizerMembershipResult | null> {
  const id = localJugadorId?.trim();
  if (!id) return null;

  const { data, error } = await supabase.rpc("leave_organizer_membership", {
    p_local_jugador_id: id,
  });

  if (error) throw error;
  return parseLeaveOrganizerMembershipResult(data);
}

/** Lista membresías activas del organizador autenticado. */
export async function listOrganizerMemberships(): Promise<
  OrganizerMembershipRow[]
> {
  const { data, error } = await supabase.rpc("list_organizer_memberships");

  if (error) throw error;
  return parseOrganizerMembershipList(data);
}

/** Mensajes de error legibles para la UI de membership. */
export function mapPlayerMembershipUiError(error: unknown): string {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "object" &&
          error !== null &&
          typeof (error as { message?: string }).message === "string"
        ? (error as { message: string }).message
        : "";

  const lower = msg.toLowerCase();

  if (!msg.trim()) {
    return "No se pudo completar la operación. Intenta de nuevo.";
  }
  if (lower.includes("riviera id no encontrado") || lower.includes("not found")) {
    return "No encontramos un jugador con ese Riviera ID. Verifica que esté escrito exactamente (ej. RIV-00000001).";
  }
  if (
    lower.includes("ya pertenece") ||
    lower.includes("organizador de registro")
  ) {
    return "Este jugador ya pertenece a tu organizador de registro.";
  }
  if (lower.includes("membresía activa no encontrada")) {
    return "No hay una membresía activa para este jugador.";
  }
  if (lower.includes("autenticación requerida") || lower.includes("no autenticado")) {
    return "Debes iniciar sesión para continuar.";
  }
  if (lower.includes("duplicate") || lower.includes("unique")) {
    return "Este jugador ya está en tu organizador.";
  }

  return msg;
}
