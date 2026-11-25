import { supabase } from "../lib/supabaseClient";
import {
  FLEX_DEFAULT_CATEGORIA,
  FLEX_DEFAULT_INSCRIPCION_MXN,
  FLEX_DEFAULT_JORNADA_MXN,
  FLEX_DEFAULT_JORNADAS,
  FLEX_DEFAULT_PREMIO_CAMPEON,
  FLEX_DEFAULT_PREMIO_SUBCAMPEON,
  FLEX_DEFAULT_PREMIO_TERCER,
  FLEX_DEFAULT_REST_MINUTES,
  FLEX_DEFAULT_ROUND_MINUTES,
  FLEX_DEFAULT_ROUNDS,
} from "../lib/liga/flex/constants";
import { assertFlexFinalJornada, resizeFlexSeason } from "../lib/liga/flex/season";
import type { FlexSchedule, FlexScheduleQuality } from "../lib/liga/flex/schedule";
import { assertLigaJugadoresDelOrganizador } from "../lib/rivieraJugadores/playerPoolSync";

export type FlexLeagueCreateOptions = {
  jornadas?: number;
  categoria?: string;
  horario?: string;
  inscripcionTemporadaMxn?: number | null;
  participacionJornadaMxn?: number | null;
  premioCampeon?: string;
  premioSubcampeon?: string;
  premioTercer?: string;
  canchas?: number;
};

export type FlexConfigRow = {
  ligaId: string;
  jornadasPlaneadas: number;
  jugadoresMin: number;
  jugadoresMax: number;
  rondasSugeridas: number;
  duracionRondaMin: number;
  descansoMin: number;
  categoria: string | null;
  horarioSugerido: string | null;
  inscripcionTemporadaMxn: number | null;
  participacionJornadaMxn: number | null;
  premioCampeon: string | null;
  premioSubcampeon: string | null;
  premioTercer: string | null;
  jornadaFinalId: string | null;
  cerradoAt: string | null;
};

export type FlexJornadaRow = {
  jornadaId: string;
  ligaId: string;
  canchas: number;
  rondas: number;
  duracionRondaMin: number;
  descansoMin: number;
  horaInicio: string | null;
  horaFin: string | null;
  seed: number | null;
  programacionEstado: "vacia" | "borrador" | "confirmada";
  advertencia: string | null;
  esFinal: boolean;
  calidad: FlexScheduleQuality | null;
};

export type FlexPosicionRow = {
  jornadaId: string;
  jugadorId: string;
  posicion: number;
  puntos: number;
  partidos: number;
  gamesFavor: number;
  gamesContra: number;
};

export type FlexHonorRow = {
  campeonId: string;
  subcampeonId: string;
  tercerId: string | null;
  jornadaFinalId: string;
};

export type FlexBundle = {
  config: FlexConfigRow;
  jornadas: FlexJornadaRow[];
  participantes: Record<string, string[]>;
  posiciones: FlexPosicionRow[];
  honores: FlexHonorRow | null;
};

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Inicia sesión para continuar.");
  return data.user.id;
}

function rpcError(data: { ok?: boolean; error?: string } | null, fallback: string): void {
  if (!data?.ok) throw new Error(data?.error || fallback);
}

