import { supabase } from "../supabaseClient";
import type {
  PlayerSharingRequest,
  PlayerSharingRequestStatus,
} from "./playerSharingRequests.types";

export type {
  PlayerSharingRequest,
  PlayerSharingRequestStatus,
} from "./playerSharingRequests.types";

function isSharingRequestStatus(
  value: unknown
): value is PlayerSharingRequestStatus {
  return value === "pending" || value === "accepted" || value === "rejected";
}

export function parsePlayerSharingRequest(raw: unknown): PlayerSharingRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;

  const id = typeof row.id === "string" ? row.id : null;
  const rivieraJugadorId =
    typeof row.riviera_jugador_id === "string" ? row.riviera_jugador_id : null;
  const registrationJugadorId =
    typeof row.registration_jugador_id === "string"
      ? row.registration_jugador_id
      : null;
  const requesterOrganizerId =
    typeof row.requester_organizer_id === "string"
      ? row.requester_organizer_id
      : null;
  const registrationOrganizerId =
    typeof row.registration_organizer_id === "string"
      ? row.registration_organizer_id
      : null;
  const createdAt = typeof row.created_at === "string" ? row.created_at : null;

  if (
    !id ||
    !rivieraJugadorId ||
    !registrationJugadorId ||
    !requesterOrganizerId ||
    !registrationOrganizerId ||
    !createdAt ||
    !isSharingRequestStatus(row.status)
  ) {
    return null;
  }

  return {
    id,
    rivieraJugadorId,
    registrationJugadorId,
    requesterOrganizerId,
    registrationOrganizerId,
    status: row.status,
    requestMessage:
      typeof row.request_message === "string" ? row.request_message : null,
    decisionNote:
      typeof row.decision_note === "string" ? row.decision_note : null,
    decidedBy: typeof row.decided_by === "string" ? row.decided_by : null,
    createdAt,
    decidedAt: typeof row.decided_at === "string" ? row.decided_at : null,
    jugadorNombre:
      typeof row.jugador_nombre === "string" ? row.jugador_nombre : null,
    rivieraId: typeof row.riviera_id === "string" ? row.riviera_id : null,
  };
}

function parsePlayerSharingRequestList(raw: unknown): PlayerSharingRequest[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => parsePlayerSharingRequest(item))
    .filter((item): item is PlayerSharingRequest => item !== null);
}

/** Organizador solicitante: crear solicitud para usar un jugador de otro club. */
export async function createPlayerSharingRequest(
  rivieraJugadorId: string,
  message?: string | null
): Promise<PlayerSharingRequest> {
  const id = rivieraJugadorId?.trim();
  if (!id) throw new Error("Jugador requerido");

  const { data, error } = await supabase.rpc("create_player_sharing_request", {
    p_riviera_jugador_id: id,
    p_message: message?.trim() || null,
  });

  if (error) throw error;

  const parsed = parsePlayerSharingRequest(data);
  if (!parsed) throw new Error("Respuesta inválida de create_player_sharing_request");
  return parsed;
}

/** Solicitudes enviadas por el organizador autenticado. */
export async function listOutgoingPlayerSharingRequests(
  status?: PlayerSharingRequestStatus | null
): Promise<PlayerSharingRequest[]> {
  const { data, error } = await supabase.rpc(
    "list_outgoing_player_sharing_requests",
    { p_status: status ?? null }
  );

  if (error) throw error;
  return parsePlayerSharingRequestList(data);
}

/** Solicitudes recibidas por el Organizador de Registro autenticado. */
export async function listIncomingPlayerSharingRequests(
  status?: PlayerSharingRequestStatus | null
): Promise<PlayerSharingRequest[]> {
  const { data, error } = await supabase.rpc(
    "list_incoming_player_sharing_requests",
    { p_status: status ?? null }
  );

  if (error) throw error;
  return parsePlayerSharingRequestList(data);
}

/** Organizador de Registro: aceptar solicitud (sin crear acceso automático). */
export async function acceptPlayerSharingRequest(
  requestId: string,
  decisionNote?: string | null
): Promise<PlayerSharingRequest> {
  return respondPlayerSharingRequest(requestId, true, decisionNote);
}

/** Organizador de Registro: rechazar solicitud. */
export async function rejectPlayerSharingRequest(
  requestId: string,
  decisionNote?: string | null
): Promise<PlayerSharingRequest> {
  return respondPlayerSharingRequest(requestId, false, decisionNote);
}

async function respondPlayerSharingRequest(
  requestId: string,
  accept: boolean,
  decisionNote?: string | null
): Promise<PlayerSharingRequest> {
  const id = requestId?.trim();
  if (!id) throw new Error("Solicitud requerida");

  const { data, error } = await supabase.rpc("respond_player_sharing_request", {
    p_request_id: id,
    p_accept: accept,
    p_decision_note: decisionNote?.trim() || null,
  });

  if (error) throw error;

  const parsed = parsePlayerSharingRequest(data);
  if (!parsed) throw new Error("Respuesta inválida de respond_player_sharing_request");
  return parsed;
}
