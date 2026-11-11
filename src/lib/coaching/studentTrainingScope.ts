import type {
  CurrentCoachClubMembership,
  StudentTrainingSession,
} from "./types";

export type StudentClubScope = {
  relationshipId: string;
  organizadorId: string;
};

function claim(
  buckets: Map<string, StudentTrainingSession[]>,
  assigned: Set<string>,
  relationshipId: string,
  session: StudentTrainingSession
): void {
  if (!session.id || assigned.has(session.id)) return;
  const list = buckets.get(relationshipId);
  if (!list) return;
  list.push(session);
  assigned.add(session.id);
}

/**
 * Cada sesión entra solo en la relación cuyo relationship_id coincide.
 * El nombre del club no participa: dos clubes pueden llamarse igual.
 */
export function groupTrainingSessionsByRelationship(
  sessions: StudentTrainingSession[],
  relationships: StudentClubScope[]
): Map<string, StudentTrainingSession[]> {
  const buckets = new Map<string, StudentTrainingSession[]>();
  for (const rel of relationships) {
    if (!rel.relationshipId) continue;
    buckets.set(rel.relationshipId, []);
  }
  const assigned = new Set<string>();

  for (const session of sessions) {
    if (!session.relationshipId) continue;
    const rel = relationships.find(
      (item) => item.relationshipId === session.relationshipId
    );
    if (!rel) continue;
    if (
      session.organizadorId &&
      rel.organizadorId &&
      session.organizadorId !== rel.organizadorId
    ) {
      continue;
    }
    claim(buckets, assigned, rel.relationshipId, session);
  }

  return buckets;
}

export function sessionsForStudentClub(
  sessions: StudentTrainingSession[],
  relationship: StudentClubScope
): StudentTrainingSession[] {
  return (
    groupTrainingSessionsByRelationship(sessions, [relationship]).get(
      relationship.relationshipId
    ) ?? []
  );
}

/** Primera membresía ACTIVE. Una inactiva no queda seleccionada para operar. */
export function selectOperativeCoachClubId(
  memberships: CurrentCoachClubMembership[]
): string | null {
  const active = memberships.find(
    (membership) =>
      membership.status === "ACTIVE" && membership.organizadorId.trim().length > 0
  );
  return active?.organizadorId ?? null;
}
