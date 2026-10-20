import type {
  EnCancha,
  ManoDominante,
  RivieraJugadorCategoria,
} from "../rivieraJugadores/types";
import type { RivieraJugadorGenero } from "../rivieraJugadores/genero";

export type CoachMembershipStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "PENDING"
  | "CANCELLED"
  | "ARCHIVED"
  | "REMOVED";
export type CoachPlayerStatus = "ACTIVE" | "PAUSED" | "ENDED";

/** Alta / edición de coach (mismo núcleo que jugador + campos coach). */
export type CreateCoachInput = {
  nombre: string;
  email: string;
  telefono?: string;
  paisCodigo?: string | null;
  genero: RivieraJugadorGenero;
  /** Fuerza propia del coach (como categoría de jugador). */
  categoria: RivieraJugadorCategoria;
  edad?: number | null;
  manoDominante?: ManoDominante | null;
  enCancha?: EnCancha | null;
  /** Fuerzas que entrena (schema `riviera_coaches.fuerzas`). */
  fuerzas: RivieraJugadorCategoria[];
  /** Enfoque de entrenamiento (schema `especialidades`). */
  especialidades: string[];
  bio?: string | null;
};

export type CoachingCoach = {
  id: string;
  coachCode: string;
  nombre: string;
  email?: string | null;
  telefono?: string | null;
  paisCodigo?: string | null;
  genero?: RivieraJugadorGenero | null;
  categoria?: RivieraJugadorCategoria | null;
  edad?: number | null;
  manoDominante?: ManoDominante | null;
  enCancha?: EnCancha | null;
  fotoUrl?: string | null;
  bio?: string | null;
  especialidades: string[];
  fuerzas: RivieraJugadorCategoria[];
  membershipStatus: CoachMembershipStatus;
  clubFuerzas?: RivieraJugadorCategoria[] | null;
  clubEspecialidades?: string[] | null;
  clubNotas?: string | null;
  clubDisponibilidad?: string | null;
  invitedAt?: string | null;
  activatedAt?: string | null;
  deactivatedAt?: string | null;
  cancelledAt?: string | null;
  archivedAt?: string | null;
  lastEditedAt?: string | null;
};

export type CoachingPlayerLink = {
  id: string;
  coachId: string;
  coachNombre: string;
  jugadorId: string;
  jugadorNombre: string;
  /** Riviera ID exacto (RIV-########) — vínculo canónico. */
  rivieraId: string;
  status: CoachPlayerStatus;
  isPrimary: boolean;
  balanceClasses?: number;
  totalClassesGiven?: number;
};

export type CoachPlayerClassBalance = {
  id: string;
  relationshipId: string;
  organizadorId: string;
  coachId: string;
  jugadorId: string;
  balanceClasses: number;
  totalClassesGiven: number;
  updatedAt: string;
};

export type CoachClassLedgerEntry = {
  id: string;
  relationshipId: string | null;
  organizadorId: string;
  coachId: string;
  coachNombre?: string;
  jugadorId: string;
  jugadorNombre?: string;
  sessionId: string | null;
  delta: number;
  tipo: "PACKAGE_CREDIT" | "CLASS_DEBIT" | "ADJUSTMENT";
  notas: string | null;
  idempotencyKey: string | null;
  recordedBy: string;
  createdAt: string;
};

export type CoachSessionItem = {
  id: string;
  coachId: string;
  relationshipId: string | null;
  organizadorId: string;
  jugadorId: string | null;
  startsAt: string;
  endsAt: string;
  durationMinutes: number | null;
  focus: string | null;
  workedOn: string[];
  improvements?: string | null;
  nextGoals?: string | null;
  motivationalMessage?: string | null;
  notesSummary: string | null;
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
};

export type CoachingClubSnapshot = {
  coaches: CoachingCoach[];
  links: CoachingPlayerLink[];
  source: "live" | "demo";
};

export type CoachSearchResult = {
  coachId: string;
  coachCode: string;
  nombre: string;
  fotoUrl: string | null;
  bio: string | null;
  especialidades: string[];
  fuerzas: RivieraJugadorCategoria[];
  alreadyMember: boolean;
  membershipStatus: string | null;
};