export async function bootstrapFlexLeague(
  ligaId: string,
  options?: FlexLeagueCreateOptions
): Promise<void> {
  await requireUserId();
  const jornadas = FLEX_DEFAULT_JORNADAS;
  const { data: config, error: cErr } = await supabase
    .from("liga_flex_config")
    .select("liga_id")
    .eq("liga_id", ligaId)
    .maybeSingle();
  if (cErr) throw new Error(cErr.message);
  if (!config) {
    const { error } = await supabase.from("liga_flex_config").insert({
      liga_id: ligaId,
      jornadas_planeadas: jornadas,
      categoria: options?.categoria?.trim() || FLEX_DEFAULT_CATEGORIA,
      horario_sugerido: options?.horario?.trim() || null,
      inscripcion_temporada_mxn: options?.inscripcionTemporadaMxn ?? FLEX_DEFAULT_INSCRIPCION_MXN,
      participacion_jornada_mxn: options?.participacionJornadaMxn ?? FLEX_DEFAULT_JORNADA_MXN,
      premio_campeon: options?.premioCampeon?.trim() || FLEX_DEFAULT_PREMIO_CAMPEON,
      premio_subcampeon: options?.premioSubcampeon?.trim() || FLEX_DEFAULT_PREMIO_SUBCAMPEON,
      premio_tercer: options?.premioTercer?.trim() || FLEX_DEFAULT_PREMIO_TERCER,
      rondas_sugeridas: FLEX_DEFAULT_ROUNDS,
      duracion_ronda_min: FLEX_DEFAULT_ROUND_MINUTES,
      descanso_min: FLEX_DEFAULT_REST_MINUTES,
    });
    if (error) throw new Error(error.message);
  }

  const { data: existing, error: jErr } = await supabase
    .from("liga_jornadas")
    .select("id, numero")
    .eq("liga_id", ligaId);
  if (jErr) throw new Error(jErr.message);
  const have = new Set((existing ?? []).map((row) => Number(row.numero)));
  const missing = Array.from({ length: jornadas }, (_, i) => i + 1).filter((n) => !have.has(n));
  if (missing.length > 0) {
    const { data: inserted, error } = await supabase
      .from("liga_jornadas")
      .insert(missing.map((numero) => ({ liga_id: ligaId, numero, estado: "upcoming" })))
      .select("id");
    if (error) throw new Error(error.message);
    if (inserted?.length) {
      const { error: fErr } = await supabase.from("liga_jornada_flex").insert(
        inserted.map((row) => ({
          jornada_id: row.id,
          liga_id: ligaId,
          canchas: options?.canchas ?? 3,
          rondas: FLEX_DEFAULT_ROUNDS,
          duracion_ronda_min: FLEX_DEFAULT_ROUND_MINUTES,
          descanso_min: FLEX_DEFAULT_REST_MINUTES,
        }))
      );
      if (fErr) throw new Error(fErr.message);
    }
  }
}

