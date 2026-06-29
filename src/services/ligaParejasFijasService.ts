import { supabase } from "../lib/supabaseClient";
import type {
  CreateLigaEquipoInput,
  LigaEquipo,
  LigaEquipoRankingItem,
  LigaJugador,
  LigaVueltas,
} from "../lib/liga/types";
import { validateEquiposParaCalendario } from "../lib/liga/calendario";
import { buildFixedPairLeagueSchedule } from "../lib/liga/fixedPairSchedule";
import {
  applyPartidoToEquipoRankingStats,
  compareEquiposRanking,
  diferenciaGamesFromStats,
  emptyEquipoRankingStats,
  type EquipoRankingStats,
} from "../lib/liga/equiposRanking";
import {
  parseSetScoresJson,
  resolveParejasFijasPartidoTotals,
} from "../lib/liga/parejasFijasMatchScore";

function mapJugador(row: Record<string, unknown>): LigaJugador {
  return {
    id: String(row.id),
    nombre: String(row.nombre),
    email: row.email ? String(row.email) : null,
    telefono: row.telefono ? String(row.telefono) : null,
    genero: (row.genero as LigaJugador["genero"]) ?? null,
    nivel: row.nivel != null ? Number(row.nivel) : null,
    estado: row.estado as LigaJugador["estado"],
    organizador_id: row.organizador_id ? String(row.organizador_id) : null,
    created_at: String(row.created_at),
  };
}

export function mapLigaEquipo(row: Record<string, unknown>): LigaEquipo {
  const j1 = row.jugador1 as Record<string, unknown> | null | undefined;
  const j2 = row.jugador2 as Record<string, unknown> | null | undefined;
  return {
    id: String(row.id),
    liga_id: String(row.liga_id),
    nombre: row.nombre ? String(row.nombre) : null,
    jugador1_id: String(row.jugador1_id),
    jugador2_id: String(row.jugador2_id),
    puntos: Number(row.puntos ?? 0),
    partidos_jugados: Number(row.partidos_jugados ?? 0),
    partidos_ganados: Number(row.partidos_ganados ?? 0),
    partidos_perdidos: Number(row.partidos_perdidos ?? 0),
    games_favor: Number(row.games_favor ?? 0),
    games_contra: Number(row.games_contra ?? 0),
    diferencia_games: Number(row.diferencia_games ?? 0),
    created_at: String(row.created_at),
    ...(j1 ? { jugador1: mapJugador(j1) } : {}),
    ...(j2 ? { jugador2: mapJugador(j2) } : {}),
  };
}

export async function fetchEquiposForLiga(ligaId: string): Promise<LigaEquipo[]> {
  const { data, error } = await supabase
    .from("liga_equipos")
    .select("*, jugador1:liga_jugadores!liga_equipos_jugador1_id_fkey(*), jugador2:liga_jugadores!liga_equipos_jugador2_id_fkey(*)")
    .eq("liga_id", ligaId)
    .order("created_at", { ascending: true });

  if (error) {
    const { data: plain, error: plainErr } = await supabase
      .from("liga_equipos")
      .select("*")
      .eq("liga_id", ligaId)
      .order("created_at", { ascending: true });
    if (plainErr) throw new Error(plainErr.message);
    return (plain ?? []).map((r) => mapLigaEquipo(r as Record<string, unknown>));
  }

  return (data ?? []).map((r) => mapLigaEquipo(r as Record<string, unknown>));
}

