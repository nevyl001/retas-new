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
        const status: CoachMembershipStatus =
          row.status === "ACTIVE" || row.status === "PENDING"
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
  prefix: "assign" | "session" = "session"
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
 * Conserva la clave de idempotencia entre reintentos para no duplicar deducciones.
 */
export async function recordCoachClassSession(
  relationshipId: string,
  notas?: string,
  sessionId?: string,
  idempotencyKey?: string
): Promise<{
  ok: boolean;
  remainingBalance: number;
  totalClassesGiven: number;
  sessionId: string;
  idempotent?: boolean;
}> {
  const key = idempotencyKey || generateCoachingIdempotencyKey("session");

  return retryTransient(
    async () => {
      const { data, error } = await supabase.rpc("record_coach_class_session", {
        p_relationship_id: relationshipId,
        p_notas: notas || null,
        p_idempotency_key: key,
        p_session_id: sessionId || null,
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
    rivieraId?: string | null;
  };
  balance: {
    balanceClasses: number;
    totalClassesGiven: number;
    updatedAt?: string | null;
  };
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
      rivieraId: item.player?.riviera_id ? String(item.player.riviera_id) : null,
    },
    balance: {
      balanceClasses: Number(item.balance?.balance_classes ?? 0),
      totalClassesGiven: Number(item.balance?.total_classes_given ?? 0),
      updatedAt: item.balance?.updated_at ? String(item.balance.updated_at) : null,
    },
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