export type InviteCoachResult = {
  snapshot: CoachingClubSnapshot;
  coachCode: string;
  isNewUser: boolean;
  initialPassword?: string | null;
  membershipStatus: CoachMembershipStatus;
  message?: string;
  alreadyMember?: boolean;
};

export type RemoveCoachResult = {
  ok: boolean;
  idempotent?: boolean;
  status?: CoachMembershipStatus;
  message?: string;
  error?: string;
};

export type RecordCoachClassSessionInput = {
  relationshipId: string;
  notas?: string | null;
  sessionId?: string | null;
  idempotencyKey?: string;
  workedOn?: string[];
  improvements?: string | null;
  nextGoals?: string | null;
  motivationalMessage?: string | null;
  durationMinutes?: number;
};

export type CurrentCoachClubMembership = {
  membershipId: string;
  organizadorId: string;
  clubNombre?: string;
  status: CoachMembershipStatus;
  createdAt: string;
};

export type CurrentCoachProfile = {
  id: string;
  authUserId: string;
  coachCode: string;
  nombre: string;
  fotoUrl: string | null;
  bio: string | null;
  filosofia?: string | null;
  especialidades: string[];
  fuerzas: RivieraJugadorCategoria[];
  memberships: CurrentCoachClubMembership[];
};

export type ClubCoachDetailStudent = {
  relationshipId: string;
  jugadorId: string;
  nombre: string;
  fotoUrl: string | null;
  categoria: string | null;
  rama: string | null;
  genero: string | null;
  rivieraId: string;
  isPrimary: boolean;
  status: string;
  startedAt: string;
  balanceClasses: number;
  totalClassesGiven: number;
  updatedAt: string | null;
};

export type ClubCoachDetailSession = {
  id: string;
  relationshipId: string | null;
  jugadorNombre: string;
  startsAt: string;
  endsAt: string | null;
  durationMinutes: number | null;
  focus: string | null;
  workedOn: string[];
  improvements?: string | null;
  nextGoals?: string | null;
  motivationalMessage?: string | null;
  notesSummary: string | null;
  status: string;
  createdAt: string;
};

export type ClubCoachDetailLedgerEntry = {
  id: string;
  relationshipId: string | null;
  jugadorId: string;
  jugadorNombre: string;
  delta: number;
  tipo: string;
  notas: string | null;
  recordedBy: string;
  createdAt: string;
};

export type ClubCoachAuditEntry = {
  id: string;
  action: string;
  previousStatus: string | null;
  newStatus: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

export type ClubCoachDetail = {
  ok: boolean;
  error?: string;
  coach: {
    id: string;
    coachCode: string;
    nombre: string;
    email: string | null;
    fotoUrl: string | null;
    bio: string | null;
    filosofia: string | null;
    certificaciones: string | null;
    experiencia: string | null;
    especialidades: string[];
    fuerzas: RivieraJugadorCategoria[];
    createdAt: string;
  };
  membership: {
    id: string;
    status: CoachMembershipStatus;
    invitedAt: string | null;
    activatedAt: string | null;
    deactivatedAt: string | null;
    cancelledAt: string | null;
    archivedAt: string | null;
    removedAt?: string | null;
    removalReason?: string | null;
    clubFuerzas: RivieraJugadorCategoria[] | null;
    clubEspecialidades: string[] | null;
    clubNotas: string | null;
    clubDisponibilidad: string | null;
    lastEditedAt: string | null;
    createdAt: string;
  };
  club: {
    id: string;
    nombre: string;
    brandingKey: string | null;
  };
  students: ClubCoachDetailStudent[];
  sessions: ClubCoachDetailSession[];
  ledger: ClubCoachDetailLedgerEntry[];
  auditLog: ClubCoachAuditEntry[];
  stats: {
    totalStudents: number;
    activeStudents: number;
    totalClassesAssigned: number;
    totalClassesGiven: number;
    currentBalance: number;
  };
};

