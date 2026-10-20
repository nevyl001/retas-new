import { supabase } from "../supabaseClient";
import { normalizeRivieraIdInput } from "../rivieraJugadores/playerMembership";
import { fetchRivieraIdMapForJugadorIds } from "../rivieraJugadores/rivieraIdDisplay";
import type { RivieraJugadorCategoria } from "../rivieraJugadores/types";
import { loadCoachingDemo } from "./demoStore";
import type {
  CoachMembershipStatus,
  CoachSearchResult,
  CoachingClubSnapshot,
  CoachingPlayerLink,
  CreateCoachInput,
  CurrentCoachClubMembership,
  CurrentCoachProfile,
  InviteCoachResult,
} from "./types";

function isMissingRelationError(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "PGRST116" ||
    msg.includes("does not exist") ||
    msg.includes("riviera_coaches") ||
    msg.includes("coach_club_memberships")
  );
}

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
      if (isMissingRelationError(error)) {
        return loadCoachingDemo(organizadorId);
      }
      console.warn("[coaching] memberships load error", error.message);
      return loadCoachingDemo(organizadorId);
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

      if (!relError && rels && rels.length > 0) {
        // Resolver los Riviera IDs canónicos oficiales
        const jugadorIds = rels
          .map((r) => String(r.jugador_id))
          .filter(Boolean);
        const rivieraIdMap = await fetchRivieraIdMapForJugadorIds(jugadorIds);

        links = rels.map((r) => {
          const coach = Array.isArray(r.coach) ? r.coach[0] : r.coach;
          const jugador = Array.isArray(r.jugador) ? r.jugador[0] : r.jugador;
          const jugadorId = String(r.jugador_id);
          const rivieraId = rivieraIdMap.get(jugadorId) || "";

          return {
            id: String(r.id),
            coachId: String(r.coach_id),
            coachNombre: String(coach?.nombre ?? "Coach"),
            jugadorId,
            jugadorNombre: String(jugador?.nombre ?? "Jugador"),
            rivieraId,
            status: r.status as CoachingPlayerLink["status"],
            isPrimary: Boolean(r.is_primary),
          };
        });
      }
    }

    return { coaches, links, source: "live" };
  } catch (e) {
    console.warn("[coaching] load fallback demo", e);
    return loadCoachingDemo(organizadorId);
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

  const snapshot = await loadCoachingClubSnapshot(organizadorId);
  const membershipStatus: CoachMembershipStatus =
    res.membershipStatus || (res.isNewUser ? "PENDING" : "ACTIVE");

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
      if (isMissingRelationError(error)) {
        return loadCoachingDemo(organizadorId);
      }
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
      if (isMissingRelationError(error)) {
        return loadCoachingDemo(organizadorId);
      }
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
