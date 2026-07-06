import { supabasePublicRead } from "../supabaseClient";
import {
  attachCareerPuntosToJugador,
  buildJugadorHomeOrgMapFromParticipaciones,
  careerFieldsFromResult,
  computeCareerPointsByClubFromParticipaciones,
} from "./careerPointsByClub";
import { listCareerParticipacionesPublic } from "./publicCareerLinkage";
import {
  enrichParticipacionesOrganizadorFromEvents,
} from "./participacionesOrganizadorScope";
import type { JugadorParticipacion, RivieraJugadorWithStats } from "./types";

/**
 * Enriquece filas del ranking con carrera global por club.
 * NO recalcula stats.puntos_totales — el ranking ordena con jugador_stats de BD.
 */
export async function enrichJugadoresOrganizerScopedStats(
  organizadorId: string,
  jugadores: RivieraJugadorWithStats[]
): Promise<RivieraJugadorWithStats[]> {
  const org = organizadorId.trim();
  if (!org || jugadores.length === 0) return jugadores;

  const nativeIds = jugadores
    .filter((j) => j.organizador_id?.trim() === org && !j.concedidoPorAdmin)
    .map((j) => j.id)
    .filter(Boolean);

  if (nativeIds.length === 0) {
    return Promise.all(
      jugadores.map((j) => attachCareerPuntosToJugador(j))
    );
  }

  const enrichedByJugador = new Map<
    string,
    ReturnType<typeof computeCareerPointsByClubFromParticipaciones>
  >();

  await Promise.all(
    nativeIds.map(async (jid) => {
      let rows = await listCareerParticipacionesPublic(jid, 500);

      if (!rows?.length) {
        const { data, error } = await supabasePublicRead
          .from("jugador_participaciones")
          .select("*")
          .eq("jugador_id", jid)
          .order("fecha", { ascending: false })
          .limit(500);

        if (error) {
          console.warn(
            "[riviera-jugadores] enrichJugadoresOrganizerScopedStats:",
            error
          );
          return;
        }
        rows = (data ?? []) as JugadorParticipacion[];
      }

      if (!rows.length) return;

      const enriched = await enrichParticipacionesOrganizadorFromEvents(rows);
      const homeMap = await buildJugadorHomeOrgMapFromParticipaciones(
        enriched,
        [jid]
      );
      enrichedByJugador.set(
        jid,
        computeCareerPointsByClubFromParticipaciones(enriched, {
          jugadorHomeOrgById: homeMap,
        })
      );
    })
  );

  return Promise.all(
    jugadores.map(async (j) => {
      const homeOrg = j.organizador_id?.trim();
      if (homeOrg === org && !j.concedidoPorAdmin) {
        const career = enrichedByJugador.get(j.id);
        if (!career) return j;
        return {
          ...j,
          ...careerFieldsFromResult(j, career, homeOrg),
        };
      }

      return attachCareerPuntosToJugador(j);
    })
  );
}