export async function loadFlexLeague(ligaId: string): Promise<FlexBundle> {
  const [{ data: config, error: cErr }, { data: jornadas, error: jErr }, { data: honores, error: hErr }] =
    await Promise.all([
      supabase.from("liga_flex_config").select("*").eq("liga_id", ligaId).maybeSingle(),
      supabase.from("liga_jornadas").select("id").eq("liga_id", ligaId),
      supabase.from("liga_flex_honores").select("*").eq("liga_id", ligaId).maybeSingle(),
    ]);
  if (cErr) throw new Error(cErr.message);
  if (jErr) throw new Error(jErr.message);
  if (hErr) throw new Error(hErr.message);
  if (!config) throw new Error("Esta liga todavía no tiene configuración Flex.");

  const ids = (jornadas ?? []).map((row) => String(row.id));
  const [flexRes, partRes, posRes] = await Promise.all([
    ids.length
      ? supabase.from("liga_jornada_flex").select("*").in("jornada_id", ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? supabase.from("liga_jornada_participantes").select("jornada_id, jugador_id").in("jornada_id", ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? supabase.from("liga_flex_posiciones").select("*").in("jornada_id", ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (flexRes.error) throw new Error(flexRes.error.message);
  if (partRes.error) throw new Error(partRes.error.message);
  if (posRes.error) throw new Error(posRes.error.message);

  const participantes: Record<string, string[]> = {};
  for (const row of partRes.data ?? []) {
    const key = String(row.jornada_id);
    participantes[key] = [...(participantes[key] ?? []), String(row.jugador_id)];
  }

  return {
    config: mapConfig(config as Record<string, unknown>),
    jornadas: (flexRes.data ?? []).map((row) => mapJornada(row as Record<string, unknown>)),
    participantes,
    posiciones: (posRes.data ?? []).map((row) => ({
      jornadaId: String(row.jornada_id),
      jugadorId: String(row.jugador_id),
      posicion: Number(row.posicion),
      puntos: Number(row.puntos),
      partidos: Number(row.partidos),
      gamesFavor: Number(row.games_favor),
      gamesContra: Number(row.games_contra),
    })),
    honores: honores
      ? {
          campeonId: String(honores.campeon_id),
          subcampeonId: String(honores.subcampeon_id),
          tercerId: honores.tercer_id ? String(honores.tercer_id) : null,
          jornadaFinalId: String(honores.jornada_final_id),
        }
      : null,
  };
}

export async function updateFlexSeasonConfig(
  ligaId: string,
  patch: Partial<Pick<FlexConfigRow, "categoria" | "horarioSugerido" | "inscripcionTemporadaMxn" | "participacionJornadaMxn" | "premioCampeon" | "premioSubcampeon" | "premioTercer" | "jornadasPlaneadas">>
): Promise<void> {
  await requireUserId();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.categoria !== undefined) row.categoria = patch.categoria;
  if (patch.horarioSugerido !== undefined) row.horario_sugerido = patch.horarioSugerido;
  if (patch.inscripcionTemporadaMxn !== undefined) row.inscripcion_temporada_mxn = patch.inscripcionTemporadaMxn;
  if (patch.participacionJornadaMxn !== undefined) row.participacion_jornada_mxn = patch.participacionJornadaMxn;
  if (patch.premioCampeon !== undefined) row.premio_campeon = patch.premioCampeon;
  if (patch.premioSubcampeon !== undefined) row.premio_subcampeon = patch.premioSubcampeon;
  if (patch.premioTercer !== undefined) row.premio_tercer = patch.premioTercer;
  if (patch.jornadasPlaneadas !== undefined) {
    if (patch.jornadasPlaneadas !== FLEX_DEFAULT_JORNADAS) {
      throw new Error("Riviera Flex League se juega a 12 jornadas.");
    }
    row.jornadas_planeadas = FLEX_DEFAULT_JORNADAS;
  }
  const { error } = await supabase.from("liga_flex_config").update(row).eq("liga_id", ligaId);
  if (error) throw new Error(error.message);
}

export async function resizeFlexCalendar(input: {
  ligaId: string;
  jornadas: Array<{ id: string; numero: number; hasOfficialResults: boolean }>;
  targetCount: number;
  canchas: number;
}): Promise<void> {
  await requireUserId();
  const plan = resizeFlexSeason({
    jornadas: input.jornadas.map((j) => ({
      numero: j.numero,
      hasOfficialResults: j.hasOfficialResults,
    })),
    targetCount: input.targetCount,
  });
  if (!plan.ok) throw new Error(plan.error);
  if (plan.removeNumeros.length > 0) {
    const ids = input.jornadas
      .filter((j) => plan.removeNumeros.includes(j.numero))
      .map((j) => j.id);
    const { error } = await supabase.from("liga_jornadas").delete().in("id", ids);
    if (error) throw new Error(error.message);
  }
  if (plan.addNumeros.length > 0) {
    const { data, error } = await supabase
      .from("liga_jornadas")
      .insert(
        plan.addNumeros.map((numero) => ({
          liga_id: input.ligaId,
          numero,
          estado: "upcoming",
        }))
      )
      .select("id");
    if (error) throw new Error(error.message);
    const { error: fErr } = await supabase.from("liga_jornada_flex").insert(
      (data ?? []).map((row) => ({
        jornada_id: row.id,
        liga_id: input.ligaId,
        canchas: input.canchas,
        rondas: FLEX_DEFAULT_ROUNDS,
        duracion_ronda_min: FLEX_DEFAULT_ROUND_MINUTES,
        descanso_min: FLEX_DEFAULT_REST_MINUTES,
      }))
    );
    if (fErr) throw new Error(fErr.message);
  }
  await updateFlexSeasonConfig(input.ligaId, { jornadasPlaneadas: input.targetCount });
}

export async function saveFlexJornadaSetup(
  jornadaId: string,
  patch: {
    fecha: string | null;
    canchas: number;
    rondas: number;
    duracionRondaMin: number;
    descansoMin: number;
    horaInicio: string | null;
    horaFin: string | null;
  }
): Promise<void> {
  await requireUserId();
  const { data, error } = await supabase.rpc("flex_programar_jornada", {
    p_jornada_id: jornadaId,
    p_fecha: patch.fecha,
    p_inicio: patch.horaInicio,
    p_fin: patch.horaFin,
    p_canchas: patch.canchas,
    p_rondas: patch.rondas,
    p_duracion: patch.duracionRondaMin,
    p_descanso: patch.descansoMin,
  });
  if (error) throw new Error(error.message);
  rpcError(data as { ok?: boolean; error?: string }, "No se pudo programar la jornada.");
}

export async function setFlexParticipantes(jornadaId: string, jugadorIds: string[]): Promise<void> {
  const uid = await requireUserId();
  if (jugadorIds.length > 0) {
    await assertLigaJugadoresDelOrganizador(uid, jugadorIds);
  }
  const { data, error } = await supabase.rpc("flex_set_participantes", {
    p_jornada_id: jornadaId,
    p_jugadores: jugadorIds,
  });
  if (error) throw new Error(error.message);
  rpcError(data as { ok?: boolean; error?: string }, "No se pudo guardar la lista de la jornada.");
}

export async function loadFlexConfirmedRounds(jornadaId: string): Promise<number[]> {
  const { data, error } = await supabase
    .from("liga_flex_auditoria")
    .select("detalle")
    .eq("jornada_id", jornadaId)
    .eq("accion", "confirmar_ronda");
  if (error) throw new Error(error.message);
  const rounds = new Set<number>();
  for (const row of data ?? []) {
    const detalle = row.detalle as { ronda?: number } | null;
    const ronda = Number(detalle?.ronda);
    if (Number.isInteger(ronda)) rounds.add(ronda);
  }
  return Array.from(rounds).sort((a, b) => a - b);
}

export async function saveFlexRound(input: {
  jornadaId: string;
  round: number;
  schedule: FlexSchedule;
}): Promise<void> {
  await requireUserId();
  const partidos = input.schedule.rounds
    .filter((item) => item.round === input.round)
    .flatMap((item) =>
      item.matches.map((match) => ({
        ronda: match.round,
        cancha: match.court,
        a1: match.pairA[0],
        a2: match.pairA[1],
        b1: match.pairB[0],
        b2: match.pairB[1],
      }))
    );
  const { data, error } = await supabase.rpc("flex_guardar_ronda", {
    p_jornada_id: input.jornadaId,
    p_ronda: input.round,
    p_seed: input.schedule.seed,
    p_partidos: partidos,
    p_calidad: input.schedule.quality,
    p_advertencia: input.schedule.quality.limitations.join(" "),
  });
  if (error) throw new Error(error.message);
  rpcError(data as { ok?: boolean; error?: string }, "No se pudo guardar la ronda.");
}

export async function confirmFlexRound(jornadaId: string, round: number): Promise<void> {
  await requireUserId();
  const { data, error } = await supabase.rpc("flex_confirmar_ronda", {
    p_jornada_id: jornadaId,
    p_ronda: round,
  });
  if (error) throw new Error(error.message);
  rpcError(data as { ok?: boolean; error?: string }, "No se pudo confirmar la ronda.");
}

export async function adjustFlexRounds(jornadaId: string, rounds: number): Promise<number> {
  await requireUserId();
  const { data, error } = await supabase.rpc("flex_ajustar_rondas", {
    p_jornada_id: jornadaId,
    p_rondas: rounds,
  });
  if (error) throw new Error(error.message);
  rpcError(data as { ok?: boolean; error?: string }, "No se pudo cambiar el número de rondas.");
  return Number((data as { partidos_retirados?: number }).partidos_retirados ?? 0);
}

export async function resetFlexJornada(jornadaId: string, motivo: string): Promise<void> {
  await requireUserId();
  const { data, error } = await supabase.rpc("flex_reiniciar_jornada", {
    p_jornada_id: jornadaId,
    p_motivo: motivo,
  });
  if (error) throw new Error(error.message);
  rpcError(data as { ok?: boolean; error?: string }, "No se pudo reiniciar la jornada.");
}

export async function confirmFlexSchedule(input: {
  jornadaId: string;
  schedule: FlexSchedule;
}): Promise<void> {
  await requireUserId();
  const partidos = input.schedule.rounds.flatMap((round) =>
    round.matches.map((match) => ({
      ronda: match.round,
      cancha: match.court,
      a1: match.pairA[0],
      a2: match.pairA[1],
      b1: match.pairB[0],
      b2: match.pairB[1],
    }))
  );
  const { data, error } = await supabase.rpc("flex_guardar_programacion", {
    p_jornada_id: input.jornadaId,
    p_seed: input.schedule.seed,
    p_partidos: partidos,
    p_calidad: input.schedule.quality,
    p_advertencia: input.schedule.quality.limitations.join(" "),
  });
  if (error) throw new Error(error.message);
  rpcError(data as { ok?: boolean; error?: string }, "No se pudo confirmar la jornada.");
}

export async function startFlexJornada(jornadaId: string, ligaId: string): Promise<void> {
  await requireUserId();
  const { error } = await supabase
    .from("liga_jornadas")
    .update({ estado: "in_progress" })
    .eq("id", jornadaId)
    .eq("estado", "upcoming");
  if (error) throw new Error(error.message);
  const { error: ligaError } = await supabase
    .from("ligas")
    .update({ estado: "in_progress" })
    .eq("id", ligaId)
    .eq("estado", "upcoming");
  if (ligaError) throw new Error(ligaError.message);
}

export async function saveFlexMatchScore(
  partidoId: string,
  scoreA: number,
  scoreB: number
): Promise<void> {
  await requireUserId();
  const { data, error } = await supabase.rpc("flex_guardar_marcador", {
    p_partido_id: partidoId,
    p_score_a: scoreA,
    p_score_b: scoreB,
  });
  if (error) throw new Error(error.message);
  rpcError(data as { ok?: boolean; error?: string }, "No se pudo guardar el marcador.");
}

export type FlexServerResult = {
  needsResolution?: boolean;
  error?: string;
  ties?: string[][];
  tied?: string[];
};

export async function applyFlexJornada(input: {
  jornadaId: string;
  orden?: string[];
  nota?: string;
}): Promise<FlexServerResult> {
  await requireUserId();
  const { data, error } = await supabase.rpc("flex_aplicar_jornada", {
    p_jornada_id: input.jornadaId,
    p_filas: (input.orden ?? []).map((jugadorId) => ({ jugador_id: jugadorId })),
    p_nota: input.nota ?? null,
  });
  if (error) throw new Error(error.message);
  const body = (data ?? {}) as {
    ok?: boolean;
    error?: string;
    needs_resolution?: boolean;
    ties?: string[][];
  };
  if (body.needs_resolution) {
    return { needsResolution: true, error: body.error, ties: body.ties };
  }
  if (!body.ok) throw new Error(body.error || "No se pudieron asignar los puntos.");
  return {};
}

export async function correctFlexJornada(input: {
  jornadaId: string;
  marcadores: Array<{ partidoId: string; scoreA: number; scoreB: number }>;
  motivo: string;
  orden?: string[];
}): Promise<FlexServerResult> {
  await requireUserId();
  const { data, error } = await supabase.rpc("flex_corregir_jornada", {
    p_jornada_id: input.jornadaId,
    p_marcadores: input.marcadores.map((row) => ({
      partido_id: row.partidoId,
      score_a: row.scoreA,
      score_b: row.scoreB,
    })),
    p_motivo: input.motivo,
    p_orden: input.orden ?? null,
  });
  if (error) throw new Error(error.message);
  const body = (data ?? {}) as {
    ok?: boolean;
    error?: string;
    needs_resolution?: boolean;
    ties?: string[][];
  };
  if (body.needs_resolution) {
    return { needsResolution: true, error: body.error, ties: body.ties };
  }
  if (!body.ok) throw new Error(body.error || "No se pudo corregir la jornada.");
  return {};
}

/**
 * Corrige un partido ya confirmado (ronda confirmada o jornada finalizada).
 * El servidor valida permisos, exige motivo, recalcula posiciones y puntos
 * sustituyendo los anteriores y registra la auditoría en una sola transacción.
 */
export async function correctFlexMatch(input: {
  partidoId: string;
  scoreA: number;
  scoreB: number;
  motivo: string;
  orden?: string[];
}): Promise<FlexServerResult> {
  await requireUserId();
  const { data, error } = await supabase.rpc("flex_corregir_marcador", {
    p_partido_id: input.partidoId,
    p_score_a: input.scoreA,
    p_score_b: input.scoreB,
    p_motivo: input.motivo,
    p_orden: input.orden && input.orden.length > 0 ? input.orden : null,
  });
  if (error) throw new Error(error.message);
  const body = (data ?? {}) as {
    ok?: boolean;
    error?: string;
    needs_resolution?: boolean;
    ties?: string[][];
  };
  if (body.needs_resolution) {
    return { needsResolution: true, error: body.error, ties: body.ties };
  }
  if (!body.ok) throw new Error(body.error || "No se pudo corregir el marcador.");
  return {};
}

export async function markFlexFinal(input: {
  ligaId: string;
  jornadaId: string;
  jornadas: Array<{ id: string; numero: number; hasData: boolean }>;
  numero: number;
}): Promise<void> {
  await requireUserId();
  const check = assertFlexFinalJornada({
    jornadas: input.jornadas,
    numero: input.numero,
  });
  if (!check.ok) throw new Error(check.error);
  const { error: clearErr } = await supabase
    .from("liga_jornada_flex")
    .update({ es_final: false, updated_at: new Date().toISOString() })
    .eq("liga_id", input.ligaId)
    .eq("es_final", true);
  if (clearErr) throw new Error(clearErr.message);
  const { error } = await supabase
    .from("liga_jornada_flex")
    .update({ es_final: true, updated_at: new Date().toISOString() })
    .eq("jornada_id", input.jornadaId);
  if (error) throw new Error(error.message);
  const { error: cfgErr } = await supabase
    .from("liga_flex_config")
    .update({ jornada_final_id: input.jornadaId, updated_at: new Date().toISOString() })
    .eq("liga_id", input.ligaId);
  if (cfgErr) throw new Error(cfgErr.message);
}

export async function closeFlexLeague(
  ligaId: string,
  orden?: string[]
): Promise<{ needsResolution?: boolean; error?: string; tied?: string[] }> {
  await requireUserId();
  const { data, error } = await supabase.rpc("flex_cerrar_liga", {
    p_liga_id: ligaId,
    p_orden: orden ?? null,
  });
  if (error) throw new Error(error.message);
  const body = (data ?? {}) as {
    ok?: boolean;
    error?: string;
    needs_resolution?: boolean;
    tied?: string[];
  };
  if (body.needs_resolution) {
    return { needsResolution: true, error: body.error, tied: body.tied };
  }
  if (!body.ok) throw new Error(body.error || "No se pudo cerrar la liga.");
  return {};
}

export async function reopenFlexLeague(ligaId: string, motivo: string): Promise<void> {
  await requireUserId();
  const { data, error } = await supabase.rpc("flex_reabrir_liga", {
    p_liga_id: ligaId,
    p_motivo: motivo,
  });
  if (error) throw new Error(error.message);
  rpcError(data as { ok?: boolean; error?: string }, "No se pudo reabrir la liga.");
}

function mapConfig(row: Record<string, unknown>): FlexConfigRow {
  return {
    ligaId: String(row.liga_id),
    jornadasPlaneadas: Number(row.jornadas_planeadas),
    jugadoresMin: Number(row.jugadores_min),
    jugadoresMax: Number(row.jugadores_max),
    rondasSugeridas: Number(row.rondas_sugeridas),
    duracionRondaMin: Number(row.duracion_ronda_min),
    descansoMin: Number(row.descanso_min),
    categoria: (row.categoria as string | null) ?? null,
    horarioSugerido: (row.horario_sugerido as string | null) ?? null,
    inscripcionTemporadaMxn: row.inscripcion_temporada_mxn == null ? null : Number(row.inscripcion_temporada_mxn),
    participacionJornadaMxn: row.participacion_jornada_mxn == null ? null : Number(row.participacion_jornada_mxn),
    premioCampeon: (row.premio_campeon as string | null) ?? null,
    premioSubcampeon: (row.premio_subcampeon as string | null) ?? null,
    premioTercer: (row.premio_tercer as string | null) ?? null,
    jornadaFinalId: (row.jornada_final_id as string | null) ?? null,
    cerradoAt: (row.cerrado_at as string | null) ?? null,
  };
}

function mapJornada(row: Record<string, unknown>): FlexJornadaRow {
  const estado = String(row.programacion_estado ?? "vacia");
  return {
    jornadaId: String(row.jornada_id),
    ligaId: String(row.liga_id),
    canchas: Number(row.canchas),
    rondas: Number(row.rondas),
    duracionRondaMin: Number(row.duracion_ronda_min),
    descansoMin: Number(row.descanso_min),
    horaInicio: row.hora_inicio ? String(row.hora_inicio).slice(0, 5) : null,
    horaFin: row.hora_fin ? String(row.hora_fin).slice(0, 5) : null,
    seed: row.seed == null ? null : Number(row.seed),
    programacionEstado: estado === "confirmada" || estado === "borrador" ? estado : "vacia",
    advertencia: (row.advertencia as string | null) ?? null,
    esFinal: Boolean(row.es_final),
    calidad: (row.calidad as FlexScheduleQuality | null) ?? null,
  };
}
