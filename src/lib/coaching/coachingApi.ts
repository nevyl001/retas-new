import { supabase } from "../supabaseClient";
import { retryTransient } from "../errors/retryTransient";
import { normalizeRivieraIdInput } from "../rivieraJugadores/playerMembership";
import { fetchRivieraIdMapForJugadorIds } from "../rivieraJugadores/rivieraIdDisplay";
import type { RivieraJugadorCategoria } from "../rivieraJugadores/types";
import type {
  CoachMembershipStatus,
  CoachSearchResult,
  CoachClassLedgerEntry,
  CoachingClubSnapshot,
  CoachingPlayerLink,
  CreateCoachInput,
  CurrentCoachClubMembership,
  CurrentCoachProfile,
  InviteCoachResult,
  ClubCoachDetail,
  RecordCoachClassSessionInput,
  RemoveCoachResult,
  StudentLookupResult,
  AssignStudentToClubCoachResult,
  FinalizeCoachRemovalResult,
  ReassignStudentCoachResult,
  AdjustCoachStudentClassesResult,
  RevertCoachClassSessionResult,
  ScheduleCoachClassResult,
  RescheduleCoachClassResult,
  CancelCoachClassResult,
  CoachScheduledSession,
  StudentCoachingUpcomingSession,
} from "./types";

function mapEdgeError(data: unknown, fallbackMessage: string): string {
  if (!data || typeof data !== "object") return fallbackMessage;
  const err = (data as { error?: unknown }).error;
  return typeof err === "string" && err.trim() ? err.trim() : fallbackMessage;
}

/**
 * Carga el snapshot del club desde la base de datos real.
 * Si las tablas de coaching no existen aún (ej. ambiente sin migración), recurre a demo.
 * Si las tablas existen pero el club no tiene coaches, devuelve `{ coaches: [], links: [], source: 'live' }`.
 */
export async function loadCoachingClubSnapshot(
  organizadorId: string
): Promise<CoachingClubSnapshot> {
  try {
    const { data: memberships, error } = await supabase
      .from("coach_club_memberships")
      .select(
        `
        status,
        invited_at,
        activated_at,
        deactivated_at,
        cancelled_at,
        archived_at,
        club_fuerzas,
        club_especialidades,
        club_notas,
        club_disponibilidad,
        last_edited_at,
        coach:riviera_coaches (
          id,
          coach_code,
          nombre,
          foto_url,
          bio,
          especialidades,
          fuerzas
        )
      `
      )
      .eq("organizador_id", organizadorId);

    if (error) {
      console.error("[coaching] memberships load error", error.message);
      throw new Error(
        "No se pudieron cargar los coaches del club: " + error.message
      );
    }

    // Si la tabla existe y no hay coaches, se devuelve estado vacío legítimo
    if (!memberships || memberships.length === 0) {
      return { coaches: [], links: [], source: "live" };
    }

    const coaches = memberships
      .map((row) => {
        const coach = Array.isArray(row.coach) ? row.coach[0] : row.coach;
        if (!coach) return null;
        const validStatuses: CoachMembershipStatus[] = [
          "ACTIVE",
          "PENDING",
          "INACTIVE",
          "CANCELLED",
          "ARCHIVED",
          "REMOVED",
        ];
        const status: CoachMembershipStatus = validStatuses.includes(
          row.status as CoachMembershipStatus
        )
          ? (row.status as CoachMembershipStatus)
          : "INACTIVE";

        return {
          id: String(coach.id),
          coachCode: String(coach.coach_code ?? ""),
          nombre: String(coach.nombre ?? "Coach"),
          fotoUrl: (coach.foto_url as string | null) ?? null,
          bio: (coach.bio as string | null) ?? null,
          especialidades: Array.isArray(coach.especialidades)
            ? (coach.especialidades as string[])
            : [],
          fuerzas: Array.isArray(coach.fuerzas)
            ? (coach.fuerzas as RivieraJugadorCategoria[])
            : [],
          membershipStatus: status,
          clubFuerzas: Array.isArray(row.club_fuerzas)
            ? (row.club_fuerzas as RivieraJugadorCategoria[])
            : null,
          clubEspecialidades: Array.isArray(row.club_especialidades)
            ? (row.club_especialidades as string[])
            : null,
          clubNotas:
            typeof row.club_notas === "string" ? row.club_notas : null,
          clubDisponibilidad:
            typeof row.club_disponibilidad === "string"
              ? row.club_disponibilidad
              : null,
          invitedAt: row.invited_at ? String(row.invited_at) : null,
          activatedAt: row.activated_at ? String(row.activated_at) : null,
          deactivatedAt: row.deactivated_at ? String(row.deactivated_at) : null,
          cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
          archivedAt: row.archived_at ? String(row.archived_at) : null,
          lastEditedAt: row.last_edited_at ? String(row.last_edited_at) : null,
        };
      })
      .filter(Boolean) as CoachingClubSnapshot["coaches"];

    const coachIds = coaches.map((c) => c.id);
    let links: CoachingClubSnapshot["links"] = [];

    if (coachIds.length > 0) {
      const { data: rels, error: relError } = await supabase
        .from("coach_player_relationships")
        .select(
          `
          id,
          coach_id,
          jugador_id,
          status,
          is_primary,
          coach:riviera_coaches ( nombre ),
          jugador:riviera_jugadores ( nombre )
        `
        )
        .eq("organizador_id", organizadorId)
        .in("coach_id", coachIds)
        .neq("status", "ENDED");

      if (relError) {
        console.error("[coaching] relationships load error", relError.message);
        throw new Error(
          "No se pudieron cargar los alumnos del club: " + relError.message
        );
      }

      if (rels && rels.length > 0) {
        // Resolver los Riviera IDs canónicos oficiales
        const jugadorIds = rels
          .map((r) => String(r.jugador_id))
          .filter(Boolean);
        const rivieraIdMap = await fetchRivieraIdMapForJugadorIds(jugadorIds);

        // Consultar saldos de clases por relación
        const { data: balances, error: balanceError } = await supabase
          .from("coach_player_class_balances")
          .select("relationship_id, balance_classes, total_classes_given")
          .eq("organizador_id", organizadorId);

        if (balanceError) {
          console.error("[coaching] balances load error", balanceError.message);
          throw new Error(
            "No se pudieron cargar los saldos de clases: " + balanceError.message
          );
        }

        const balanceMap = new Map<string, { balanceClasses: number; totalClassesGiven: number }>();
        for (const b of balances ?? []) {
          balanceMap.set(String(b.relationship_id), {
            balanceClasses: Number(b.balance_classes ?? 0),
            totalClassesGiven: Number(b.total_classes_given ?? 0),
          });
        }

        links = rels.map((r) => {
          const coach = Array.isArray(r.coach) ? r.coach[0] : r.coach;
          const jugador = Array.isArray(r.jugador) ? r.jugador[0] : r.jugador;
          const jugadorId = String(r.jugador_id);
          const rivieraId = rivieraIdMap.get(jugadorId) || "";
          const bal = balanceMap.get(String(r.id));

          return {
            id: String(r.id),
            coachId: String(r.coach_id),
            coachNombre: String(coach?.nombre ?? "Coach"),
            jugadorId,
            jugadorNombre: String(jugador?.nombre ?? "Jugador"),
            rivieraId,
            status: r.status as CoachingPlayerLink["status"],
            isPrimary: Boolean(r.is_primary),
            balanceClasses: bal?.balanceClasses ?? 0,
            totalClassesGiven: bal?.totalClassesGiven ?? 0,
          };
        });
      }
    }

    return { coaches, links, source: "live" };
  } catch (e) {
    console.error("[coaching] load snapshot error", e);
    throw e instanceof Error
      ? e
      : new Error("No se pudo cargar la información de coaching del club.");
  }
}

/**
 * Invita o registra un coach real a través de la Edge Function `coaching-invite-coach`.
 * Crea la cuenta Auth si es nueva, asigna el código `RIV-C-#####` y crea la membresía del club.
 */
