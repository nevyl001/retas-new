import { supabase } from "../supabaseClient";
import {
  normalizeRivieraIdInput,
  resolvePlayerByRivieraId,
} from "../rivieraJugadores/playerMembership";
import type { RivieraJugadorCategoria } from "../rivieraJugadores/types";
import {
  addDemoCoach,
  addDemoPlayerLinkByRivieraId,
  loadCoachingDemo,
  setDemoLinkStatus,
} from "./demoStore";
import type {
  CoachingClubSnapshot,
  CoachingPlayerLink,
  CreateCoachInput,
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

/**
 * Carga el snapshot del club.
 * Si aún no hay tablas/RLS listos, usa el store demo para recorrer la UX.
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
      .eq("organizador_id", organizadorId)
      .eq("status", "ACTIVE");

    if (error) {
      if (isMissingRelationError(error)) {
        return loadCoachingDemo(organizadorId);
      }
      console.warn("[coaching] memberships fallback demo", error.message);
      return loadCoachingDemo(organizadorId);
    }

    if (!memberships || memberships.length === 0) {
      return loadCoachingDemo(organizadorId);
    }

    const coaches = memberships
      .map((row) => {
        const coach = Array.isArray(row.coach) ? row.coach[0] : row.coach;
        if (!coach) return null;
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
          membershipStatus: "ACTIVE" as const,
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
          jugador:riviera_jugadores ( nombre, riviera_id )
        `
        )
        .eq("organizador_id", organizadorId)
        .in("coach_id", coachIds)
        .neq("status", "ENDED");

      if (!relError && rels) {
        links = rels.map((r) => {
          const coach = Array.isArray(r.coach) ? r.coach[0] : r.coach;
          const jugador = Array.isArray(r.jugador) ? r.jugador[0] : r.jugador;
          return {
            id: String(r.id),
            coachId: String(r.coach_id),
            coachNombre: String(coach?.nombre ?? "Coach"),
            jugadorId: String(r.jugador_id),
            jugadorNombre: String(jugador?.nombre ?? "Jugador"),
            rivieraId: String(jugador?.riviera_id ?? ""),
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

export async function createClubCoachDemo(
  organizadorId: string,
  input: CreateCoachInput
): Promise<CoachingClubSnapshot> {
  // Invitación real (auth + RIV-C) llega en Edge Function; por ahora demo UX.
  return addDemoCoach(organizadorId, input);
}

/**
 * Vincula un jugador al coach por Riviera ID exacto.
 * Resuelve identidad real; en demo, si no existe, crea vínculo local con ese ID.
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

  let jugadorId = `demo_${rivieraId}`;
  let jugadorNombre = `Jugador ${rivieraId}`;

  try {
    const resolved = await resolvePlayerByRivieraId(rivieraId);
    if (resolved?.found) {
      jugadorId =
        resolved.localJugadorId ||
        resolved.membershipId ||
        `resolved_${rivieraId}`;
      jugadorNombre = resolved.displayName?.trim() || jugadorNombre;
    }
  } catch (e) {
    console.warn("[coaching] resolve Riviera ID fallback demo", e);
  }

  return addDemoPlayerLinkByRivieraId(organizadorId, coachId, {
    rivieraId,
    jugadorId,
    jugadorNombre,
  });
}

export async function updateLinkStatusDemo(
  organizadorId: string,
  linkId: string,
  status: CoachingPlayerLink["status"]
): Promise<CoachingClubSnapshot> {
  return setDemoLinkStatus(organizadorId, linkId, status);
}
