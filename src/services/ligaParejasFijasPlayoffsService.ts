import { supabase } from "../lib/supabaseClient";
import type { LigaEquipo } from "../lib/liga/types";
import {
  PLAYOFFS_MIN_TEAMS,
  PLAYOFFS_MIN_TEAMS_MSG,
  buildPlayoffsRegularFixture,
  expectedRegularMatchCount,
  inferTeamCountFromRegularMatchTotal,
  totalRegularJornadas,
} from "../lib/liga/parejasFijasPlayoffsFixture";
import {
  packPlayoffsJornadaBergerBlocks,
} from "../lib/liga/parejasFijasPlayoffsSchedule";
import {
  buildGranFinalCross,
  buildPlayoffCrosses,
  parsePlayoffSeeds,
  playoffsJornadaNumero,
  seedCount,
  seedsFromRankingOrder,
  type PlayoffSeeds,
} from "../lib/liga/parejasFijasPlayoffsBracket";
import {
  computePlayoffsMatchPoints,
  derivePlayoffsGamesTotals,
  parsePlayoffsSetScoresJson,
  type PlayoffsSetScoresPayload,
} from "../lib/liga/parejasFijasPlayoffsMatchScore";
import {
  applyPlayoffsMatchBothSides,
  emptyEquipoRankingStats,
} from "../lib/liga/parejasFijasPlayoffsRanking";
import {
  compareEquiposRanking,
  diferenciaGamesFromStats,
} from "../lib/liga/equiposRanking";
import {
  findUnresolvedPlayoffsStandingTies,
  type PlayoffsStandingRow,
} from "../lib/liga/parejasFijasPlayoffsStandings";
import {
  fetchEquiposForLiga,
  fetchPlayoffsRegularH2HMatches,
  getRankingEquipos,
  mapLigaEquipo,
  resetPuntosEquiposLiga,
} from "./ligaParejasFijasService";

export function validateEquiposParaPlayoffs(count: number): void {
  if (count < PLAYOFFS_MIN_TEAMS) {
    throw new Error(PLAYOFFS_MIN_TEAMS_MSG);
  }
}

/** Orden estable P1…PN: created_at asc, luego id. */
export function stablePlayoffsEquipoOrder(equipos: LigaEquipo[]): string[] {
  const sorted = [...equipos].sort((a, b) => {
    const c = a.created_at.localeCompare(b.created_at);
    if (c !== 0) return c;
    return a.id.localeCompare(b.id);
  });
  return sorted.map((e) => e.id);
}

