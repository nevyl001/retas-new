import { supabasePublicRead } from "../supabaseClient";
import {
  buildMulticlubGranteePuntosFromParticipaciones,
} from "./nativeMulticlubHomeView";
import {
  enrichParticipacionesOrganizadorFromEvents,
} from "./participacionesOrganizadorScope";
import { listCareerParticipacionesPublic } from "./publicCareerLinkage";
import type { JugadorParticipacion, RivieraJugadorWithStats } from "./types";

/**
 * Enriquece filas del ranking con líneas multiclub para display.
 * NO recalcula stats.puntos_totales — el ranking ordena con jugador_stats de BD.
 * Usa RPC de carrera pública para que anon vea el mismo desglose que authenticated.
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

  if (nativeIds.length === 0) return jugadores;

  const enrichedByJugador = new Map<string, JugadorParticipacion[]>();

  await Promise.all(
    nativeIds.map(async (jid) => {
      let rows: JugadorParticipacion[] | null =
        await listCareerParticipacionesPublic(jid, 200);

      if (!rows) {
        const { data, error } = await supabasePublicRead
          .from("jugador_participaciones")
          .select("*")
          .eq("jugador_id", jid)
          .order("fecha", { ascending: false })
          .limit(200);

        if (error) {
          console.warn(
            "[riviera-jugadores] enrichJugadoresOrganizerScopedStats:",
            error
          );
          return;
        }
        rows = (data ?? []) as JugadorParticipacion[];
      }

      if (rows.length === 0) return;

      enrichedByJugador.set(
        jid,
        await enrichParticipacionesOrganizadorFromEvents(rows)
      );
    })
  );

  return jugadores.map((j) => {
    const homeOrg = j.organizador_id?.trim();
    if (homeOrg !== org || j.concedidoPorAdmin) return j;

    const rows = enrichedByJugador.get(j.id) ?? [];
    const multiclubGranteePuntos = buildMulticlubGranteePuntosFromParticipaciones(
      j.id,
      rows,
      homeOrg
    );
    if (multiclubGranteePuntos.length === 0) return j;

    const homePts = j.stats?.puntos_totales ?? 0;
    const granteePts = multiclubGranteePuntos.reduce(
      (sum, g) => sum + g.puntosTotales,
      0
    );

    return {
      ...j,
      multiclubGranteePuntos,
      officialPuntosGlobal: homePts + granteePts,
    };
  });
}