export async function inviteClubCoach(
  organizadorId: string,
  input: CreateCoachInput
): Promise<InviteCoachResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error(
      "Sesión de organizador requerida para registrar un coach."
    );
  }

  const { data, error } = await supabase.functions.invoke(
    "coaching-invite-coach",
    {
      body: {
        email: input.email.trim(),
        nombre: input.nombre.trim(),
        telefono: input.telefono?.trim() || undefined,
        paisCodigo: input.paisCodigo || null,
        genero: input.genero,
        categoria: input.categoria,
        edad: input.edad,
        manoDominante: input.manoDominante || null,
        enCancha: input.enCancha || null,
        fuerzas: input.fuerzas,
        especialidades: input.especialidades,
        bio: input.bio || null,
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    }
  );

  if (error) {
    const errorMsg = mapEdgeError(
      data,
      error.message || "No se pudo registrar ni invitar al coach en el servidor."
    );
    throw new Error(errorMsg);
  }

  const res = data as {
    ok?: boolean;
    error?: string;
    coachCode?: string;
    isNewUser?: boolean;
    initialPassword?: string | null;
    verificationUrl?: string | null;
    membershipStatus?: CoachMembershipStatus;
    message?: string;
    alreadyMember?: boolean;
  };

  if (!res || res.ok !== true) {
    throw new Error(
      res?.error || "Error inesperado al registrar el coach en el servidor."
    );
  }

  const membershipStatus: CoachMembershipStatus =
    res.membershipStatus || (res.isNewUser ? "PENDING" : "ACTIVE");

  let snapshot: CoachingClubSnapshot;
  try {
    snapshot = await loadCoachingClubSnapshot(organizadorId);
  } catch (refreshErr) {
    console.warn(
      "[coaching] coach registrado en backend pero falló la recarga del snapshot:",
      refreshErr
    );
    snapshot = {
      coaches: [
        {
          id: "",
          coachCode: res.coachCode || "",
          nombre: input.nombre.trim(),
          email: input.email.trim(),
          telefono: input.telefono?.trim() || null,
          paisCodigo: input.paisCodigo || null,
          genero: input.genero,
          categoria: input.categoria,
          edad: input.edad ?? null,
          manoDominante: input.manoDominante || null,
          enCancha: input.enCancha || null,
          fotoUrl: null,
          bio: input.bio || null,
          especialidades: input.especialidades || [],
          fuerzas: input.fuerzas || [],
          membershipStatus,
        },
      ],
      links: [],
      source: "live",
    };
  }

  return {
    snapshot,
    coachCode: res.coachCode || "",
    isNewUser: res.isNewUser ?? false,
    initialPassword: res.initialPassword ?? null,
    verificationUrl: res.verificationUrl ?? null,
    membershipStatus,
    message: res.message,
    alreadyMember: res.alreadyMember,
  };
}

/**
 * Actualiza el estado de la membresía de un coach en el club.
 * Desactivación (INACTIVE) mediante la RPC autorizada deactivate_coach_from_club.
 * Activación/Reincorporación mediante la RPC link_existing_coach_to_club (registra en PENDING).
 */
export async function updateCoachMembershipStatus(
  organizadorId: string,
  coachId: string,
  status: "ACTIVE" | "INACTIVE"
): Promise<CoachingClubSnapshot> {
  if (status === "INACTIVE") {
    const { data, error } = await supabase.rpc("deactivate_coach_from_club", {
      p_coach_id: coachId,
      p_organizador_id: organizadorId,
    });

    if (error) {
      throw new Error(
        "No se pudo desactivar al coach del club: " + error.message
      );
    }

    const res = data as { ok?: boolean; error?: string };
    if (res && res.ok === false) {
      throw new Error(res.error || "No se pudo desactivar al coach.");
    }
  } else {
    const { data, error } = await supabase.rpc("link_existing_coach_to_club", {
      p_coach_id: coachId,
    });

    if (error) {
      throw new Error(
        "No se pudo solicitar la reincorporación del coach: " + error.message
      );
    }

    const res = data as { ok?: boolean; error?: string };
    if (res && res.ok === false) {
      throw new Error(res.error || "No se pudo registrar la solicitud.");
    }
  }

  return loadCoachingClubSnapshot(organizadorId);
}

/**
 * Obtiene el perfil de coach del usuario actualmente autenticado (si está registrado como coach).
 * Valida sesión real mediante Supabase Auth sin depender de parámetros manipulables.
 */
export async function fetchCurrentCoachProfile(): Promise<CurrentCoachProfile | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user?.id) {
    return null;
  }

  const { data: coach, error: coachError } = await supabase
    .from("riviera_coaches")
    .select(
      `
      id,
      auth_user_id,
      coach_code,
      nombre,
      foto_url,
      bio,
      filosofia,
      especialidades,
      fuerzas
    `
    )
    .eq("auth_user_id", session.user.id)
    .maybeSingle();

  if (coachError || !coach) {
    return null;
  }

  const { data: memberships } = await supabase
    .from("coach_club_memberships")
    .select("id, organizador_id, status, created_at")
    .eq("coach_id", coach.id);

  const clubMemberships: CurrentCoachClubMembership[] = (
    memberships ?? []
  ).map((m) => ({
    membershipId: String(m.id),
    organizadorId: String(m.organizador_id),
    status: (m.status === "ACTIVE" || m.status === "PENDING"
      ? m.status
      : "INACTIVE") as CoachMembershipStatus,
    createdAt: String(m.created_at ?? ""),
  }));

  return {
    id: String(coach.id),
    authUserId: String(coach.auth_user_id),
    coachCode: String(coach.coach_code ?? ""),
    nombre: String(coach.nombre ?? ""),
    fotoUrl: (coach.foto_url as string | null) ?? null,
    bio: (coach.bio as string | null) ?? null,
    filosofia: (coach.filosofia as string | null) ?? null,
    especialidades: Array.isArray(coach.especialidades)
      ? coach.especialidades
      : [],
    fuerzas: Array.isArray(coach.fuerzas)
      ? (coach.fuerzas as RivieraJugadorCategoria[])
      : [],
    memberships: clubMemberships,
  };
}

/**
 * Permite al coach autenticado aceptar formalmente una invitación pendiente para afiliarse a un club.
 */
export async function acceptCoachClubInvitation(
  membershipId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("accept_coach_club_invitation", {
      p_membership_id: membershipId,
    });

    if (!error) {
      const res = data as { ok?: boolean; error?: string };
      if (res && res.ok === false) {
        return { success: false, error: res.error || "No se pudo aceptar la invitación." };
      }
      return { success: true };
    }

    // Fallback directo vía RLS si la migración de la función aún no se aplica
    const { error: updateError } = await supabase
      .from("coach_club_memberships")
      .update({
        status: "ACTIVE",
        updated_at: new Date().toISOString(),
      })
      .eq("id", membershipId);

    if (updateError) {
      return {
        success: false,
        error: "No se pudo aceptar la invitación: " + updateError.message,
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error inesperado",
    };
  }
}

/** Alias para compatibilidad con código existente */
export async function createClubCoachDemo(
  organizadorId: string,
  input: CreateCoachInput
): Promise<CoachingClubSnapshot> {
  const result = await inviteClubCoach(organizadorId, input);
  return result.snapshot;
}

/**
 * Busca si un coach ya existe en la red global de Riviera Open por código oficial (RIV-C-#####) o correo.
 */