export async function insertJornadasForLigaParejasFijasPlayoffs(
  ligaId: string,
  equipos: LigaEquipo[],
  canchasDisponibles: number
): Promise<void> {
  validateEquiposParaPlayoffs(equipos.length);
  const equipoIds = stablePlayoffsEquipoOrder(equipos);
  const equiposById = new Map(equipos.map((e) => [e.id, e]));
  const fixture = buildPlayoffsRegularFixture(equipoIds);
  const canchas = Math.max(1, canchasDisponibles);

  const { data: jornadasRows, error: jErr } = await supabase
    .from("liga_jornadas")
    .insert(
      fixture.jornadas.map((j) => ({
        liga_id: ligaId,
        numero: j.numero,
        estado: "upcoming" as const,
      }))
    )
    .select("id, numero");

  if (jErr) throw new Error(jErr.message);

  const jornadaIdByNumero = new Map<number, string>();
  for (const row of jornadasRows ?? []) {
    jornadaIdByNumero.set(Number(row.numero), String(row.id));
  }

  for (const jornadaPlan of fixture.jornadas) {
    const jornadaId = jornadaIdByNumero.get(jornadaPlan.numero);
    if (!jornadaId) {
      throw new Error(`Jornada ${jornadaPlan.numero} no insertada.`);
    }

    const packed = packPlayoffsJornadaBergerBlocks(
      jornadaPlan.bergerBlocks,
      canchas
    );

    const seenEquipoIds = new Set<string>();
    const equipoIdsEnJornada: string[] = [];
    for (const match of packed) {
      for (const equipoId of [match.equipo1_id, match.equipo2_id]) {
        if (seenEquipoIds.has(equipoId)) continue;
        seenEquipoIds.add(equipoId);
        equipoIdsEnJornada.push(equipoId);
      }
    }

    const { data: parejasRows, error: parejasErr } = await supabase
      .from("liga_jornada_parejas")
      .insert(
        equipoIdsEnJornada.map((equipoId) => {
          const eq = equiposById.get(equipoId);
          if (!eq) throw new Error(`Equipo no encontrado: ${equipoId}`);
          return {
            jornada_id: jornadaId,
            equipo_id: equipoId,
            jugador1_id: eq.jugador1_id,
            jugador2_id: eq.jugador2_id,
          };
        })
      )
      .select("id, equipo_id");

    if (parejasErr) throw new Error(parejasErr.message);

    const parejaIdByEquipo = new Map<string, string>();
    for (const row of parejasRows ?? []) {
      parejaIdByEquipo.set(String(row.equipo_id), String(row.id));
    }

    const partidoRows = packed.map((match) => {
      const p1 = parejaIdByEquipo.get(match.equipo1_id);
      const p2 = parejaIdByEquipo.get(match.equipo2_id);
      if (!p1 || !p2) {
        throw new Error("Pareja de jornada no encontrada para partido playoffs.");
      }
      return {
        jornada_id: jornadaId,
        liga_id: ligaId,
        pareja1_id: p1,
        pareja2_id: p2,
        ronda: match.ronda,
        cancha: match.cancha,
        estado: "upcoming" as const,
        score_pareja1: null,
        score_pareja2: null,
        fase: "regular",
        bracket_slot: null,
      };
    });

    if (partidoRows.length > 0) {
      const { error: insErr } = await supabase
        .from("liga_partidos")
        .insert(partidoRows);
      if (insErr) throw new Error(insErr.message);
    }
  }
}

