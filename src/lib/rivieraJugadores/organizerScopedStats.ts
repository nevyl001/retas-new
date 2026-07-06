import { supabase } from "../supabaseClient";
import {
  buildMulticlubGranteePuntosFromParticipaciones,
} from "./nativeMulticlubHomeView";
import {
  enrichParticipacionesOrganizadorFromEvents,
} from "./participacionesOrganizadorScope";
import type { JugadorParticipacion, RivieraJugadorWithStats } from "./types";

/**
 * Enriquece filas del ranking con líneas multiclub para display.
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

  if (nativeIds.length === 0) return jugadores;

  const { data, error } = await supabase
    .from("jugador_participaciones")
    .select("*")
    .in("jugador_id", nativeIds)
    .order("fecha", { ascending: false })
    .limit(Math.min(nativeIds.length * 200, 5000));

  if (error) {
    console.warn("[riviera-jugadores] enrichJugadoresOrganizerScopedStats:", error);
    return jugadores;
  }

  const rawByJugador = new Map<string, JugadorParticipacion[]>();
  for (const raw of data ?? []) {
    const row = raw as JugadorParticipacion;
    const list = rawByJugador.get(row.jugador_id) ?? [];
    list.push(row);
    rawByJugador.set(row.jugador_id, list);
  }

  const enrichedByJugador = new Map<string, JugadorParticipacion[]>();
  await Promise.all(
    Array.from(rawByJugador.entries()).map(async ([jid, rows]) => {
      enrichedByJugador.set(jid, await enrichParticipacionesOrganizadorFromEvents(rows));
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
