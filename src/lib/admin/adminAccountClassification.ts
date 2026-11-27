/**
 * Clasificación de cuentas del directorio maestro.
 * Un club es una fila de public.users que no tiene perfil de coach ni vínculo de alumno.
 * Un coach es una fila de riviera_coaches. El correo y la falta de competencias no deciden el tipo.
 */

export type AdminAccountKind = "club" | "coach" | "student";

export type AdminCoachMembershipStatus = "activo" | "pendiente" | "inactivo";

export interface AdminCoachClubLink {
  organizadorId: string;
  name: string;
  status: string;
}

export interface AdminCoachDirectoryRow {
  authUserId: string;
  coachId: string;
  coachCode: string;
  nombre: string;
  email: string;
  fotoUrl: string | null;
  createdAt: string;
  clubs: AdminCoachClubLink[];
  studentCount: number;
  classCount: number;
  membershipStatus: AdminCoachMembershipStatus;
}

export function resolveAdminAccountKind(input: {
  hasCoachProfile: boolean;
  hasStudentLink: boolean;
}): AdminAccountKind {
  if (input.hasCoachProfile) return "coach";
  if (input.hasStudentLink) return "student";
  return "club";
}

export function membershipStatusFromLinks(
  statuses: string[]
): AdminCoachMembershipStatus {
  if (statuses.some((status) => status === "ACTIVE")) return "activo";
  if (statuses.some((status) => status === "PENDING")) return "pendiente";
  return "inactivo";
}

export function membershipStatusLabel(
  status: AdminCoachMembershipStatus
): string {
  if (status === "activo") return "Activo";
  if (status === "pendiente") return "Pendiente";
  return "Inactivo";
}

interface CoachSourceRow {
  id?: unknown;
  auth_user_id?: unknown;
  coach_code?: unknown;
  nombre?: unknown;
  foto_url?: unknown;
  created_at?: unknown;
  email?: unknown;
}

interface MembershipSourceRow {
  coach_id?: unknown;
  organizador_id?: unknown;
  status?: unknown;
}

interface RelationshipSourceRow {
  coach_id?: unknown;
  jugador_id?: unknown;
  status?: unknown;
}

interface ClassSourceRow {
  coach_id?: unknown;
  tipo?: unknown;
}

export function buildCoachDirectory(input: {
  coaches: CoachSourceRow[];
  memberships: MembershipSourceRow[];
  relationships: RelationshipSourceRow[];
  classes: ClassSourceRow[];
  namesByUserId: ReadonlyMap<string, string>;
  emailsByUserId: ReadonlyMap<string, string>;
}): AdminCoachDirectoryRow[] {
  const membershipsByCoach = new Map<string, MembershipSourceRow[]>();
  for (const membership of input.memberships) {
    const coachId = String(membership.coach_id ?? "");
    if (!coachId) continue;
    const list = membershipsByCoach.get(coachId) ?? [];
    list.push(membership);
    membershipsByCoach.set(coachId, list);
  }

  const studentsByCoach = new Map<string, Set<string>>();
  for (const relationship of input.relationships) {
    if (String(relationship.status ?? "") === "ENDED") continue;
    const coachId = String(relationship.coach_id ?? "");
    const jugadorId = String(relationship.jugador_id ?? "");
    if (!coachId || !jugadorId) continue;
    const set = studentsByCoach.get(coachId) ?? new Set<string>();
    set.add(jugadorId);
    studentsByCoach.set(coachId, set);
  }

  const classesByCoach = new Map<string, number>();
  for (const row of input.classes) {
    if (String(row.tipo ?? "") !== "CLASS_DEBIT") continue;
    const coachId = String(row.coach_id ?? "");
    if (!coachId) continue;
    classesByCoach.set(coachId, (classesByCoach.get(coachId) ?? 0) + 1);
  }

  const rows: AdminCoachDirectoryRow[] = [];
  for (const coach of input.coaches) {
    const authUserId = String(coach.auth_user_id ?? "");
    const coachId = String(coach.id ?? "");
    if (!authUserId || !coachId) continue;
    const links = membershipsByCoach.get(coachId) ?? [];
    const clubs: AdminCoachClubLink[] = links
      .map((link) => {
        const organizadorId = String(link.organizador_id ?? "");
        if (!organizadorId) return null;
        return {
          organizadorId,
          name:
            input.namesByUserId.get(organizadorId) ||
            input.emailsByUserId.get(organizadorId) ||
            "Club",
          status: String(link.status ?? ""),
        };
      })
      .filter((link): link is AdminCoachClubLink => link !== null);

    const emailFromProfile = String(coach.email ?? "").trim();
    rows.push({
      authUserId,
      coachId,
      coachCode: String(coach.coach_code ?? ""),
      nombre: String(coach.nombre ?? "").trim(),
      email: emailFromProfile || input.emailsByUserId.get(authUserId) || "",
      fotoUrl: coach.foto_url ? String(coach.foto_url) : null,
      createdAt: String(coach.created_at ?? ""),
      clubs,
      studentCount: studentsByCoach.get(coachId)?.size ?? 0,
      classCount: classesByCoach.get(coachId) ?? 0,
      membershipStatus: membershipStatusFromLinks(
        clubs.map((club) => club.status)
      ),
    });
  }
  return rows;
}

export function isMissingDirectoryRpc(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const message = String(error.message ?? "").toLowerCase();
  return (
    code === "PGRST202" ||
    code === "42883" ||
    message.includes("admin_directorio_clasificacion")
  );
}

export function coachDirectoryFromRpc(
  payload: unknown,
  namesByUserId: ReadonlyMap<string, string>
): AdminCoachDirectoryRow[] | null {
  if (!payload || typeof payload !== "object") return null;
  const coaches = (payload as { coaches?: unknown }).coaches;
  if (!Array.isArray(coaches)) return null;
  return coaches
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const source = row as Record<string, unknown>;
      const authUserId = String(source.auth_user_id ?? "");
      const coachId = String(source.coach_id ?? "");
      if (!authUserId || !coachId) return null;
      const clubsRaw = Array.isArray(source.clubs) ? source.clubs : [];
      const clubs: AdminCoachClubLink[] = clubsRaw
        .map((club) => {
          if (!club || typeof club !== "object") return null;
          const item = club as Record<string, unknown>;
          const organizadorId = String(item.organizador_id ?? "");
          if (!organizadorId) return null;
          const named = String(item.nombre ?? "").trim();
          return {
            organizadorId,
            name: named || namesByUserId.get(organizadorId) || "Club",
            status: String(item.status ?? ""),
          };
        })
        .filter((club): club is AdminCoachClubLink => club !== null);
      const membershipStatus = String(source.membership_status ?? "");
      return {
        authUserId,
        coachId,
        coachCode: String(source.coach_code ?? ""),
        nombre: String(source.nombre ?? "").trim(),
        email: String(source.email ?? "").trim(),
        fotoUrl: source.foto_url ? String(source.foto_url) : null,
        createdAt: String(source.created_at ?? ""),
        clubs,
        studentCount: Number(source.student_count ?? 0) || 0,
        classCount: Number(source.class_count ?? 0) || 0,
        membershipStatus:
          membershipStatus === "activo" || membershipStatus === "pendiente"
            ? membershipStatus
            : membershipStatusFromLinks(clubs.map((club) => club.status)),
      } satisfies AdminCoachDirectoryRow;
    })
    .filter((row): row is AdminCoachDirectoryRow => row !== null);
}