export async function recalcularPuntosLigaEquiposPlayoffs(
  ligaId: string
): Promise<void> {
  await resetPuntosEquiposLiga(ligaId);

  const { data: equipos, error: eErr } = await supabase
    .from("liga_equipos")
    .select("id")
    .eq("liga_id", ligaId);

  if (eErr) throw new Error(eErr.message);

  const statsByEquipo = new Map(
    (equipos ?? []).map((e) => [String(e.id), emptyEquipoRankingStats()])
  );

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

      const score1 =
        m.score_pareja1 != null ? Number(m.score_pareja1) : NaN;
      const score2 =
        m.score_pareja2 != null ? Number(m.score_pareja2) : NaN;
      const payload = parsePlayoffsSetScoresJson(m.set_scores);
      if (!payload || !Number.isFinite(score1) || !Number.isFinite(score2)) {
        continue;
      }
      const derived = derivePlayoffsGamesTotals(payload, score1, score2);
      if ("error" in derived) continue;
      const games1 = derived.gamesTotalP1;
      const games2 = derived.gamesTotalP2;
      const computed = computePlayoffsMatchPoints(games1, games2, payload);
      if (!computed.ok) continue;

      const st1 = statsByEquipo.get(eq1) ?? emptyEquipoRankingStats();
      const st2 = statsByEquipo.get(eq2) ?? emptyEquipoRankingStats();
      applyPlayoffsMatchBothSides(st1, st2, games1, games2, computed.result);
      statsByEquipo.set(eq1, st1);
      statsByEquipo.set(eq2, st2);
    }

    if (jornadaCompleta) {
      await supabase
        .from("liga_jornadas")
        .update({ estado: "completed", puntos_aplicados: true })
        .eq("id", jornadaId);
    }
  }

  for (const [equipoId, st] of Array.from(statsByEquipo.entries())) {
    const dif = diferenciaGamesFromStats(st);
    const { error: upErr } = await supabase
      .from("liga_equipos")
      .update({
        puntos: st.puntos,
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

async function countRegularMatches(
  ligaId: string,
  onlyCompleted: boolean
): Promise<number> {
  let q = supabase
    .from("liga_partidos")
    .select("id", { count: "exact", head: true })
    .eq("liga_id", ligaId)
    .eq("fase", "regular");
  if (onlyCompleted) {
    q = q.eq("estado", "completed");
  }
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function countCompletedRegularMatches(ligaId: string): Promise<number> {
  return countRegularMatches(ligaId, true);
}

export async function maybeFreezeAndGeneratePlayoffsJornada9(
  ligaId: string
): Promise<boolean> {
  const { data: liga, error } = await supabase
    .from("ligas")
    .select("playoff_seeds, canchas_disponibles, modalidad")
    .eq("id", ligaId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!liga || liga.modalidad !== "parejas_fijas_playoffs") return false;

  // N sale del calendario regular (fase='regular'), no de SF/CL/FINAL.
  const totalRegular = await countRegularMatches(ligaId, false);
  const nFromCalendar = inferTeamCountFromRegularMatchTotal(totalRegular);
  if (nFromCalendar == null) return false;

  const equipos = await fetchEquiposForLiga(ligaId);
  if (equipos.length !== nFromCalendar) {
    throw new Error(
      `Calendario regular implica ${nFromCalendar} parejas, pero hay ${equipos.length} inscritas.`
    );
  }
  const n = nFromCalendar;
  if (n < PLAYOFFS_MIN_TEAMS) return false;

  const expected = expectedRegularMatchCount(n);
  if (totalRegular !== expected) return false;

  const completed = await countCompletedRegularMatches(ligaId);
  if (completed !== expected) return false;

  let seeds = parsePlayoffSeeds(liga.playoff_seeds);
  if (!seeds) {
    await recalcularPuntosLigaEquiposPlayoffs(ligaId);
    const ranking = await getRankingEquipos(ligaId);
    if (ranking.length !== n) {
      throw new Error(
        `Se requieren ${n} equipos en la tabla para playoffs.`
      );
    }
    const headToHeadMatches = await fetchPlayoffsRegularH2HMatches(ligaId);
    const standingRows: PlayoffsStandingRow[] = ranking.map((r) => ({
      equipo_id: r.equipo_id,
      puntos: r.puntos,
      diferencia_games: r.diferencia_games,
      games_favor: r.games_favor,
      partidos_ganados: r.partidos_ganados,
      partidos_jugados: r.partidos_jugados,
      nombre: r.nombre,
    }));
    const unresolved = findUnresolvedPlayoffsStandingTies(standingRows, {
      headToHeadMatches,
    });
    if (unresolved.length > 0) {
      const sample = unresolved
        .slice(0, 3)
        .map((t) => `${t.a}/${t.b}`)
        .join(", ");
      throw new Error(
        `Empate absoluto en tabla (PTS + DIF + enfrentamiento directo) entre parejas: ${sample}. No hay 4.º criterio deportivo aprobado para congelar seeds.`
      );
    }
    seeds = seedsFromRankingOrder(ranking.map((r) => r.equipo_id));
  }

  if (seedCount(seeds) !== n) {
    throw new Error("playoff_seeds no coincide con el número de parejas.");
  }

  const { crosses } = buildPlayoffCrosses(seeds);
  const sf1 = crosses.find((c) => c.slot === "SF1")!;
  const sf2 = crosses.find((c) => c.slot === "SF2")!;
  const cl1 = crosses.find((c) => c.slot === "CL1");
  const cl2 = crosses.find((c) => c.slot === "CL2");
  // Firma RPC estable: CL1/CL2 opcionales (ignorados en SQL; derivados de seeds).
  const placeholder = sf1.equipo1_id;

  const { data, error: rpcErr } = await supabase.rpc(
    "liga_playoffs_freeze_and_generate_jornada9",
    {
      p_liga_id: ligaId,
      p_seeds: seeds,
      p_sf1_p1: sf1.equipo1_id,
      p_sf1_p2: sf1.equipo2_id,
      p_sf2_p1: sf2.equipo1_id,
      p_sf2_p2: sf2.equipo2_id,
      p_cl1_p1: cl1?.equipo1_id ?? placeholder,
      p_cl1_p2: cl1?.equipo2_id ?? placeholder,
      p_cl2_p1: cl2?.equipo1_id ?? placeholder,
      p_cl2_p2: cl2?.equipo2_id ?? placeholder,
      p_canchas: Number(liga.canchas_disponibles ?? 3),
    }
  );

  if (rpcErr) throw new Error(rpcErr.message);
  if (data && typeof data === "object" && (data as { ok?: boolean }).ok === false) {
    throw new Error(
      String((data as { error?: string }).error ?? "No se pudieron generar playoffs")
    );
  }
  return true;
}

async function resolveEquipoIdFromPareja(
  jornadaId: string,
  parejaId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("liga_jornada_parejas")
    .select("equipo_id")
    .eq("jornada_id", jornadaId)
    .eq("id", parejaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.equipo_id ? String(data.equipo_id) : null;
}

export async function ensurePlayoffsGranFinal(ligaId: string): Promise<boolean> {
  const { data: existing } = await supabase
    .from("liga_partidos")
    .select("id")
    .eq("liga_id", ligaId)
    .eq("bracket_slot", "FINAL")
    .maybeSingle();

  if (existing) return false;

  const { data: sfRows, error } = await supabase
    .from("liga_partidos")
    .select(
      "id, jornada_id, bracket_slot, pareja1_id, pareja2_id, score_pareja1, score_pareja2, set_scores, estado"
    )
    .eq("liga_id", ligaId)
    .in("bracket_slot", ["SF1", "SF2"]);

  if (error) throw new Error(error.message);
  if (!sfRows || sfRows.length < 2) return false;
  if (!sfRows.every((r) => r.estado === "completed")) return false;

  const winners: string[] = [];
  for (const slot of ["SF1", "SF2"] as const) {
    const row = sfRows.find((r) => r.bracket_slot === slot);
    if (!row) return false;
    const payload = parsePlayoffsSetScoresJson(row.set_scores);
    const s1 = Number(row.score_pareja1);
    const s2 = Number(row.score_pareja2);
    if (!payload || !Number.isFinite(s1) || !Number.isFinite(s2)) return false;
    const pts = computePlayoffsMatchPoints(s1, s2, payload);
    if (!pts.ok) return false;
    const eq1 = await resolveEquipoIdFromPareja(
      String(row.jornada_id),
      String(row.pareja1_id)
    );
    const eq2 = await resolveEquipoIdFromPareja(
      String(row.jornada_id),
      String(row.pareja2_id)
    );
    if (!eq1 || !eq2) return false;
    winners.push(pts.result.p1Won ? eq1 : eq2);
  }

  const cross = buildGranFinalCross(winners[0]!, winners[1]!);
  const equipos = await fetchEquiposForLiga(ligaId);
  const byId = new Map(equipos.map((e) => [e.id, e]));
  const finalNumero = playoffsJornadaNumero(
    totalRegularJornadas(equipos.length),
    "final"
  );

  let jornadaId: string | null = null;
  const { data: jFinal } = await supabase
    .from("liga_jornadas")
    .select("id")
    .eq("liga_id", ligaId)
    .eq("numero", finalNumero)
    .maybeSingle();

  if (jFinal?.id) {
    jornadaId = String(jFinal.id);
  } else {
    const { data: created, error: jErr } = await supabase
      .from("liga_jornadas")
      .insert({ liga_id: ligaId, numero: finalNumero, estado: "upcoming" })
      .select("id")
      .single();
    if (jErr) throw new Error(jErr.message);
    jornadaId = String(created.id);
  }

  const parejaIds: string[] = [];
  for (const eqId of [cross.equipo1_id, cross.equipo2_id]) {
    const eq = byId.get(eqId);
    if (!eq) throw new Error("Equipo de final no encontrado.");
    const { data: existingPareja } = await supabase
      .from("liga_jornada_parejas")
      .select("id")
      .eq("jornada_id", jornadaId)
      .eq("equipo_id", eqId)
      .maybeSingle();
    if (existingPareja?.id) {
      parejaIds.push(String(existingPareja.id));
      continue;
    }
    const { data: ins, error: pErr } = await supabase
      .from("liga_jornada_parejas")
      .insert({
        jornada_id: jornadaId,
        equipo_id: eqId,
        jugador1_id: eq.jugador1_id,
        jugador2_id: eq.jugador2_id,
      })
      .select("id")
      .single();
    if (pErr) throw new Error(pErr.message);
    parejaIds.push(String(ins.id));
  }

  const { error: insErr } = await supabase.from("liga_partidos").insert({
    jornada_id: jornadaId,
    liga_id: ligaId,
    pareja1_id: parejaIds[0],
    pareja2_id: parejaIds[1],
    ronda: 1,
    cancha: 1,
    estado: "upcoming",
    score_pareja1: null,
    score_pareja2: null,
    fase: "final",
    bracket_slot: "FINAL",
  });

  if (insErr) {
    // Unique violation = already created (idempotent)
    if (
      insErr.message.includes("liga_partidos_liga_bracket_slot") ||
      insErr.code === "23505"
    ) {
      return false;
    }
    throw new Error(insErr.message);
  }
  return true;
}

export async function updateScoreParejasFijasPlayoffs(
  partidoId: string,
  score1: number,
  score2: number,
  payload: PlayoffsSetScoresPayload,
  options?: { force?: boolean }
): Promise<{
  ok: boolean;
  status?: string;
  error?: string;
  jornada_id?: string;
}> {
  const derived = derivePlayoffsGamesTotals(payload, score1, score2);
  if ("error" in derived) {
    return { ok: false, error: derived.error };
  }
  const games1 = derived.gamesTotalP1;
  const games2 = derived.gamesTotalP2;
  const computed = computePlayoffsMatchPoints(games1, games2, payload);
  if (!computed.ok) {
    return { ok: false, error: computed.error };
  }

  const { data, error } = await supabase.rpc(
    "update_liga_partido_score_parejas_fijas_playoffs",
    {
      p_partido_id: partidoId,
      p_score1: games1,
      p_score2: games2,
      p_set_scores: payload,
      p_force: options?.force ?? false,
    }
  );

  if (error) throw new Error(error.message);
  const result = data as {
    ok?: boolean;
    status?: string;
    error?: string;
    jornada_id?: string;
  };

  if (!result?.ok) {
    return {
      ok: false,
      error: result?.error ?? "No se pudo guardar el marcador",
      status: result?.status,
    };
  }

  const { data: partido } = await supabase
    .from("liga_partidos")
    .select("liga_id, bracket_slot, jornada_id")
    .eq("id", partidoId)
    .maybeSingle();

  let ligaId = partido?.liga_id ? String(partido.liga_id) : null;
  if (!ligaId && partido?.jornada_id) {
    const { data: j } = await supabase
      .from("liga_jornadas")
      .select("liga_id")
      .eq("id", partido.jornada_id)
      .maybeSingle();
    ligaId = j?.liga_id ? String(j.liga_id) : null;
  }
  if (ligaId) {
    await recalcularPuntosLigaEquiposPlayoffs(ligaId);
    await maybeFreezeAndGeneratePlayoffsJornada9(ligaId);
    if (
      partido?.bracket_slot === "SF1" ||
      partido?.bracket_slot === "SF2"
    ) {
      await ensurePlayoffsGranFinal(ligaId);
    }
  }

  return {
    ok: true,
    status: result.status,
    jornada_id: result.jornada_id,
  };
}

export async function clearPlayoffSeeds(ligaId: string): Promise<void> {
  await supabase
    .from("ligas")
    .update({ playoff_seeds: null, playoff_seeded_at: null })
    .eq("id", ligaId);
}

export type { PlayoffSeeds };
export { mapLigaEquipo, compareEquiposRanking };