export async function createEquipoLiga(
  ligaId: string,
  input: CreateLigaEquipoInput
): Promise<LigaEquipo> {
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    throw new Error("Debes iniciar sesión para gestionar ligas.");
  }
  const organizadorId = user.id;

  const { data: liga, error: lErr } = await supabase
    .from("ligas")
    .select("organizador_id")
    .eq("id", ligaId)
    .maybeSingle();

  if (lErr) throw new Error(lErr.message);
  if (!liga || liga.organizador_id !== organizadorId) {
    throw new Error("No tienes permiso para editar esta liga.");
  }

  if (input.jugador1_id === input.jugador2_id) {
    throw new Error("Los dos jugadores deben ser distintos.");
  }

  const { assertLigaJugadoresDelOrganizador, loadOrganizadorLigaJugadoresPool } =
    await import("../lib/rivieraJugadores/playerPoolSync");
  await assertLigaJugadoresDelOrganizador(organizadorId, [
    input.jugador1_id,
    input.jugador2_id,
  ]);

  const pool = await loadOrganizadorLigaJugadoresPool(organizadorId);
  const j1 = pool.find((j) => j.id === input.jugador1_id);
  const j2 = pool.find((j) => j.id === input.jugador2_id);
  if (!j1 || !j2) {
    throw new Error("Jugador no válido para tu registro.");
  }

  const existing = await fetchEquiposForLiga(ligaId);
  const used = new Set<string>();
  for (const e of existing) {
    used.add(e.jugador1_id);
    used.add(e.jugador2_id);
  }
  if (used.has(input.jugador1_id) || used.has(input.jugador2_id)) {
    throw new Error("Un jugador no puede estar en dos parejas de la misma liga.");
  }

  const nombre =
    input.nombre?.trim() || `${j1.nombre} / ${j2.nombre}`;

  const { data, error } = await supabase
    .from("liga_equipos")
    .insert({
      liga_id: ligaId,
      nombre,
      jugador1_id: input.jugador1_id,
      jugador2_id: input.jugador2_id,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapLigaEquipo({
    ...(data as Record<string, unknown>),
    jugador1: j1,
    jugador2: j2,
  });
}

export async function deleteEquipoLiga(equipoId: string): Promise<void> {
  const { error } = await supabase
    .from("liga_equipos")
    .delete()
    .eq("id", equipoId);
  if (error) throw new Error(error.message);
}

export async function resetPuntosEquiposLiga(ligaId: string): Promise<void> {
  const { error } = await supabase
    .from("liga_equipos")
    .update({
      puntos: 0,
      partidos_jugados: 0,
      partidos_ganados: 0,
      partidos_perdidos: 0,
      games_favor: 0,
      games_contra: 0,
      diferencia_games: 0,
    })
    .eq("liga_id", ligaId);
  if (error) throw new Error(error.message);
}

type EquipoStats = EquipoRankingStats;

function emptyEquipoStats(): EquipoStats {
  return emptyEquipoRankingStats();
}

function applyPartidoToEquipoStats(
  stats: EquipoStats,
  gamesFor: number,
  gamesAgainst: number,
  matchWon: boolean
): void {
  applyPartidoToEquipoRankingStats(stats, gamesFor, gamesAgainst, matchWon);
}

export async function insertJornadasForLigaParejasFijas(
  ligaId: string,
  equipos: LigaEquipo[],
  vueltas: LigaVueltas,
  canchasDisponibles: number
): Promise<void> {
  validateEquiposParaCalendario(equipos.length);
  const equipoIds = equipos.map((e) => e.id);
  const equiposById = new Map(equipos.map((e) => [e.id, e]));
  const schedule = buildFixedPairLeagueSchedule(equipoIds, vueltas);
  const canchas = Math.max(1, canchasDisponibles);

  for (const jornadaPlan of schedule) {
    const { data: jornada, error: jErr } = await supabase
      .from("liga_jornadas")
      .insert({
        liga_id: ligaId,
        numero: jornadaPlan.numero,
        estado: "upcoming",
      })
      .select("id")
      .single();

    if (jErr) throw new Error(jErr.message);
    const jornadaId = String(jornada.id);

    const parejaIdByEquipo = new Map<string, string>();

    const ensureJornadaPareja = async (equipoId: string): Promise<string> => {
      const cached = parejaIdByEquipo.get(equipoId);
      if (cached) return cached;
      const eq = equiposById.get(equipoId);
      if (!eq) throw new Error(`Equipo no encontrado: ${equipoId}`);

      const { data: row, error } = await supabase
        .from("liga_jornada_parejas")
        .insert({
          jornada_id: jornadaId,
          equipo_id: equipoId,
          jugador1_id: eq.jugador1_id,
          jugador2_id: eq.jugador2_id,
        })
        .select("id")
        .single();

      if (error) throw new Error(error.message);
      const pid = String(row.id);
      parejaIdByEquipo.set(equipoId, pid);
      return pid;
    };

    const partidoRows: Array<{
      jornada_id: string;
      pareja1_id: string;
      pareja2_id: string;
      ronda: number;
      cancha: number;
      estado: "upcoming";
      score_pareja1: null;
      score_pareja2: null;
    }> = [];

    let canchaSlot = 0;
    for (const match of jornadaPlan.matches) {
      const p1 = await ensureJornadaPareja(match.equipo1_id);
      const p2 = await ensureJornadaPareja(match.equipo2_id);
      canchaSlot += 1;
      partidoRows.push({
        jornada_id: jornadaId,
        pareja1_id: p1,
        pareja2_id: p2,
        ronda: 1,
        cancha: ((canchaSlot - 1) % canchas) + 1,
        estado: "upcoming",
        score_pareja1: null,
        score_pareja2: null,
      });
    }

    if (partidoRows.length > 0) {
      const { error: insErr } = await supabase
        .from("liga_partidos")
        .insert(partidoRows);
      if (insErr) throw new Error(insErr.message);
    }
  }
}

export async function recalcularPuntosLigaEquipos(ligaId: string): Promise<void> {
  await resetPuntosEquiposLiga(ligaId);

  const { data: equipos, error: eErr } = await supabase
    .from("liga_equipos")
    .select("id")
    .eq("liga_id", ligaId);

  if (eErr) throw new Error(eErr.message);

  const statsByEquipo = new Map<string, EquipoStats>();
  for (const e of equipos ?? []) {
    statsByEquipo.set(String(e.id), emptyEquipoStats());
  }

  const { data: jornadas, error: jErr } = await supabase
    .from("liga_jornadas")
    .select("id")
    .eq("liga_id", ligaId)
    .order("numero", { ascending: true });

  if (jErr) throw new Error(jErr.message);

  for (const j of jornadas ?? []) {
    const jornadaId = String(j.id);

    const { data: partidos, error: pErr } = await supabase
      .from("liga_partidos")
      .select(
        "score_pareja1, score_pareja2, set_scores, pareja1_id, pareja2_id, estado"
      )
      .eq("jornada_id", jornadaId);

    if (pErr) throw new Error(pErr.message);

    const lista = partidos ?? [];
    const jornadaCompleta =
      lista.length > 0 && lista.every((p) => p.estado === "completed");

    if (!jornadaCompleta) {
      const { error: flagErr } = await supabase
        .from("liga_jornadas")
        .update({ puntos_aplicados: false })
        .eq("id", jornadaId);
      if (
        flagErr &&
        !flagErr.message.includes("puntos_aplicados") &&
        !flagErr.message.includes("column")
      ) {
        throw new Error(flagErr.message);
      }
      continue;
    }

    const { data: parejas, error: parErr } = await supabase
      .from("liga_jornada_parejas")
      .select("id, equipo_id")
      .eq("jornada_id", jornadaId);

    if (parErr) throw new Error(parErr.message);

    const equipoByParejaId = new Map<string, string>();
    for (const p of parejas ?? []) {
      if (p.equipo_id) {
        equipoByParejaId.set(String(p.id), String(p.equipo_id));
      }
    }

    for (const m of lista) {
      if (m.estado !== "completed") continue;
      const eq1 = equipoByParejaId.get(String(m.pareja1_id));
      const eq2 = equipoByParejaId.get(String(m.pareja2_id));
      if (!eq1 || !eq2) continue;

      const totals = resolveParejasFijasPartidoTotals({
        score_pareja1:
          m.score_pareja1 != null ? Number(m.score_pareja1) : null,
        score_pareja2:
          m.score_pareja2 != null ? Number(m.score_pareja2) : null,
        set_scores: parseSetScoresJson(m.set_scores),
      });
      if (!totals) continue;

      const st1 = statsByEquipo.get(eq1) ?? emptyEquipoStats();
      const st2 = statsByEquipo.get(eq2) ?? emptyEquipoStats();
      applyPartidoToEquipoStats(
        st1,
        totals.gamesP1,
        totals.gamesP2,
        totals.p1WonMatch
      );
      applyPartidoToEquipoStats(
        st2,
        totals.gamesP2,
        totals.gamesP1,
        !totals.p1WonMatch
      );
      statsByEquipo.set(eq1, st1);
      statsByEquipo.set(eq2, st2);
    }

    const patch: { estado: string; puntos_aplicados?: boolean } = {
      estado: "completed",
      puntos_aplicados: true,
    };
    const { error: jUpErr } = await supabase
      .from("liga_jornadas")
      .update(patch)
      .eq("id", jornadaId);

    if (jUpErr?.message?.includes("puntos_aplicados")) {
      const { error: fallback } = await supabase
        .from("liga_jornadas")
        .update({ estado: "completed" })
        .eq("id", jornadaId);
      if (fallback) throw new Error(fallback.message);
    } else if (jUpErr) {
      throw new Error(jUpErr.message);
    }
  }

  for (const [equipoId, st] of Array.from(statsByEquipo.entries())) {
    const dif = diferenciaGamesFromStats(st);
    const { error: upErr } = await supabase
      .from("liga_equipos")
      .update({
        puntos: st.games_favor,
        partidos_jugados: st.partidos_jugados,
        partidos_ganados: st.partidos_ganados,
        partidos_perdidos: st.partidos_perdidos,
        games_favor: st.games_favor,
        games_contra: st.games_contra,
        diferencia_games: dif,
      })
      .eq("id", equipoId);

    if (upErr) throw new Error(upErr.message);
  }
}

export async function getRankingEquipos(
  ligaId: string
): Promise<LigaEquipoRankingItem[]> {
  const { data, error } = await supabase
    .from("liga_equipos")
    .select("*")
    .eq("liga_id", ligaId);

  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((r) => mapLigaEquipo(r as Record<string, unknown>));

  rows.sort((a, b) =>
    compareEquiposRanking(
      {
        puntos: a.puntos,
        diferencia_games: a.diferencia_games,
        games_favor: a.games_favor,
        partidos_ganados: a.partidos_ganados,
        partidos_jugados: a.partidos_jugados,
        nombre: a.nombre,
      },
      {
        puntos: b.puntos,
        diferencia_games: b.diferencia_games,
        games_favor: b.games_favor,
        partidos_ganados: b.partidos_ganados,
        partidos_jugados: b.partidos_jugados,
        nombre: b.nombre,
      }
    )
  );

  return rows.map((row, index) => ({
    posicion: index + 1,
    equipo_id: row.id,
    nombre:
      row.nombre?.trim() ||
      `${row.jugador1?.nombre ?? "?"} / ${row.jugador2?.nombre ?? "?"}`,
    puntos: row.puntos,
    partidos_jugados: row.partidos_jugados,
    partidos_ganados: row.partidos_ganados,
    partidos_perdidos: row.partidos_perdidos,
    games_favor: row.games_favor,
    games_contra: row.games_contra,
    diferencia_games: row.diferencia_games,
  }));
}
