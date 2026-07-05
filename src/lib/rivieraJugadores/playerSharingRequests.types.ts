export type PlayerSharingRequestStatus =
  | "pending"
  | "accepted"
  | "rejected";

export interface PlayerSharingRequest {
  id: string;
  rivieraJugadorId: string;
  registrationJugadorId: string;
  requesterOrganizerId: string;
  registrationOrganizerId: string;
  status: PlayerSharingRequestStatus;
  requestMessage: string | null;
  decisionNote: string | null;
  decidedBy: string | null;
  createdAt: string;
  decidedAt: string | null;
  jugadorNombre: string | null;
  rivieraId: string | null;
}
