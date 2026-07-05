/** Sprint 2.1.2 — Player Membership RPC payloads */

export type PlayerMembershipJoinedVia =
  | "admin_legacy"
  | "riviera_id"
  | "registration"
  | "qr";

export interface RivieraIdResolveResult {
  found: boolean;
  rivieraId: string | null;
  displayName: string | null;
  registrationOrganizerId: string | null;
  alreadyMember: boolean;
  localJugadorId: string | null;
  membershipId: string | null;
}

export interface AddOrganizerMembershipResult {
  membershipId: string;
  localJugadorId: string;
  sourceJugadorId: string;
  rivieraId: string;
  displayName: string;
  registrationOrganizerId: string;
  created: boolean;
  reactivated: boolean;
  alreadyMember: boolean;
  profileLinkCreated: boolean;
}

export interface LeaveOrganizerMembershipResult {
  membershipId: string;
  localJugadorId: string | null;
  sourceJugadorId: string;
  leftAt: string;
  joinedVia: PlayerMembershipJoinedVia | null;
}

export interface OrganizerMembershipRow {
  membershipId: string;
  sourceJugadorId: string;
  localJugadorId: string | null;
  rivieraId: string | null;
  displayName: string;
  registrationOrganizerId: string;
  joinedAt: string;
  joinedVia: PlayerMembershipJoinedVia | null;
  accessType: string;
  isPublicRanking: boolean;
}