export async function searchCoachForInvitation(
  query: string
): Promise<CoachSearchResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  try {
    const { data, error } = await supabase.rpc("lookup_coach_for_invitation", {
      p_query: trimmed,
    });

    if (error || !data) {
      return null;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.coach_id) return null;

    return {
      coachId: String(row.coach_id),
      coachCode: String(row.coach_code ?? ""),
      nombre: String(row.nombre ?? ""),
      fotoUrl: (row.foto_url as string | null) ?? null,
      bio: (row.bio as string | null) ?? null,
      especialidades: Array.isArray(row.especialidades)
        ? row.especialidades
        : [],
      fuerzas: Array.isArray(row.fuerzas)
        ? (row.fuerzas as RivieraJugadorCategoria[])
        : [],
      alreadyMember: Boolean(row.already_member),
      membershipStatus: (row.membership_status as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Vincula un coach existente a este club mediante la RPC autorizada link_existing_coach_to_club.
 * Falla de forma controlada si no existe la RPC o si no se cuenta con los permisos correspondientes.
 */
export async function linkExistingCoach(
  organizadorId: string,
  coachId: string
): Promise<CoachingClubSnapshot> {
  const { data, error } = await supabase.rpc("link_existing_coach_to_club", {
    p_coach_id: coachId,
  });

  if (error) {
    throw new Error(
      "No se pudo vincular el coach al club: " + error.message
    );
  }

  const res = data as { ok?: boolean; error?: string };
  if (res && res.ok === false) {
    throw new Error(res.error || "No se pudo vincular el coach al club.");
  }

  return loadCoachingClubSnapshot(organizadorId);
}

/**
 * Vincula un jugador al coach por Riviera ID exacto mediante la RPC autorizada link_player_to_coach_by_riviera_id.
 * Falla de forma controlada si la RPC falla o el jugador no existe.
 */
export async function linkPlayerByRivieraId(
  organizadorId: string,
  coachId: string,
  rivieraIdRaw: string
): Promise<CoachingClubSnapshot> {
  const rivieraId = normalizeRivieraIdInput(rivieraIdRaw);
  if (!rivieraId) {
    throw new Error(
      "Formato inválido. Usa el Riviera ID exacto, por ejemplo RIV-00000001."
    );
  }

  const { data, error } = await supabase.rpc(
    "link_player_to_coach_by_riviera_id",
    {
      p_coach_id: coachId,
      p_riviera_id: rivieraId,
      p_organizador_id: organizadorId,
    }
  );

  if (error) {
    throw new Error(
      "No se pudo vincular el alumno al coach: " + error.message
    );
  }

  const res = data as { ok?: boolean; error?: string };
  if (res && res.ok === false) {
    throw new Error(res.error || "No se pudo vincular el alumno.");
  }

  return loadCoachingClubSnapshot(organizadorId);
}

/**
 * Genera una clave de idempotencia única para operaciones de coaching.
 */
export function generateCoachingIdempotencyKey(
  prefix: "assign" | "session" | "assign-student" | string = "session"
): string {
  const uuid =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${uuid}`;
}

/**
 * Asigna o agrega clases disponibles a un alumno vinculado.
 * REGLA DEFINITIVA: Exclusivo del club organizador.
 * Conserva la clave de idempotencia entre reintentos por fallos de red.
 */
export async function assignCoachClasses(
  organizadorId: string,
  relationshipId: string,
  classCount: number,
  notas?: string,
  idempotencyKey?: string
): Promise<CoachingClubSnapshot> {
  const key = idempotencyKey || generateCoachingIdempotencyKey("assign");

  await retryTransient(
    async () => {
      const { data, error } = await supabase.rpc("assign_coach_classes", {
        p_relationship_id: relationshipId,
        p_class_count: classCount,
        p_notas: notas || null,
        p_idempotency_key: key,
      });

      if (error) {
        throw error;
      }

      const res = data as { ok?: boolean; error?: string };
      if (res && res.ok === false) {
        throw new Error(res.error || "No se pudieron asignar las clases.");
      }

      return res;
    },
    { label: "assignCoachClasses" }
  );

  return loadCoachingClubSnapshot(organizadorId);
}

/**
 * Registra una clase impartida, descontando exactamente 1 clase del saldo disponible.
 * REGLA DEFINITIVA: Genera sesión real en coach_sessions y vínculo en el ledger.
 * Soporta registro detallado de seguimiento: temas trabajados, mejoras observadas,
 * próximos objetivos y mensaje motivante para el alumno.
 * Conserva la clave de idempotencia entre reintentos para no duplicar deducciones.
 */
export async function recordCoachClassSession(
  relationshipIdOrInput: string | RecordCoachClassSessionInput,
  notas?: string,
  sessionId?: string,
  idempotencyKey?: string,
  workedOn?: string[],
  improvements?: string | null,
  nextGoals?: string | null,
  motivationalMessage?: string | null,
  durationMinutes?: number
): Promise<{
  ok: boolean;
  remainingBalance: number;
  totalClassesGiven: number;
  sessionId: string;
  idempotent?: boolean;
}> {
  let relId: string;
  let effectiveNotas: string | null = null;
  let effectiveSessionId: string | null = null;
  let effectiveKey: string | null = null;
  let effectiveWorkedOn: string[] = [];
  let effectiveImprovements: string | null = null;
  let effectiveNextGoals: string | null = null;
  let effectiveMotivationalMessage: string | null = null;
  let effectiveDurationMinutes: number = 60;

  if (typeof relationshipIdOrInput === "object" && relationshipIdOrInput !== null) {
    relId = relationshipIdOrInput.relationshipId;
    effectiveNotas = relationshipIdOrInput.notas ?? null;
    effectiveSessionId = relationshipIdOrInput.sessionId ?? null;
    effectiveKey = relationshipIdOrInput.idempotencyKey ?? null;
    effectiveWorkedOn = relationshipIdOrInput.workedOn ?? [];
    effectiveImprovements = relationshipIdOrInput.improvements ?? null;
    effectiveNextGoals = relationshipIdOrInput.nextGoals ?? null;
    effectiveMotivationalMessage = relationshipIdOrInput.motivationalMessage ?? null;
    effectiveDurationMinutes = relationshipIdOrInput.durationMinutes ?? 60;
  } else {
    relId = typeof relationshipIdOrInput === "string" ? relationshipIdOrInput : "";
    effectiveNotas = notas ?? null;
    effectiveSessionId = sessionId ?? null;
    effectiveKey = idempotencyKey ?? null;
    effectiveWorkedOn = workedOn ?? [];
    effectiveImprovements = improvements ?? null;
    effectiveNextGoals = nextGoals ?? null;
    effectiveMotivationalMessage = motivationalMessage ?? null;
    effectiveDurationMinutes = durationMinutes ?? 60;
  }

  const key = effectiveKey || generateCoachingIdempotencyKey("session");

  return retryTransient(
    async () => {
      const { data, error } = await supabase.rpc("record_coach_class_session", {
        p_relationship_id: relId,
        p_notas: effectiveNotas,
        p_idempotency_key: key,
        p_session_id: effectiveSessionId,
        p_worked_on: effectiveWorkedOn,
        p_improvements: effectiveImprovements,
        p_next_goals: effectiveNextGoals,
        p_motivational_message: effectiveMotivationalMessage,
        p_duration_minutes: effectiveDurationMinutes,
      });

      if (error) {
        throw error;
      }

      const res = data as {
        ok?: boolean;
        error?: string;
        remaining_balance?: number;
        total_classes_given?: number;
        session_id?: string;
        idempotent?: boolean;
      };

      if (!res || res.ok !== true) {
        throw new Error(
          res?.error || "No se pudo registrar la clase impartida."
        );
      }

      return {
        ok: true,
        remainingBalance: Number(res.remaining_balance ?? 0),
        totalClassesGiven: Number(res.total_classes_given ?? 0),
        sessionId: String(res.session_id ?? ""),
        idempotent: Boolean(res.idempotent),
      };
    },
    { label: "recordCoachClassSession" }
  );
}

/**
 * Consulta el historial de movimientos de clases del club (asignaciones y deducciones).
 * No oculta errores de permisos o conexión como listas vacías.
 */
export async function fetchClubClassLedger(
  organizadorId: string
): Promise<CoachClassLedgerEntry[]> {
  const { data, error } = await supabase
    .from("coach_class_ledger")
    .select(
      `
      id,
      relationship_id,
      organizador_id,
      coach_id,
      jugador_id,
      session_id,
      delta,
      tipo,
      notas,
      idempotency_key,
      recorded_by,
      created_at,
      coach:riviera_coaches(nombre),
      jugador:riviera_jugadores(nombre)
    `
    )
    .eq("organizador_id", organizadorId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[coaching] error fetching ledger", error);
    throw new Error(
      "No se pudo cargar el historial de clases del club: " + error.message
    );
  }

  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    relationshipId: row.relationship_id ? String(row.relationship_id) : null,
    organizadorId: String(row.organizador_id),
    coachId: String(row.coach_id),
    coachNombre: row.coach?.nombre || "Coach",
    jugadorId: String(row.jugador_id),
    jugadorNombre: row.jugador?.nombre || "Alumno",
    sessionId: row.session_id ? String(row.session_id) : null,
    delta: Number(row.delta),
    tipo: row.tipo,
    notas: row.notas,
    idempotencyKey: row.idempotency_key,
    recordedBy: String(row.recorded_by),
    createdAt: String(row.created_at),
  }));
}

/**
 * Consulta los alumnos vinculados a un coach, incluyendo su saldo disponible actual.
 * No oculta errores de RLS o conectividad como listas vacías.
 */
export async function fetchCoachAssignedStudents(
  coachId: string,
  organizadorId?: string
): Promise<CoachingPlayerLink[]> {
  let query = supabase
    .from("coach_player_relationships")
    .select(
      `
      id,
      coach_id,
      jugador_id,
      organizador_id,
      status,
      is_primary,
      coach:riviera_coaches(nombre),
      jugador:riviera_jugadores(nombre)
    `
    )
    .eq("coach_id", coachId);

  if (organizadorId) {
    query = query.eq("organizador_id", organizadorId);
  }

  const { data: rels, error } = await query.neq("status", "ENDED");
  if (error) {
    console.error("[coaching] error loading coach player relationships", error);
    throw new Error(
      "No se pudieron cargar los alumnos vinculados: " + error.message
    );
  }
  if (!rels || rels.length === 0) return [];

  const jugadorIds = rels.map((r: any) => String(r.jugador_id)).filter(Boolean);
  const rivieraIdMap = await fetchRivieraIdMapForJugadorIds(jugadorIds);

  const { data: balances, error: balanceError } = await supabase
    .from("coach_player_class_balances")
    .select("relationship_id, balance_classes, total_classes_given")
    .in(
      "relationship_id",
      rels.map((r: any) => r.id)
    );

  if (balanceError) {
    console.error("[coaching] error loading class balances", balanceError);
    throw new Error(
      "No se pudieron consultar los saldos de clases: " + balanceError.message
    );
  }

  const balanceMap = new Map<
    string,
    { balanceClasses: number; totalClassesGiven: number }
  >();
  for (const b of balances ?? []) {
    balanceMap.set(String(b.relationship_id), {
      balanceClasses: Number(b.balance_classes ?? 0),
      totalClassesGiven: Number(b.total_classes_given ?? 0),
    });
  }

  return rels.map((r: any) => {
    const coach = Array.isArray(r.coach) ? r.coach[0] : r.coach;
    const jugador = Array.isArray(r.jugador) ? r.jugador[0] : r.jugador;
    const jugadorId = String(r.jugador_id);
    const b = balanceMap.get(String(r.id));

    return {
      id: String(r.id),
      coachId: String(r.coach_id),
      coachNombre: String(coach?.nombre ?? "Coach"),
      jugadorId,
      jugadorNombre: String(jugador?.nombre ?? "Alumno"),
      rivieraId: rivieraIdMap.get(jugadorId) || "",
      status: r.status as CoachingPlayerLink["status"],
      isPrimary: Boolean(r.is_primary),
      balanceClasses: b?.balanceClasses ?? 0,
      totalClassesGiven: b?.totalClassesGiven ?? 0,
    };
  });
}

/**
 * Actualiza el estado de la relación alumno-coach (ACTIVE, PAUSED, ENDED).
 */
export async function updateLinkStatus(
  organizadorId: string,
  linkId: string,
  status: CoachingPlayerLink["status"]
): Promise<CoachingClubSnapshot> {
  const { error } = await supabase
    .from("coach_player_relationships")
    .update({
      status,
      ended_at: status === "ENDED" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", linkId)
    .eq("organizador_id", organizadorId);

  if (error) {
    throw new Error("No se pudo actualizar el estado de la relación: " + error.message);
  }

  return loadCoachingClubSnapshot(organizadorId);
}

/** Alias para compatibilidad con código existente */
export async function updateLinkStatusDemo(
  organizadorId: string,
  linkId: string,
  status: CoachingPlayerLink["status"]
): Promise<CoachingClubSnapshot> {
  return updateLinkStatus(organizadorId, linkId, status);
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPERIENCIA PRIVADA DEL ALUMNO ("MI COACHING")
// ══════════════════════════════════════════════════════════════════════════════

export interface StudentCoachingSessionInfo {
  id: string;
  startsAt: string;
  durationMinutes?: number | null;
  focus?: string | null;
  workedOn?: string[] | null;
  improvements?: string | null;
  nextGoals?: string | null;
  motivationalMessage?: string | null;
  notesSummary?: string | null;
}

export interface StudentCoachingLedgerEntry {
  id: string;
  delta: number;
  tipo: string;
  notas?: string | null;
  createdAt: string;
  session?: StudentCoachingSessionInfo | null;
}

export interface StudentCoachingRelationship {
  relationshipId: string;
  status: "ACTIVE" | "PAUSED" | "ENDED";
  isPrimary: boolean;
  startedAt: string;
  endedAt?: string | null;
  club: {
    organizadorId: string;
    nombre: string;
    brandingKey?: string | null;
  };
  coach: {
    id: string;
    nombre: string;
    coachCode?: string | null;
    fotoUrl?: string | null;
    especialidades?: string[] | null;
  };
  player: {
    id: string;
    nombre: string;
    fotoUrl?: string | null;
    rivieraId?: string | null;
  };
  balance: {
    balanceClasses: number;
    totalClassesGiven: number;
    updatedAt?: string | null;
  };
  upcomingSessions?: StudentCoachingUpcomingSession[];
  ledger: StudentCoachingLedgerEntry[];
}

export interface StudentCoachingOverview {
  ok: boolean;
  linked: boolean;
  rivieraId: string | null;
  relationships: StudentCoachingRelationship[];
  error?: string;
}

/**
 * Consulta el resumen de coaching del alumno autenticado.
 * Aislamiento estricto: solo devuelve los saldos, coach, club e historial del usuario en sesión.
 */
export async function fetchStudentCoachingOverview(): Promise<StudentCoachingOverview> {
  const { data, error } = await supabase.rpc("get_student_coaching_overview");

  if (error) {
    console.error("[coaching] error fetching student overview:", error);
    throw new Error("No se pudo cargar la información de Mi Coaching: " + error.message);
  }

  const raw = data as Record<string, unknown> | null;
  if (!raw || raw.ok === false) {
    return {
      ok: false,
      linked: false,
      rivieraId: null,
      relationships: [],
      error: typeof raw?.error === "string" ? raw.error : "Error desconocido",
    };
  }

  const rawRels = Array.isArray(raw.relationships) ? raw.relationships : [];
  const relationships: StudentCoachingRelationship[] = rawRels.map((item: any) => ({
    relationshipId: String(item.relationship_id ?? ""),
    status: (item.status === "PAUSED" || item.status === "ENDED" ? item.status : "ACTIVE"),
    isPrimary: Boolean(item.is_primary),
    startedAt: String(item.started_at ?? ""),
    endedAt: item.ended_at ? String(item.ended_at) : null,
    club: {
      organizadorId: String(item.club?.organizador_id ?? ""),
      nombre: String(item.club?.nombre ?? "Club"),
      brandingKey: item.club?.branding_key ? String(item.club.branding_key) : null,
    },
    coach: {
      id: String(item.coach?.id ?? ""),
      nombre: String(item.coach?.nombre ?? "Coach"),
      coachCode: item.coach?.coach_code ? String(item.coach.coach_code) : null,
      fotoUrl: item.coach?.foto_url ? String(item.coach.foto_url) : null,
      especialidades: Array.isArray(item.coach?.especialidades) ? item.coach.especialidades : [],
    },
    player: {
      id: String(item.player?.id ?? ""),
      nombre: String(item.player?.nombre ?? "Alumno"),
      fotoUrl: item.player?.foto_url ? String(item.player.foto_url) : null,
      rivieraId: item.player?.riviera_id ? String(item.player.riviera_id) : null,
    },
    balance: {
      balanceClasses: Number(item.balance?.balance_classes ?? 0),
      totalClassesGiven: Number(item.balance?.total_classes_given ?? 0),
      updatedAt: item.balance?.updated_at ? String(item.balance.updated_at) : null,
    },
    upcomingSessions: Array.isArray(item.upcoming_sessions)
      ? item.upcoming_sessions.map((sch: any) => ({
          id: String(sch.id ?? ""),
          startsAt: String(sch.starts_at ?? ""),
          endsAt: String(sch.ends_at ?? ""),
          durationMinutes: Number(sch.duration_minutes ?? 60),
          court: sch.court ? String(sch.court) : null,
          focus: sch.focus ? String(sch.focus) : null,
          status: String(sch.status ?? "SCHEDULED"),
        }))
      : [],
    ledger: Array.isArray(item.ledger)
      ? item.ledger.map((entry: any) => ({
          id: String(entry.id ?? ""),
          delta: Number(entry.delta ?? 0),
          tipo: String(entry.tipo ?? ""),
          notas: entry.notas ? String(entry.notas) : null,
          createdAt: String(entry.created_at ?? ""),
          session: entry.session
            ? {
                id: String(entry.session.id ?? ""),
                startsAt: String(entry.session.starts_at ?? ""),
                durationMinutes: entry.session.duration_minutes != null ? Number(entry.session.duration_minutes) : null,
                focus: entry.session.focus ? String(entry.session.focus) : null,
                workedOn: Array.isArray(entry.session.worked_on) ? entry.session.worked_on : [],
                improvements: entry.session.improvements ? String(entry.session.improvements) : null,
                nextGoals: entry.session.next_goals ? String(entry.session.next_goals) : null,
                motivationalMessage: entry.session.motivational_message ? String(entry.session.motivational_message) : null,
                notesSummary: entry.session.notes_summary ? String(entry.session.notes_summary) : null,
              }
            : null,
        }))
      : [],
  }));

  return {
    ok: true,
    linked: Boolean(raw.linked),
    rivieraId: raw.riviera_id ? String(raw.riviera_id) : null,
    relationships,
  };
}

/**
 * Permite al alumno vincular su cuenta con su Riviera ID oficial.
 */
export async function linkStudentAccountByRivieraId(
  rivieraIdRaw: string
): Promise<{ ok: boolean; jugadorId?: string; nombre?: string; rivieraId?: string; error?: string }> {
  const norm = normalizeRivieraIdInput(rivieraIdRaw.trim().toUpperCase());
  if (!norm) {
    throw new Error("Formato de Riviera ID inválido. Debe tener la estructura RIV-########");
  }

  const { data, error } = await supabase.rpc("link_student_by_riviera_id", {
    p_riviera_id: norm,
  });

  if (error) {
    console.error("[coaching] error linking student by riviera id:", error);
    throw new Error(error.message);
  }

  const res = data as Record<string, unknown> | null;
  if (!res || res.ok === false) {
    throw new Error(typeof res?.error === "string" ? res.error : "No se pudo vincular el perfil.");
  }

  return {
    ok: true,
    jugadorId: String(res.jugador_id ?? ""),
    nombre: String(res.nombre ?? ""),
    rivieraId: String(res.riviera_id ?? norm),
  };
}

/**
 * Permite al administrador del club vincular autorizadamente a un alumno mediante su correo verificado.
 * Utilizado cuando el alumno no cuenta con correo en su perfil de club o requiere asistencia administrativa.
 */
export async function linkCoachStudentByClub(
  organizadorId: string,
  jugadorId: string,
  studentEmail: string
): Promise<{
  ok: boolean;
  jugadorId?: string;
  authUserId?: string;
  nombre?: string;
  message?: string;
}> {
  const emailNorm = studentEmail.trim().toLowerCase();
  if (!emailNorm) {
    throw new Error("El correo electrónico del alumno es obligatorio.");
  }

  const { data, error } = await supabase.rpc("link_coach_student_by_club", {
    p_organizador_id: organizadorId,
    p_jugador_id: jugadorId,
    p_student_email: emailNorm,
  });

  if (error) {
    console.error("[coaching] error linking student by club:", error);
    throw new Error(error.message);
  }

  const res = data as Record<string, unknown> | null;
  if (!res || res.ok === false) {
    throw new Error(
      typeof res?.error === "string" ? res.error : "No se pudo vincular el alumno."
    );
  }

  return {
    ok: true,
    jugadorId: String(res.jugador_id ?? jugadorId),
    authUserId: typeof res.auth_user_id === "string" ? res.auth_user_id : undefined,
    nombre: typeof res.nombre === "string" ? res.nombre : undefined,
    message: typeof res.message === "string" ? res.message : undefined,
  };
}

/**
 * Consulta el detalle administrativo completo de un coach para un club específico.
 * Devuelve identidad, configuración local, alumnos vinculados, historial de clases y sesiones.
 */
export async function fetchClubCoachDetail(
  organizadorId: string,
  coachId: string
): Promise<ClubCoachDetail> {
  const { data, error } = await supabase.rpc("get_club_coach_detail", {
    p_organizador_id: organizadorId,
    p_coach_id: coachId,
  });

  if (error) {
    console.error("[coaching] error fetching club coach detail:", error);
    throw new Error(error.message);
  }

  const res = data as Record<string, any> | null;
  if (!res || res.ok === false) {
    throw new Error(
      typeof res?.error === "string"
        ? res.error
        : "No se pudo cargar el panel del coach."
    );
  }

  return {
    ok: true,
    coach: {
      id: String(res.coach?.id ?? ""),
      coachCode: String(res.coach?.coach_code ?? ""),
      nombre: String(res.coach?.nombre ?? "Coach"),
      email: res.coach?.email ? String(res.coach.email) : null,
      fotoUrl: res.coach?.foto_url ? String(res.coach.foto_url) : null,
      bio: res.coach?.bio ? String(res.coach.bio) : null,
      filosofia: res.coach?.filosofia ? String(res.coach.filosofia) : null,
      certificaciones: res.coach?.certificaciones
        ? String(res.coach.certificaciones)
        : null,
      experiencia: res.coach?.experiencia
        ? String(res.coach.experiencia)
        : null,
      especialidades: Array.isArray(res.coach?.especialidades)
        ? res.coach.especialidades
        : [],
      fuerzas: Array.isArray(res.coach?.fuerzas)
        ? (res.coach.fuerzas as RivieraJugadorCategoria[])
        : [],
      createdAt: String(res.coach?.created_at ?? ""),
    },
    membership: {
      id: String(res.membership?.id ?? ""),
      status: (res.membership?.status as CoachMembershipStatus) || "INACTIVE",
      invitedAt: res.membership?.invited_at
        ? String(res.membership.invited_at)
        : null,
      activatedAt: res.membership?.activated_at
        ? String(res.membership.activated_at)
        : null,
      deactivatedAt: res.membership?.deactivated_at
        ? String(res.membership.deactivated_at)
        : null,
      cancelledAt: res.membership?.cancelled_at
        ? String(res.membership.cancelled_at)
        : null,
      archivedAt: res.membership?.archived_at
        ? String(res.membership.archived_at)
        : null,
      removedAt: res.membership?.removed_at
        ? String(res.membership.removed_at)
        : null,
      removalReason: res.membership?.removal_reason
        ? String(res.membership.removal_reason)
        : null,
      clubFuerzas: Array.isArray(res.membership?.club_fuerzas)
        ? (res.membership.club_fuerzas as RivieraJugadorCategoria[])
        : null,
      clubEspecialidades: Array.isArray(res.membership?.club_especialidades)
        ? (res.membership.club_especialidades as string[])
        : null,
      clubNotas:
        typeof res.membership?.club_notas === "string"
          ? res.membership.club_notas
          : null,
      clubDisponibilidad:
        typeof res.membership?.club_disponibilidad === "string"
          ? res.membership.club_disponibilidad
          : null,
      lastEditedAt: res.membership?.last_edited_at
        ? String(res.membership.last_edited_at)
        : null,
      createdAt: String(res.membership?.created_at ?? ""),
    },
    club: {
      id: String(res.club?.id ?? organizadorId),
      nombre: String(res.club?.nombre ?? "Club"),
      brandingKey: res.club?.branding_key
        ? String(res.club.branding_key)
        : null,
    },
    students: Array.isArray(res.students)
      ? res.students.map((s: any) => ({
          relationshipId: String(s.relationship_id ?? ""),
          jugadorId: String(s.jugador_id ?? ""),
          nombre: String(s.nombre ?? "Alumno"),
          fotoUrl: s.foto_url ? String(s.foto_url) : null,
          categoria: s.categoria ? String(s.categoria) : null,
          rama: s.rama ? String(s.rama) : null,
          genero: s.genero ? String(s.genero) : null,
          rivieraId: String(s.riviera_id ?? ""),
          isPrimary: Boolean(s.is_primary),
          status: String(s.status ?? "ACTIVE"),
          startedAt: String(s.started_at ?? ""),
          balanceClasses: Number(s.balance_classes ?? 0),
          totalClassesGiven: Number(s.total_classes_given ?? 0),
          updatedAt: s.updated_at ? String(s.updated_at) : null,
        }))
      : [],
    sessions: Array.isArray(res.sessions)
      ? res.sessions.map((s: any) => ({
          id: String(s.id ?? ""),
          relationshipId: s.relationship_id ? String(s.relationship_id) : null,
          jugadorNombre: String(s.jugador_nombre ?? "Alumno"),
          startsAt: String(s.starts_at ?? ""),
          endsAt: s.ends_at ? String(s.ends_at) : null,
          durationMinutes:
            s.duration_minutes != null ? Number(s.duration_minutes) : null,
          focus: s.focus ? String(s.focus) : null,
          workedOn: Array.isArray(s.worked_on) ? s.worked_on : [],
          improvements: s.improvements ? String(s.improvements) : null,
          nextGoals: s.next_goals ? String(s.next_goals) : null,
          motivationalMessage: s.motivational_message
            ? String(s.motivational_message)
            : null,
          notesSummary: s.notes_summary ? String(s.notes_summary) : null,
          status: String(s.status ?? "COMPLETED"),
          createdAt: String(s.created_at ?? ""),
        }))
      : [],
    ledger: Array.isArray(res.ledger)
      ? res.ledger.map((l: any) => ({
          id: String(l.id ?? ""),
          relationshipId: l.relationship_id ? String(l.relationship_id) : null,
          jugadorId: String(l.jugador_id ?? ""),
          jugadorNombre: String(l.jugador_nombre ?? "Alumno"),
          delta: Number(l.delta ?? 0),
          tipo: String(l.tipo ?? ""),
          notas: l.notas ? String(l.notas) : null,
          recordedBy: String(l.recorded_by ?? ""),
          createdAt: String(l.created_at ?? ""),
        }))
      : [],
    auditLog: Array.isArray(res.audit_log)
      ? res.audit_log.map((a: any) => ({
          id: String(a.id ?? ""),
          action: String(a.action ?? ""),
          previousStatus: a.previous_status ? String(a.previous_status) : null,
          newStatus: a.new_status ? String(a.new_status) : null,
          details:
            a.details && typeof a.details === "object" ? a.details : {},
          createdAt: String(a.created_at ?? ""),
        }))
      : [],
    stats: {
      totalStudents: Number(res.stats?.total_students ?? 0),
      activeStudents: Number(res.stats?.active_students ?? 0),
      totalClassesAssigned: Number(res.stats?.total_classes_assigned ?? 0),
      totalClassesGiven: Number(res.stats?.total_classes_given ?? 0),
      currentBalance: Number(res.stats?.current_balance ?? 0),
    },
  };
}

/**
 * Actualiza la configuración propia del club para un coach.
 * Modifica exclusivamente los campos de la relación local sin alterar la identidad global.
 */
export async function updateCoachClubMembershipSettings(
  organizadorId: string,
  coachId: string,
  settings: {
    fuerzas?: RivieraJugadorCategoria[];
    especialidades?: string[];
    notas?: string;
    disponibilidad?: string;
  }
): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await supabase.rpc(
    "update_coach_club_membership_settings",
    {
      p_organizador_id: organizadorId,
      p_coach_id: coachId,
      p_club_fuerzas: settings.fuerzas || null,
      p_club_especialidades: settings.especialidades || null,
      p_club_notas: settings.notas || null,
      p_club_disponibilidad: settings.disponibilidad || null,
    }
  );

  if (error) {
    console.error("[coaching] error updating membership settings:", error);
    throw new Error(error.message);
  }

  const res = data as Record<string, any> | null;
  if (!res || res.ok === false) {
    throw new Error(
      typeof res?.error === "string"
        ? res.error
        : "No se pudo actualizar la configuración del entrenador."
    );
  }

  return {
    ok: true,
    message: String(res.message ?? "Configuración actualizada exitosamente."),
  };
}

/**
 * Cancela una invitación pendiente de un coach a este club.
 */
export async function cancelCoachClubInvitation(
  organizadorId: string,
  coachId: string
): Promise<{ ok: boolean; message: string; status: CoachMembershipStatus }> {
  const { data, error } = await supabase.rpc("cancel_coach_club_invitation", {
    p_organizador_id: organizadorId,
    p_coach_id: coachId,
  });

  if (error) {
    console.error("[coaching] error cancelling invitation:", error);
    throw new Error(error.message);
  }

  const res = data as Record<string, any> | null;
  if (!res || res.ok === false) {
    throw new Error(
      typeof res?.error === "string"
        ? res.error
        : "No se pudo cancelar la invitación."
    );
  }

  return {
    ok: true,
    status: (res.status as CoachMembershipStatus) || "CANCELLED",
    message: String(res.message ?? "Invitación cancelada exitosamente."),
  };
}

/**
 * Archiva a un entrenador inactivo o cancelado para ocultarlo de la lista principal.
 */
export async function archiveCoachFromClub(
  organizadorId: string,
  coachId: string
): Promise<{ ok: boolean; message: string; status: CoachMembershipStatus }> {
  const { data, error } = await supabase.rpc("archive_coach_from_club", {
    p_organizador_id: organizadorId,
    p_coach_id: coachId,
  });

  if (error) {
    console.error("[coaching] error archiving coach:", error);
    throw new Error(error.message);
  }

  const res = data as Record<string, any> | null;
  if (!res || res.ok === false) {
    throw new Error(
      typeof res?.error === "string"
        ? res.error
        : "No se pudo archivar al entrenador."
    );
  }

  return {
    ok: true,
    status: (res.status as CoachMembershipStatus) || "ARCHIVED",
    message: String(res.message ?? "Entrenador archivado exitosamente."),
  };
}

/**
 * Restaura a un entrenador archivado a la lista de inactivos.
 */
export async function unarchiveCoachFromClub(
  organizadorId: string,
  coachId: string
): Promise<{ ok: boolean; message: string; status: CoachMembershipStatus }> {
  const { data, error } = await supabase.rpc("unarchive_coach_from_club", {
    p_organizador_id: organizadorId,
    p_coach_id: coachId,
  });

  if (error) {
    console.error("[coaching] error unarchiving coach:", error);
    throw new Error(error.message);
  }

  const res = data as Record<string, any> | null;
  if (!res || res.ok === false) {
    throw new Error(
      typeof res?.error === "string"
        ? res.error
        : "No se pudo desarchivar al entrenador."
    );
  }

  return {
    ok: true,
    status: (res.status as CoachMembershipStatus) || "INACTIVE",
    message: String(res.message ?? "Entrenador desarchivado exitosamente."),
  };
}

/**
 * Elimina a un entrenador de este club desde cualquier estado (ACTIVE, PENDING, INACTIVE, CANCELLED, ARCHIVED).
 * Operación atómica e irreversible para la membresía en este club:
 * - Pone status en REMOVED
 * - Suspende relaciones activas de alumnos en este club
 * - Conserva íntegramente: balances, ledger, historial de sesiones y la cuenta global del coach
 */
export async function removeCoachFromClub(
  organizadorId: string,
  coachId: string,
  motivo?: string
): Promise<RemoveCoachResult> {
  const { data, error } = await supabase.rpc("remove_coach_from_club", {
    p_organizador_id: organizadorId,
    p_coach_id: coachId,
    p_motivo: motivo || null,
  });

  if (error) {
    console.error("[coaching] error removing coach from club:", error);
    throw new Error(error.message);
  }

  const res = data as Record<string, any> | null;
  if (!res || res.ok === false) {
    throw new Error(
      typeof res?.error === "string"
        ? res.error
        : "No se pudo eliminar al entrenador del club."
    );
  }

  return {
    ok: true,
    status: (res.status as CoachMembershipStatus) || "REMOVED",
    message: String(res.message ?? "Entrenador eliminado de tu club exitosamente."),
    idempotent: Boolean(res.idempotent),
  };
}

/**
 * Consulta y verifica los datos oficiales de un alumno por su Riviera ID.
 * Requiere contexto del club organizador y que el club tenga Coaching habilitado.
 * Permite previsualizar su identidad deportiva antes de asignarlo a un entrenador.
 */
export async function lookupStudentByRivieraId(
  organizadorId: string,
  rivieraId: string
): Promise<StudentLookupResult> {
  const normId = normalizeRivieraIdInput(rivieraId);
  if (!normId) {
    throw new Error("Ingresa un Riviera ID válido (ej. RIV-00000278).");
  }

  const { data, error } = await supabase.rpc("lookup_student_by_riviera_id", {
    p_organizador_id: organizadorId,
    p_riviera_id: normId,
  });

  if (error) {
    console.error("[coaching] error looking up student:", error);
    throw new Error(error.message);
  }

  const res = data as { ok?: boolean; error?: string; student?: StudentLookupResult };
  if (!res || res.ok === false || !res.student) {
    throw new Error(res?.error || `No se encontró ningún jugador con el Riviera ID ${normId}.`);
  }

  return res.student;
}

/**
 * Asigna un alumno existente a un entrenador del club y le abona opcionalmente clases iniciales.
 * REGLA DEFINITIVA: Exclusivo del club organizador.
 * Es idempotente para evitar duplicación de clases por reintentos de red.
 */
export async function assignStudentToClubCoach(
  organizadorId: string,
  coachId: string,
  rivieraId: string,
  initialClasses: number = 0,
  reference?: string,
  idempotencyKey?: string
): Promise<AssignStudentToClubCoachResult> {
  const key = idempotencyKey || generateCoachingIdempotencyKey("assign-student");

  return await retryTransient(
    async () => {
      const { data, error } = await supabase.rpc("assign_student_to_club_coach", {
        p_organizador_id: organizadorId,
        p_coach_id: coachId,
        p_riviera_id: rivieraId,
        p_initial_classes: initialClasses,
        p_idempotency_key: key,
        p_reference: reference || null,
      });

      if (error) {
        throw error;
      }

      const res = data as AssignStudentToClubCoachResult;
      if (!res || res.ok === false) {
        throw new Error(res?.error || "No se pudo asignar el alumno al entrenador.");
      }

      return res;
    },
    { label: "assignStudentToClubCoach" }
  );
}

/**
 * Borra definitivamente a un entrenador de la lista del club (estado REMOVED).
 * Preserva todo el historial de auditoría y registros deportivos pasados,
 * pero elimina la fila de membresía para que desaparezca de las listas del club.
 */
export async function finalizeCoachRemovalFromClub(
  organizadorId: string,
  coachId: string,
  motivo?: string
): Promise<FinalizeCoachRemovalResult> {
  const { data, error } = await supabase.rpc("finalize_coach_removal_from_club", {
    p_organizador_id: organizadorId,
    p_coach_id: coachId,
    p_motivo: motivo || null,
  });

  if (error) {
    console.error("[coaching] error finalizing coach removal:", error);
    throw new Error(error.message);
  }

  const res = data as { ok?: boolean; error?: string; message?: string };
  if (!res || res.ok === false) {
    throw new Error(res?.error || "No se pudo eliminar definitivamente al entrenador del club.");
  }

  return {
    ok: true,
    message: String(res.message ?? "Entrenador eliminado definitivamente de tu club."),
  };
}

/**
 * Reasigna un alumno y su saldo restante de clases desde un entrenador a otro en el mismo club.
 */
export async function reassignStudentCoach(
  organizadorId: string,
  studentId: string,
  fromCoachId: string,
  toCoachId: string,
  notes?: string,
  idempotencyKey?: string
): Promise<ReassignStudentCoachResult> {
  const { data, error } = await supabase.rpc("reassign_student_coach", {
    p_organizador_id: organizadorId,
    p_student_id: studentId,
    p_from_coach_id: fromCoachId,
    p_to_coach_id: toCoachId,
    p_notes: notes || null,
    p_idempotency_key: idempotencyKey || null,
  });

  if (error) {
    console.error("[coaching] error reassigning student coach:", error);
    throw new Error(error.message);
  }

  const res = data as ReassignStudentCoachResult;
  if (!res || res.ok === false) {
    throw new Error(res?.error || "No se pudo reasignar el alumno.");
  }

  return res;
}

/**
 * Realiza un ajuste compensatorio inmutable sobre el saldo de un alumno con un coach.
 * - delta positivo suma clases, delta negativo resta clases.
 * - Validación atómica: no permite que el saldo resulte negativo.
 * - Idempotente y auditable en coach_audit_log y coach_class_ledger.
 */
export async function adjustCoachStudentClasses(
  organizadorId: string,
  coachId: string,
  studentId: string,
  delta: number,
  motivo: string,
  referenceLedgerId?: string | null,
  idempotencyKey?: string,
  expectedCurrentBalance?: number | null
): Promise<AdjustCoachStudentClassesResult> {
  const key = idempotencyKey || generateCoachingIdempotencyKey("adjust");

  const { data, error } = await supabase.rpc("adjust_coach_student_classes", {
    p_organizador_id: organizadorId,
    p_coach_id: coachId,
    p_student_id: studentId,
    p_delta: delta,
    p_motivo: motivo,
    p_reference_ledger_id: referenceLedgerId || null,
    p_idempotency_key: key,
    p_expected_current_balance:
      expectedCurrentBalance != null ? expectedCurrentBalance : null,
  });

  if (error) {
    console.error("[coaching] error adjusting classes:", error);
    throw new Error(error.message);
  }

  const res = data as Record<string, any> | null;
  if (!res || res.ok === false) {
    const err = new Error(res?.error || "No se pudo realizar el ajuste de saldo.");
    if (res?.current_balance != null) {
      (err as any).currentBalance = res.current_balance;
    }
    throw err;
  }

  return {
    ok: true,
    adjustmentId: res.adjustment_id ? String(res.adjustment_id) : undefined,
    delta: res.delta != null ? Number(res.delta) : undefined,
    previousBalance:
      res.previous_balance != null ? Number(res.previous_balance) : undefined,
    newBalance: res.new_balance != null ? Number(res.new_balance) : undefined,
    message: String(res.message ?? "Saldo corregido correctamente."),
    idempotent: Boolean(res.idempotent),
  };
}

/**
 * Revierte una clase impartida por error.
 * - Restaura 1 clase al saldo disponible (+1).
 * - Decrementa el contador de clases impartidas (-1).
 * - Registra movimiento compensatorio inmutable con referencia a la sesión.
 * - Marca la sesión como revertida (reverted_at, reverted_by).
 */
export async function revertCoachClassSession(
  organizadorId: string,
  sessionId: string,
  motivo: string,
  idempotencyKey?: string
): Promise<RevertCoachClassSessionResult> {
  const key = idempotencyKey || generateCoachingIdempotencyKey("revert-session");

  const { data, error } = await supabase.rpc("revert_coach_class_session", {
    p_organizador_id: organizadorId,
    p_session_id: sessionId,
    p_motivo: motivo,
    p_idempotency_key: key,
  });

  if (error) {
    console.error("[coaching] error reverting session:", error);
    throw new Error(error.message);
  }

  const res = data as Record<string, any> | null;
  if (!res || res.ok === false) {
    throw new Error(res?.error || "No se pudo revertir la sesión de clase.");
  }

  return {
    ok: true,
    adjustmentId: res.adjustment_id ? String(res.adjustment_id) : undefined,
    newBalance: res.new_balance != null ? Number(res.new_balance) : undefined,
    totalClassesGiven: res.total_classes_given != null ? Number(res.total_classes_given) : undefined,
    message: String(res.message ?? "Clase revertida y devuelta al saldo del alumno."),
  };
}

/**
 * Agenda una nueva clase en el calendario del club.
 */
export async function scheduleCoachClass(params: {
  organizadorId: string;
  coachId: string;
  studentId: string;
  startsAt: string;
  durationMinutes?: number;
  court?: string | null;
  focus?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
}): Promise<ScheduleCoachClassResult> {
  const { data, error } = await supabase.rpc("schedule_coach_class", {
    p_organizador_id: params.organizadorId,
    p_coach_id: params.coachId,
    p_student_id: params.studentId,
    p_starts_at: params.startsAt,
    p_duration_minutes: params.durationMinutes ?? 60,
    p_court: params.court || null,
    p_focus: params.focus || null,
    p_notes: params.notes || null,
    p_idempotency_key: params.idempotencyKey || null,
  });

  if (error) {
    console.error("[coaching] error scheduling class:", error);
    throw new Error(error.message);
  }

  const res = data as Record<string, any> | null;
  if (!res || res.ok === false) {
    throw new Error(res?.error || "No se pudo agendar la clase.");
  }

  return {
    ok: true,
    sessionId: res.session_id ? String(res.session_id) : undefined,
    startsAt: res.starts_at ? String(res.starts_at) : undefined,
    endsAt: res.ends_at ? String(res.ends_at) : undefined,
    durationMinutes: res.duration_minutes != null ? Number(res.duration_minutes) : undefined,
    court: res.court ? String(res.court) : null,
    idempotent: Boolean(res.idempotent),
    message: String(res.message ?? "Clase agendada exitosamente."),
  };
}

/**
 * Reprograma una clase agendada (cambio de fecha/hora o cancha).
 */
export async function rescheduleCoachClass(params: {
  organizadorId: string;
  sessionId: string;
  newStartsAt: string;
  durationMinutes?: number;
  court?: string | null;
  reason?: string | null;
}): Promise<RescheduleCoachClassResult> {
  const { data, error } = await supabase.rpc("reschedule_coach_class", {
    p_organizador_id: params.organizadorId,
    p_session_id: params.sessionId,
    p_new_starts_at: params.newStartsAt,
    p_duration_minutes: params.durationMinutes ?? null,
    p_court: params.court || null,
    p_reason: params.reason || null,
  });

  if (error) {
    console.error("[coaching] error rescheduling class:", error);
    throw new Error(error.message);
  }

  const res = data as Record<string, any> | null;
  if (!res || res.ok === false) {
    throw new Error(res?.error || "No se pudo reprogramar la clase.");
  }

  return {
    ok: true,
    sessionId: res.session_id ? String(res.session_id) : undefined,
    startsAt: res.starts_at ? String(res.starts_at) : undefined,
    endsAt: res.ends_at ? String(res.ends_at) : undefined,
    durationMinutes: res.duration_minutes != null ? Number(res.duration_minutes) : undefined,
    court: res.court ? String(res.court) : null,
    message: String(res.message ?? "Clase reprogramada exitosamente."),
  };
}

/**
 * Cancela una clase agendada con motivo obligatorio.
 */
export async function cancelCoachClass(params: {
  organizadorId: string;
  sessionId: string;
  reason: string;
}): Promise<CancelCoachClassResult> {
  const { data, error } = await supabase.rpc("cancel_coach_class", {
    p_organizador_id: params.organizadorId,
    p_session_id: params.sessionId,
    p_reason: params.reason,
  });

  if (error) {
    console.error("[coaching] error cancelling class:", error);
    throw new Error(error.message);
  }

  const res = data as Record<string, any> | null;
  if (!res || res.ok === false) {
    throw new Error(res?.error || "No se pudo cancelar la clase.");
  }

  return {
    ok: true,
    sessionId: res.session_id ? String(res.session_id) : undefined,
    message: String(res.message ?? "Clase cancelada exitosamente."),
  };
}

/**
 * Consulta la agenda real de clases del club con filtros opcionales.
 */
export async function fetchClubCoachingAgenda(params: {
  organizadorId: string;
  coachId?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  statusFilter?: string | null;
}): Promise<CoachScheduledSession[]> {
  const { data, error } = await supabase.rpc("fetch_club_coaching_agenda", {
    p_organizador_id: params.organizadorId,
    p_coach_id: params.coachId || null,
    p_from_date: params.fromDate || null,
    p_to_date: params.toDate || null,
    p_status_filter: params.statusFilter || null,
  });

  if (error) {
    console.error("[coaching] error fetching club coaching agenda:", error);
    throw new Error("No se pudo cargar la agenda de coaching: " + error.message);
  }

  const rawList = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as any).sessions)
    ? (data as any).sessions
    : [];

  return rawList.map((row: any): CoachScheduledSession => ({
    id: String(row.id ?? ""),
    coachId: String(row.coach_id ?? ""),
    coachNombre: row.coach_nombre ? String(row.coach_nombre) : undefined,
    coachCode: row.coach_code ? String(row.coach_code) : undefined,
    coachFoto: row.coach_foto ? String(row.coach_foto) : null,
    jugadorId: String(row.jugador_id ?? ""),
    jugadorNombre: row.jugador_nombre ? String(row.jugador_nombre) : undefined,
    jugadorFoto: row.jugador_foto ? String(row.jugador_foto) : null,
    rivieraId: row.riviera_id ? String(row.riviera_id) : undefined,
    relationshipId: row.relationship_id ? String(row.relationship_id) : null,
    organizadorId: row.organizador_id ? String(row.organizador_id) : undefined,
    clubNombre: row.club_nombre ? String(row.club_nombre) : undefined,
    startsAt: String(row.starts_at ?? ""),
    endsAt: String(row.ends_at ?? ""),
    durationMinutes: Number(row.duration_minutes ?? 60),
    court: row.court ? String(row.court) : null,
    focus: row.focus ? String(row.focus) : null,
    notesSummary: row.notes_summary ? String(row.notes_summary) : null,
    status: row.status as any,
    workedOn: Array.isArray(row.worked_on) ? row.worked_on : [],
    cancellationReason: row.cancellation_reason ? String(row.cancellation_reason) : null,
    revertedAt: row.reverted_at ? String(row.reverted_at) : null,
    balanceClasses: row.balance_classes != null ? Number(row.balance_classes) : undefined,
    createdAt: String(row.created_at ?? ""),
  }));
}

/**
 * Consulta la agenda del coach autenticado (próximas clases programadas).
 */
export async function fetchCoachAgenda(params?: {
  organizadorId?: string | null;
  statusFilter?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
}): Promise<CoachScheduledSession[]> {
  const { data, error } = await supabase.rpc("fetch_coach_agenda", {
    p_organizador_id: params?.organizadorId || null,
    p_status_filter: params?.statusFilter || null,
    p_from_date: params?.fromDate || null,
    p_to_date: params?.toDate || null,
  });

  if (error) {
    console.error("[coaching] error fetching coach agenda:", error);
    throw new Error("No se pudo cargar la agenda del coach: " + error.message);
  }

  const rawList = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as any).sessions)
    ? (data as any).sessions
    : [];

  return rawList.map((row: any): CoachScheduledSession => ({
    id: String(row.id ?? ""),
    coachId: String(row.coach_id ?? ""),
    coachNombre: row.coach_nombre ? String(row.coach_nombre) : undefined,
    coachCode: row.coach_code ? String(row.coach_code) : undefined,
    coachFoto: row.coach_foto ? String(row.coach_foto) : null,
    jugadorId: String(row.jugador_id ?? ""),
    jugadorNombre: row.jugador_nombre ? String(row.jugador_nombre) : undefined,
    jugadorFoto: row.jugador_foto ? String(row.jugador_foto) : null,
    rivieraId: row.riviera_id ? String(row.riviera_id) : undefined,
    relationshipId: row.relationship_id ? String(row.relationship_id) : null,
    organizadorId: row.organizador_id ? String(row.organizador_id) : undefined,
    clubNombre: row.club_nombre ? String(row.club_nombre) : undefined,
    startsAt: String(row.starts_at ?? ""),
    endsAt: String(row.ends_at ?? ""),
    durationMinutes: Number(row.duration_minutes ?? 60),
    court: row.court ? String(row.court) : null,
    focus: row.focus ? String(row.focus) : null,
    notesSummary: row.notes_summary ? String(row.notes_summary) : null,
    status: row.status as any,
    workedOn: Array.isArray(row.worked_on) ? row.worked_on : [],
    cancellationReason: row.cancellation_reason ? String(row.cancellation_reason) : null,
    revertedAt: row.reverted_at ? String(row.reverted_at) : null,
    balanceClasses: row.balance_classes != null ? Number(row.balance_classes) : undefined,
    createdAt: String(row.created_at ?? ""),
  }));
}

