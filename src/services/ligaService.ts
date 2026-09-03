import { supabase } from "../lib/supabaseClient";
import type {
  AddJugadorLigaInput,
  CreateLigaInput,
  Liga,
  LigaDetalle,
  LigaEquipo,
  LigaJornada,
  LigaJornadaPareja,
  LigaJugador,
  LigaJugadorPoolItem,
  LigaPartido,
  LigaVueltas,
  RankingItem,
  UpdateJugadorLigaInput,
} from "../lib/liga/types";
import {
  validateEquiposParaCalendario,
  validateEquiposParaPlayoffsCalendario,
  validateInscripcionesParaCalendario,
} from "../lib/liga/calendario";
import {
  fetchEquiposForLiga,
  insertJornadasForLigaParejasFijas,
  recalcularPuntosLigaEquipos,
  resetPuntosEquiposLiga,
} from "./ligaParejasFijasService";
import {
  clearPlayoffSeeds,
  insertJornadasForLigaParejasFijasPlayoffs,
  recalcularPuntosLigaEquiposPlayoffs,
} from "./ligaParejasFijasPlayoffsService";
import {
  collectLigaParticipantLegacyJugadorIds,
  ensureLigaInscripcionRankingForLiga,
  fireLigaInscripcionRankingSync,
} from "./ligaCareerInscripcionSync";
import { dedupeLigaJugadoresById } from "../lib/liga/dedupeJugadores";
import {
  computeParejasFijasMatchTotals,
  parseSetScoresJson,
  type LigaPartidoSetScore,
} from "../lib/liga/parejasFijasMatchScore";
import { parsePlayoffsSetScoresJson } from "../lib/liga/parejasFijasPlayoffsMatchScore";
import {
  isEquiposModalidad,
  isParejasFijasLegacy,
  isParejasFijasPlayoffs,
  parseLigaModalidad,
} from "../lib/liga/ligaModalidad";
import {
  normalizeHoraInicio,
  validateCancha,
} from "../lib/liga/programacion";
import type { RivieraJugadorCategoria } from "../lib/rivieraJugadores/types";

function mapPartidoSetScores(raw: unknown): LigaPartido["set_scores"] {
  const playoffs = parsePlayoffsSetScoresJson(raw);
  if (playoffs) return playoffs;
  return parseSetScoresJson(raw);
}

async function requireUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error("Debes iniciar sesión para gestionar ligas.");
  }
  return user.id;
}

function mapLiga(row: Record<string, unknown>): Liga {
  const vueltasRaw = Number(row.vueltas ?? 1);
  const vueltas: LigaVueltas =
    vueltasRaw === 2 ? 2 : vueltasRaw === 3 ? 3 : 1;
  return {
    id: String(row.id),
    nombre: String(row.nombre),
    estado: row.estado as Liga["estado"],
    modalidad: parseLigaModalidad(row.modalidad),
    vueltas,
    organizador_id: row.organizador_id ? String(row.organizador_id) : null,
    canchas_disponibles: Number(row.canchas_disponibles ?? 3),
    fecha_inicio: row.fecha_inicio ? String(row.fecha_inicio) : null,
    fecha_fin: row.fecha_fin ? String(row.fecha_fin) : null,
    created_at: String(row.created_at),
    inscripciones_count:
      row.inscripciones_count != null
        ? Number(row.inscripciones_count)
        : undefined,
    equipos_count:
      row.equipos_count != null ? Number(row.equipos_count) : undefined,
    playoff_seeds:
      row.playoff_seeds && typeof row.playoff_seeds === "object"
        ? (row.playoff_seeds as Record<string, string>)
        : null,
    playoff_seeded_at: row.playoff_seeded_at
      ? String(row.playoff_seeded_at)
      : null,
  };
}

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

/** Parejas por jornada (algoritmo del prompt: fijo [0], rotar resto). */
export function buildJornadaParejasFromPlayers(
  playerIds: string[]
): Array<{ jugador1_id: string; jugador2_id: string }>[] {
  const N = playerIds.length;
  const rondas = N - 1;
  let lista = [...playerIds];
  const jornadas: Array<{ jugador1_id: string; jugador2_id: string }>[] = [];

  for (let r = 0; r < rondas; r++) {
    const parejas: { jugador1_id: string; jugador2_id: string }[] = [];
    for (let i = 0; i < N / 2; i++) {
      parejas.push({
        jugador1_id: lista[i],
        jugador2_id: lista[N - 1 - i],
      });
    }
    jornadas.push(parejas);
    lista = [lista[0], lista[N - 1], ...lista.slice(1, N - 1)];
  }
  return jornadas;
}

/** Partidos round-robin entre parejas (Berger / círculo). */
export function buildPartidosRoundRobin(
  parejaIds: string[],
  canchasDisponibles: number
): Array<{
  pareja1_id: string;
  pareja2_id: string;
  ronda: number;
  cancha: number;
  estado: "upcoming" | "in_progress";
}> {
  const teams = [...parejaIds];
  if (teams.length % 2 === 1) teams.push("__BYE__");
  const n = teams.length;
  const rounds = n - 1;
  const half = n / 2;
  let rotation = [...teams];
  const out: Array<{
    pareja1_id: string;
    pareja2_id: string;
    ronda: number;
    cancha: number;
    estado: "upcoming" | "in_progress";
  }> = [];

  for (let r = 0; r < rounds; r++) {
    let canchaSlot = 0;
    for (let i = 0; i < half; i++) {
      const t1 = rotation[i];
      const t2 = rotation[n - 1 - i];
      if (t1 === "__BYE__" || t2 === "__BYE__" || t1 === t2) continue;
      canchaSlot += 1;
      out.push({
        pareja1_id: t1,
        pareja2_id: t2,
        ronda: r + 1,
        cancha: ((canchaSlot - 1) % canchasDisponibles) + 1,
        estado: r === 0 ? "in_progress" : "upcoming",
      });
    }
    const fixed = rotation[0];
    const rest = rotation.slice(1);
    const last = rest.pop();
    if (last !== undefined) rest.unshift(last);
    rotation = [fixed, ...rest];
  }
  return out;
}

export async function createLiga(data: CreateLigaInput): Promise<Liga> {
  const uid = await requireUserId();
  const modalidad = data.modalidad ?? "individual_rotativo";
  const vueltas = data.vueltas ?? 1;
  const { data: row, error } = await supabase
    .from("ligas")
    .insert({
      nombre: data.nombre.trim(),
      organizador_id: uid,
      canchas_disponibles: data.canchas_disponibles ?? 3,
      fecha_inicio: data.fecha_inicio ?? null,
      fecha_fin: data.fecha_fin ?? null,
      modalidad,
      vueltas,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapLiga(row as Record<string, unknown>);
}

/** Renombra la liga en cualquier estado (próxima, en curso o finalizada). */
export async function updateLigaNombre(
  ligaId: string,
  nombre: string
): Promise<Liga> {
  const uid = await requireUserId();
  const nombreTrim = nombre.trim();
  if (!nombreTrim) {
    throw new Error("El nombre es obligatorio.");
  }

  const { data: row, error } = await supabase
    .from("ligas")
    .update({ nombre: nombreTrim })
    .eq("id", ligaId)
    .eq("organizador_id", uid)
    .select()
    .single();

  if (error) throw new Error(error.message);
  if (!row) throw new Error("Liga no encontrada.");
  return mapLiga(row as Record<string, unknown>);
}

export async function getLigas(): Promise<Liga[]> {
  const uid = await requireUserId();
  const { data: ligas, error } = await supabase
    .from("ligas")
    .select("*")
    .eq("organizador_id", uid)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  if (!ligas?.length) return [];

  const ids = ligas.map((l) => l.id);
  const [{ data: counts, error: cErr }, { data: equipoCounts, error: eErr }] =
    await Promise.all([
      supabase.from("liga_inscripciones").select("liga_id").in("liga_id", ids),
      supabase.from("liga_equipos").select("liga_id").in("liga_id", ids),
    ]);

  if (cErr) throw new Error(cErr.message);
  if (eErr && !eErr.message.includes("liga_equipos")) {
    throw new Error(eErr.message);
  }

  const countMap = new Map<string, number>();
  for (const row of counts ?? []) {
    const lid = String(row.liga_id);
    countMap.set(lid, (countMap.get(lid) ?? 0) + 1);
  }

  const equiposMap = new Map<string, number>();
  for (const row of equipoCounts ?? []) {
    const lid = String(row.liga_id);
    equiposMap.set(lid, (equiposMap.get(lid) ?? 0) + 1);
  }

  return ligas.map((l) =>
    mapLiga({
      ...l,
      inscripciones_count: countMap.get(String(l.id)) ?? 0,
      equipos_count: equiposMap.get(String(l.id)) ?? 0,
    } as Record<string, unknown>)
  );
}

/** Columnas de liga_jugadores sin PII (email/telefono) para consumo público. */
const LIGA_JUGADOR_SELECT_PUBLIC =
  "id,nombre,genero,nivel,estado,organizador_id,created_at" as const;

export async function getLigaById(
  ligaId: string,
  usePublicClient = false
): Promise<LigaDetalle> {
  const { data: liga, error: lErr } = await supabase
    .from("ligas")
    .select("*")
    .eq("id", ligaId)
    .maybeSingle();

  if (lErr) throw new Error(lErr.message);
  if (!liga) throw new Error("Liga no encontrada.");

  const inscripcionesQuery = usePublicClient
    ? supabase
        .from("liga_inscripciones")
        .select(`*, jugador:liga_jugadores(${LIGA_JUGADOR_SELECT_PUBLIC})`)
        .eq("liga_id", ligaId)
    : supabase
        .from("liga_inscripciones")
        .select("*, jugador:liga_jugadores(*)")
        .eq("liga_id", ligaId);

  const [
    { data: inscripciones, error: iErr },
    { data: jornadas, error: jErr },
    equipos,
  ] = await Promise.all([
    inscripcionesQuery,
    supabase
      .from("liga_jornadas")
      .select("*")
      .eq("liga_id", ligaId)
      .order("numero", { ascending: true }),
    fetchEquiposForLiga(ligaId, { publicRead: usePublicClient }).catch(
      () => [] as LigaEquipo[]
    ),
  ]);

  if (iErr) throw new Error(iErr.message);
  if (jErr) throw new Error(jErr.message);

  const jornadaIds = (jornadas ?? []).map((j) => j.id);
  let parejas: LigaJornadaPareja[] = [];
  let partidos: LigaPartido[] = [];

  if (jornadaIds.length > 0) {
    const [{ data: pRows, error: pErr }, { data: mRows, error: mErr }] =
      await Promise.all([
        supabase
          .from("liga_jornada_parejas")
          .select("*")
          .in("jornada_id", jornadaIds),
        supabase
          .from("liga_partidos")
          .select("*")
          .in("jornada_id", jornadaIds)
          .order("ronda", { ascending: true }),
      ]);

    if (pErr) throw new Error(pErr.message);
    if (mErr) throw new Error(mErr.message);

    const jugadoresById = new Map<string, LigaJugador>();
    for (const row of inscripciones ?? []) {
      if (row.jugador) {
        const j = mapJugador(row.jugador as Record<string, unknown>);
        jugadoresById.set(j.id, j);
      }
    }
    for (const eq of equipos) {
      if (eq.jugador1) jugadoresById.set(eq.jugador1.id, eq.jugador1);
      if (eq.jugador2) jugadoresById.set(eq.jugador2.id, eq.jugador2);
    }

    parejas = (pRows ?? []).map((p) => ({
      id: String(p.id),
      jornada_id: String(p.jornada_id),
      jugador1_id: String(p.jugador1_id),
      jugador2_id: String(p.jugador2_id),
      equipo_id: p.equipo_id ? String(p.equipo_id) : null,
      jugador1: jugadoresById.get(String(p.jugador1_id)),
      jugador2: jugadoresById.get(String(p.jugador2_id)),
    }));

    partidos = (mRows ?? []).map((m) => ({
      id: String(m.id),
      jornada_id: String(m.jornada_id),
      pareja1_id: String(m.pareja1_id),
      pareja2_id: String(m.pareja2_id),
      score_pareja1: m.score_pareja1 != null ? Number(m.score_pareja1) : null,
      score_pareja2: m.score_pareja2 != null ? Number(m.score_pareja2) : null,
      set_scores: mapPartidoSetScores(
        (m as { set_scores?: unknown }).set_scores
      ),
      cancha: m.cancha != null ? Number(m.cancha) : null,
      hora_inicio: (m as { hora_inicio?: string | null }).hora_inicio
        ? String((m as { hora_inicio?: string | null }).hora_inicio)
        : null,
      ronda: Number(m.ronda ?? 1),
      estado: m.estado as LigaPartido["estado"],
      fase: (m as { fase?: string | null }).fase
        ? ((m as { fase: string }).fase as LigaPartido["fase"])
        : null,
      bracket_slot: (m as { bracket_slot?: string | null }).bracket_slot
        ? ((m as { bracket_slot: string }).bracket_slot as LigaPartido["bracket_slot"])
        : null,
      liga_id: (m as { liga_id?: string | null }).liga_id
        ? String((m as { liga_id: string }).liga_id)
        : null,
      created_at: String(m.created_at),
    }));
  }

  const jugadorMap = new Map<string, LigaJugador>();
  const insc = (inscripciones ?? []).map((row) => {
    const j = row.jugador
      ? mapJugador(row.jugador as Record<string, unknown>)
      : undefined;
    if (j) jugadorMap.set(j.id, j);
    return {
      id: String(row.id),
      liga_id: String(row.liga_id),
      jugador_id: String(row.jugador_id),
      puntos: Number(row.puntos),
      jugador: j,
    };
  });

  const parejasByJornada = new Map<string, LigaJornadaPareja[]>();
  for (const p of parejas) {
    const list = parejasByJornada.get(p.jornada_id) ?? [];
    list.push(p);
    parejasByJornada.set(p.jornada_id, list);
  }

  const partidosByJornada = new Map<string, LigaPartido[]>();
  for (const m of partidos) {
    const list = partidosByJornada.get(m.jornada_id) ?? [];
    list.push(m);
    partidosByJornada.set(m.jornada_id, list);
  }

  for (const eq of equipos) {
    if (eq.jugador1) jugadorMap.set(eq.jugador1.id, eq.jugador1);
    if (eq.jugador2) jugadorMap.set(eq.jugador2.id, eq.jugador2);
  }

  const jornadasDetalle: LigaJornada[] = (jornadas ?? []).map((j) => ({
    id: String(j.id),
    liga_id: String(j.liga_id),
    numero: Number(j.numero),
    estado: j.estado as LigaJornada["estado"],
    fecha: j.fecha ? String(j.fecha) : null,
    created_at: String(j.created_at),
    puntos_aplicados: Boolean(
      (j as { puntos_aplicados?: boolean }).puntos_aplicados
    ),
    parejas: parejasByJornada.get(String(j.id)) ?? [],
    partidos: partidosByJornada.get(String(j.id)) ?? [],
  }));

  return {
    ...mapLiga(liga as Record<string, unknown>),
    inscripciones: insc,
    equipos,
    jugadores: Array.from(jugadorMap.values()),
    jornadas: jornadasDetalle,
  };
}

export async function addJugadorLiga(
  data: AddJugadorLigaInput
): Promise<LigaJugador> {
  const uid = await requireUserId();
  const nombreTrim = data.nombre.trim();
  // Alta explícita: siempre crea fila nueva. Homónimos con distinto id son válidos.
  // No reutilizar por nombre.

  const { data: row, error } = await supabase
    .from("liga_jugadores")
    .insert({
      nombre: nombreTrim,
      email: data.email?.trim() || null,
      telefono: data.telefono?.trim() || null,
      genero: data.genero ?? null,
      nivel: data.nivel ?? null,
      organizador_id: uid,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapJugador(row as Record<string, unknown>);
}

export async function updateJugadorLiga(
  jugadorId: string,
  data: UpdateJugadorLigaInput
): Promise<LigaJugador> {
  const uid = await requireUserId();
  const patch: Record<string, unknown> = {};
  if (data.nombre !== undefined) patch.nombre = data.nombre.trim();
  if (data.email !== undefined) patch.email = data.email?.trim() || null;
  if (data.telefono !== undefined) patch.telefono = data.telefono?.trim() || null;
  if (data.genero !== undefined) patch.genero = data.genero;
  if (data.nivel !== undefined) patch.nivel = data.nivel;

  if (Object.keys(patch).length === 0) {
    throw new Error("No hay cambios para guardar.");
  }

  const { data: row, error } = await supabase
    .from("liga_jugadores")
    .update(patch)
    .eq("id", jugadorId)
    .eq("organizador_id", uid)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapJugador(row as Record<string, unknown>);
}

/** Oculta del pool; desinscribe de todas tus ligas. */
export async function deactivateJugadorLiga(jugadorId: string): Promise<void> {
  const uid = await requireUserId();

  const { data: jugador, error: jErr } = await supabase
    .from("liga_jugadores")
    .select("id")
    .eq("id", jugadorId)
    .eq("organizador_id", uid)
    .maybeSingle();

  if (jErr) throw new Error(jErr.message);
  if (!jugador) throw new Error("Jugador no encontrado.");

  const { data: ligas } = await supabase
    .from("ligas")
    .select("id")
    .eq("organizador_id", uid);

  const ligaIds = (ligas ?? []).map((l) => l.id);
  if (ligaIds.length > 0) {
    const { error: dErr } = await supabase
      .from("liga_inscripciones")
      .delete()
      .eq("jugador_id", jugadorId)
      .in("liga_id", ligaIds);
    if (dErr) throw new Error(dErr.message);
  }

  const { error } = await supabase
    .from("liga_jugadores")
    .update({ estado: "inactivo" })
    .eq("id", jugadorId);

  if (error) throw new Error(error.message);
}

async function deleteAllJornadasLiga(ligaId: string): Promise<void> {
  const { error } = await supabase
    .from("liga_jornadas")
    .delete()
    .eq("liga_id", ligaId);
  if (error) throw new Error(error.message);
}

async function resetPuntosLiga(ligaId: string): Promise<void> {
  const { error } = await supabase
    .from("liga_inscripciones")
    .update({ puntos: 0 })
    .eq("liga_id", ligaId);
  if (error) throw new Error(error.message);
}

export async function insertJornadasForLiga(
  ligaId: string,
  playerIds: string[]
): Promise<void> {
  validateInscripcionesParaCalendario(playerIds.length);
  const jornadasParejas = buildJornadaParejasFromPlayers(playerIds);

  // 2 inserts en bloque en vez de 1 por jornada: se dan de alta todas las
  // jornadas primero y luego todas sus parejas de una sola vez. El vínculo
  // jornada -> id se reconstruye por `numero` (clave estable, única por
  // liga_id ya que el round-robin las numera 1..N sin huecos ni repetidos),
  // nunca por la posición del arreglo devuelto en el RETURNING.
  const { data: jornadasRows, error: jErr } = await supabase
    .from("liga_jornadas")
    .insert(
      jornadasParejas.map((_, i) => ({
        liga_id: ligaId,
        numero: i + 1,
        estado: "upcoming",
      }))
    )
    .select("id, numero");

  if (jErr) throw new Error(jErr.message);

  const jornadaIdByNumero = new Map<number, string>();
  for (const row of jornadasRows ?? []) {
    jornadaIdByNumero.set(Number(row.numero), String(row.id));
  }

  const parejasRows = jornadasParejas.flatMap((parejas, i) => {
    const numero = i + 1;
    const jornadaId = jornadaIdByNumero.get(numero);
    if (!jornadaId) {
      throw new Error(
        `No se pudo resolver la jornada número ${numero} recién creada.`
      );
    }
    return parejas.map((p) => ({
      jornada_id: jornadaId,
      jugador1_id: p.jugador1_id,
      jugador2_id: p.jugador2_id,
    }));
  });

  if (parejasRows.length > 0) {
    const { error: pErr } = await supabase
      .from("liga_jornada_parejas")
      .insert(parejasRows);

    if (pErr) throw new Error(pErr.message);
  }
}

/**
 * Elimina la liga y todos sus datos vía RPC transaccional -- revierte
 * rating/ledger/totales de sus participaciones antes de borrar el árbol
 * (RANK-002, supabase/fix-rank002-safe-delete-cascade-20260729.sql). El
 * árbol de tablas hijas (jornadas/partidos/parejas/inscripciones/equipos) se
 * borra solo por ON DELETE CASCADE dentro de la misma RPC.
 */
export async function deleteLiga(ligaId: string): Promise<void> {
  const uid = await requireUserId();

  const { data, error } = await supabase.rpc("admin_delete_liga_cascade", {
    p_organizador_id: uid,
    p_liga_id: ligaId,
  });
  if (error) throw new Error(error.message);

  const status = (data as { status?: string } | null)?.status;
  if (status === "not_found") {
    throw new Error("Liga no encontrada.");
  }
}

/** Borra jornadas, puntos y vuelve la liga a «upcoming». */
export async function resetLiga(ligaId: string): Promise<void> {
  await requireUserId();

  const { data: liga, error: lErr } = await supabase
    .from("ligas")
    .select("modalidad")
    .eq("id", ligaId)
    .maybeSingle();

  if (lErr) throw new Error(lErr.message);

  await deleteAllJornadasLiga(ligaId);

  if (isEquiposModalidad(parseLigaModalidad(liga?.modalidad))) {
    await resetPuntosEquiposLiga(ligaId);
    if (isParejasFijasPlayoffs(parseLigaModalidad(liga?.modalidad))) {
      await clearPlayoffSeeds(ligaId);
    }
  } else {
    await resetPuntosLiga(ligaId);
  }

  const { error } = await supabase
    .from("ligas")
    .update({
      estado: "upcoming",
      fecha_inicio: null,
      fecha_fin: null,
    })
    .eq("id", ligaId);

  if (error) throw new Error(error.message);
}

/** Regenera jornadas según inscritos actuales (liga sigue en curso). */
export async function regenerarCalendarioLiga(
  ligaId: string,
  options?: { resetPuntos?: boolean }
): Promise<void> {
  await requireUserId();
  const detalle = await getLigaById(ligaId);

  if (isParejasFijasPlayoffs(detalle.modalidad)) {
    validateEquiposParaPlayoffsCalendario(detalle.equipos.length);
    await deleteAllJornadasLiga(ligaId);
    await clearPlayoffSeeds(ligaId);
    if (options?.resetPuntos) {
      await resetPuntosEquiposLiga(ligaId);
    }
    await insertJornadasForLigaParejasFijasPlayoffs(
      ligaId,
      detalle.equipos,
      detalle.canchas_disponibles
    );
  } else if (isParejasFijasLegacy(detalle.modalidad)) {
    validateEquiposParaCalendario(detalle.equipos.length);
    await deleteAllJornadasLiga(ligaId);

    if (options?.resetPuntos) {
      await resetPuntosEquiposLiga(ligaId);
    }

    await insertJornadasForLigaParejasFijas(
      ligaId,
      detalle.equipos,
      detalle.vueltas,
      detalle.canchas_disponibles
    );
  } else {
    const playerIds = detalle.inscripciones.map((i) => i.jugador_id);

    validateInscripcionesParaCalendario(playerIds.length);
    await deleteAllJornadasLiga(ligaId);

    if (options?.resetPuntos) {
      await resetPuntosLiga(ligaId);
    }

    await insertJornadasForLiga(ligaId, playerIds);
  }

  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("ligas")
    .update({
      estado: "in_progress",
      fecha_inicio: detalle.fecha_inicio ?? today,
      fecha_fin: null,
    })
    .eq("id", ligaId);

  if (error) throw new Error(error.message);
}

async function enrichLigaJugadoresWithCategoria(
  organizadorId: string,
  jugadores: LigaJugador[]
): Promise<LigaJugadorPoolItem[]> {
  const { data, error } = await supabase
    .from("riviera_jugadores")
    .select("id, categoria, legacy_liga_jugador_id, foto_url")
    .eq("organizador_id", organizadorId)
    .neq("estado", "archivado");

  if (error) {
    console.warn("enrichLigaJugadoresWithCategoria:", error.message);
    return jugadores.map((j) => ({
      ...j,
      categoria: null,
      riviera_id: null,
      foto_url: null,
    }));
  }

  const byLigaId = new Map<
    string,
    {
      categoria: RivieraJugadorCategoria | null;
      rivieraJugadorId: string;
      foto_url: string | null;
    }
  >();

  for (const row of data ?? []) {
    if (!row.legacy_liga_jugador_id || !row.id) continue;
    const ligaId = String(row.legacy_liga_jugador_id);
    const rivieraJugadorId = String(row.id);
    const cat = (row.categoria as RivieraJugadorCategoria | null) ?? null;
    const foto =
      typeof row.foto_url === "string" && row.foto_url.trim()
        ? row.foto_url.trim()
        : null;
    const prev = byLigaId.get(ligaId);
    if (!prev || (cat && !prev.categoria)) {
      byLigaId.set(ligaId, {
        categoria: cat,
        rivieraJugadorId,
        foto_url: foto,
      });
    } else if (!prev.foto_url && foto) {
      byLigaId.set(ligaId, { ...prev, foto_url: foto });
    }
  }

  const rivieraJugadorIds = Array.from(
    new Set(
      Array.from(byLigaId.values()).map((m) => m.rivieraJugadorId)
    )
  );

  let rivieraIdByJugador = new Map<string, string>();
  if (rivieraJugadorIds.length > 0) {
    try {
      const { fetchRivieraIdMapForJugadorIds } = await import(
        "../lib/rivieraJugadores/rivieraIdDisplay"
      );
      rivieraIdByJugador = await fetchRivieraIdMapForJugadorIds(
        rivieraJugadorIds,
        { ensureLimit: Math.min(40, rivieraJugadorIds.length) }
      );
    } catch (e) {
      console.warn("enrichLigaJugadoresWithCategoria riviera_id:", e);
    }
  }

  return jugadores.map((j) => {
    const meta = byLigaId.get(j.id);
    const riviera_id = meta
      ? rivieraIdByJugador.get(meta.rivieraJugadorId) ?? null
      : null;
    return {
      ...j,
      categoria: meta?.categoria ?? null,
      riviera_id,
      foto_url: meta?.foto_url ?? null,
    };
  });
}

/**
 * Pool de jugadores disponibles para gestionar una liga.
 *
 * No bloquea en la reconciliación con el registro Riviera: devuelve de
 * inmediato el pool ya calculado (lectura bulk, sin N+1) y, si hace falta
 * sincronizar algo, la escritura corre en segundo plano. Pasa
 * `onBackgroundSync` para refrescar la UI cuando esa sincronización termine
 * (p. ej. un jugador recién agregado al registro que aún no tenía fila en
 * `liga_jugadores`).
 */
export async function getJugadoresOrganizador(
  onBackgroundSync?: (pool: LigaJugadorPoolItem[]) => void
): Promise<LigaJugadorPoolItem[]> {
  const uid = await requireUserId();
  const { loadOrganizadorLigaJugadoresPool } = await import(
    "../lib/rivieraJugadores/playerPoolSync"
  );

  const withCategoria = async (
    rows: Awaited<ReturnType<typeof loadOrganizadorLigaJugadoresPool>>
  ): Promise<LigaJugadorPoolItem[]> => {
    if (!rows.length) return [];
    const deduped = dedupeLigaJugadoresById(rows);
    return enrichLigaJugadoresWithCategoria(uid, deduped);
  };

  const rows = await loadOrganizadorLigaJugadoresPool(uid, {
    onBackgroundSync: onBackgroundSync
      ? (updatedRows) => {
          // Cadena separada de la promesa principal (fire-and-forget): sin
          // este catch, un error de enrichLigaJugadoresWithCategoria acá
          // quedaría como rechazo no manejado — no debe romper nada, solo
          // registrarse.
          void withCategoria(updatedRows)
            .then(onBackgroundSync)
            .catch((e) => {
              console.warn(
                "getJugadoresOrganizador: error al refrescar el pool en segundo plano",
                e
              );
            });
        }
      : undefined,
  });

  return withCategoria(rows);
}

export async function inscribirJugador(
  ligaId: string,
  jugadorId: string
): Promise<void> {
  const uid = await requireUserId();

  const { data: liga, error: lErr } = await supabase
    .from("ligas")
    .select("organizador_id")
    .eq("id", ligaId)
    .maybeSingle();

  if (lErr) throw new Error(lErr.message);
  if (!liga || liga.organizador_id !== uid) {
    throw new Error("No tienes permiso para inscribir en esta liga.");
  }

  const { assertLigaJugadoresDelOrganizador } = await import(
    "../lib/rivieraJugadores/playerPoolSync"
  );
  await assertLigaJugadoresDelOrganizador(uid, [jugadorId]);

  const { data: existing } = await supabase
    .from("liga_inscripciones")
    .select("id")
    .eq("liga_id", ligaId)
    .eq("jugador_id", jugadorId)
    .maybeSingle();

  if (existing) {
    throw new Error("Este jugador ya está inscrito en la liga.");
  }

  const { error } = await supabase.from("liga_inscripciones").insert({
    liga_id: ligaId,
    jugador_id: jugadorId,
  });

  if (error) throw new Error(error.message);

  fireLigaInscripcionRankingSync(ligaId, jugadorId, uid);
}

export async function desinscribirJugador(
  ligaId: string,
  jugadorId: string
): Promise<void> {
  await requireUserId();
  const { error } = await supabase
    .from("liga_inscripciones")
    .delete()
    .eq("liga_id", ligaId)
    .eq("jugador_id", jugadorId);

  if (error) throw new Error(error.message);
}

export async function startLiga(ligaId: string): Promise<void> {
  const uid = await requireUserId();

  const detalle = await getLigaById(ligaId);
  if (detalle.estado === "completed") {
    throw new Error("La liga está finalizada. Usa «Reiniciar liga» primero.");
  }
  if (detalle.jornadas.length > 0) {
    throw new Error(
      "Ya hay jornadas generadas. Usa «Regenerar calendario» si cambiaste inscritos."
    );
  }

  if (isParejasFijasPlayoffs(detalle.modalidad)) {
    validateEquiposParaPlayoffsCalendario(detalle.equipos.length);
    await insertJornadasForLigaParejasFijasPlayoffs(
      ligaId,
      detalle.equipos,
      detalle.canchas_disponibles
    );
  } else if (isParejasFijasLegacy(detalle.modalidad)) {
    validateEquiposParaCalendario(detalle.equipos.length);
    await insertJornadasForLigaParejasFijas(
      ligaId,
      detalle.equipos,
      detalle.vueltas,
      detalle.canchas_disponibles
    );
  } else {
    const playerIds = detalle.inscripciones.map((i) => i.jugador_id);
    await insertJornadasForLiga(ligaId, playerIds);
  }

  const today = new Date().toISOString().slice(0, 10);
  const { error: uErr } = await supabase
    .from("ligas")
    .update({ estado: "in_progress", fecha_inicio: today })
    .eq("id", ligaId);

  if (uErr) throw new Error(uErr.message);

  const participantIds = collectLigaParticipantLegacyJugadorIds(detalle);
  void ensureLigaInscripcionRankingForLiga(ligaId, detalle.organizador_id ?? uid, participantIds);
}

type PartidoJornadaInsert = {
  jornada_id: string;
  pareja1_id: string;
  pareja2_id: string;
  ronda: number;
  cancha: number;
  estado: "upcoming" | "in_progress";
  score_pareja1: null;
  score_pareja2: null;
};

/** Uso acumulado de cada pareja por cancha (índice 0 = cancha 1). */
function getUsoCanchas(
  uso: Map<string, number[]>,
  parejaId: string,
  numCanchas: number
): number[] {
  let arr = uso.get(parejaId);
  if (!arr) {
    arr = Array(numCanchas).fill(0);
    uso.set(parejaId, arr);
  }
  return arr;
}

/** Elige cancha libre donde las dos parejas menos hayan jugado; rota en empates. */
function elegirCanchaRotando(
  enf: { p1: string; p2: string },
  canchasOcupadasEnRonda: Set<number>,
  usoPorPareja: Map<string, number[]>,
  ultimaCancha: Map<string, number>,
  numCanchas: number,
  ronda: number
): number {
  const candidatas: { cancha: number; score: number }[] = [];

  for (let c = 1; c <= numCanchas; c++) {
    if (canchasOcupadasEnRonda.has(c)) continue;
    const u1 = getUsoCanchas(usoPorPareja, enf.p1, numCanchas);
    const u2 = getUsoCanchas(usoPorPareja, enf.p2, numCanchas);
    candidatas.push({ cancha: c, score: u1[c - 1] + u2[c - 1] });
  }

  if (candidatas.length === 0) {
    throw new Error("No hay cancha libre en esta ronda.");
  }

  const minScore = Math.min(...candidatas.map((x) => x.score));
  const mejores = candidatas.filter((x) => x.score === minScore);

  mejores.sort((a, b) => {
    const ultA1 = ultimaCancha.get(enf.p1);
    const ultA2 = ultimaCancha.get(enf.p2);
    const repA =
      (ultA1 === a.cancha ? 1 : 0) + (ultA2 === a.cancha ? 1 : 0);
    const repB =
      (ultA1 === b.cancha ? 1 : 0) + (ultA2 === b.cancha ? 1 : 0);
    if (repA !== repB) return repA - repB;
    const rotA = (a.cancha + ronda) % numCanchas;
    const rotB = (b.cancha + ronda) % numCanchas;
    return rotA - rotB;
  });

  return mejores[0].cancha;
}

function registrarCanchaPareja(
  parejaId: string,
  cancha: number,
  usoPorPareja: Map<string, number[]>,
  ultimaCancha: Map<string, number>,
  numCanchas: number
): void {
  const u = getUsoCanchas(usoPorPareja, parejaId, numCanchas);
  u[cancha - 1] += 1;
  ultimaCancha.set(parejaId, cancha);
}

/** Todos contra todos; rondas con máx. canchas simultáneas; rotación de cancha por pareja. */
function generarPartidosJornada(
  jornadaId: string,
  parejas: { id: string }[],
  canchasDisponibles: number
): PartidoJornadaInsert[] {
  const todos: { p1: string; p2: string }[] = [];
  for (let i = 0; i < parejas.length; i++) {
    for (let j = i + 1; j < parejas.length; j++) {
      todos.push({ p1: parejas[i].id, p2: parejas[j].id });
    }
  }

  const partidos: PartidoJornadaInsert[] = [];
  const pendientes = [...todos];
  const usoPorPareja = new Map<string, number[]>();
  const ultimaCancha = new Map<string, number>();
  let ronda = 1;
  const maxIter = todos.length * parejas.length + 10;

  while (pendientes.length > 0) {
    const usadosEnRonda = new Set<string>();
    const estaRonda: { p1: string; p2: string }[] = [];
    const sobran: { p1: string; p2: string }[] = [];

    for (const enf of pendientes) {
      const cabe =
        estaRonda.length < canchasDisponibles &&
        !usadosEnRonda.has(enf.p1) &&
        !usadosEnRonda.has(enf.p2);

      if (cabe) {
        estaRonda.push(enf);
        usadosEnRonda.add(enf.p1);
        usadosEnRonda.add(enf.p2);
      } else {
        sobran.push(enf);
      }
    }

    if (estaRonda.length === 0 && sobran.length > 0) {
      throw new Error(
        "No se pudo armar el calendario de partidos con las canchas disponibles."
      );
    }

    const canchasOcupadasEnRonda = new Set<number>();

    for (const enf of estaRonda) {
      const cancha = elegirCanchaRotando(
        enf,
        canchasOcupadasEnRonda,
        usoPorPareja,
        ultimaCancha,
        canchasDisponibles,
        ronda
      );
      canchasOcupadasEnRonda.add(cancha);
      registrarCanchaPareja(enf.p1, cancha, usoPorPareja, ultimaCancha, canchasDisponibles);
      registrarCanchaPareja(enf.p2, cancha, usoPorPareja, ultimaCancha, canchasDisponibles);

      partidos.push({
        jornada_id: jornadaId,
        pareja1_id: enf.p1,
        pareja2_id: enf.p2,
        ronda,
        cancha,
        estado: ronda === 1 ? "in_progress" : "upcoming",
        score_pareja1: null,
        score_pareja2: null,
      });
    }

    pendientes.length = 0;
    pendientes.push(...sobran);
    ronda += 1;

    if (ronda > maxIter) {
      throw new Error("Error al distribuir partidos en rondas.");
    }
  }

  return partidos;
}

export async function startJornada(jornadaId: string): Promise<void> {
  await requireUserId();

  const { data: jornada, error: jErr } = await supabase
    .from("liga_jornadas")
    .select("*, liga:ligas(*)")
    .eq("id", jornadaId)
    .maybeSingle();

  if (jErr) throw new Error(jErr.message);
  if (!jornada) throw new Error("Jornada no encontrada.");
  if (jornada.estado !== "upcoming") {
    throw new Error("Esta jornada ya fue iniciada o finalizada.");
  }

  const ligaRow = jornada.liga as {
    canchas_disponibles?: number;
    modalidad?: string;
  };
  const modalidad = parseLigaModalidad(ligaRow?.modalidad);

  if (isEquiposModalidad(modalidad)) {
    const { data: existing, error: exErr } = await supabase
      .from("liga_partidos")
      .select("id")
      .eq("jornada_id", jornadaId);

    if (exErr) throw new Error(exErr.message);
    if (!existing?.length) {
      throw new Error("No hay partidos programados para esta jornada.");
    }

    const { error: actErr } = await supabase
      .from("liga_partidos")
      .update({ estado: "in_progress" })
      .eq("jornada_id", jornadaId)
      .eq("estado", "upcoming");

    if (actErr) throw new Error(actErr.message);

    const { error: uErr } = await supabase
      .from("liga_jornadas")
      .update({ estado: "in_progress" })
      .eq("id", jornadaId);

    if (uErr) throw new Error(uErr.message);
    return;
  }

  const { data: parejas, error: pErr } = await supabase
    .from("liga_jornada_parejas")
    .select("id")
    .eq("jornada_id", jornadaId);

  if (pErr) throw new Error(pErr.message);
  if (!parejas || parejas.length < 3) {
    throw new Error(
      "Se necesitan al menos 3 parejas en la jornada para iniciarla."
    );
  }

  const canchas = Math.max(1, Number(ligaRow?.canchas_disponibles ?? 3));

  const { data: existing } = await supabase
    .from("liga_partidos")
    .select("id")
    .eq("jornada_id", jornadaId)
    .limit(1);

  if (existing?.length) {
    throw new Error("Esta jornada ya tiene partidos generados.");
  }

  const rows = generarPartidosJornada(
    jornadaId,
    parejas.map((p) => ({ id: String(p.id) })),
    canchas
  );

  const { error: insErr } = await supabase.from("liga_partidos").insert(rows);
  if (insErr) throw new Error(insErr.message);

  const { error: uErr } = await supabase
    .from("liga_jornadas")
    .update({ estado: "in_progress" })
    .eq("id", jornadaId);

  if (uErr) throw new Error(uErr.message);
}

export interface LigaScoreConflict {
  scorePareja1: number | null;
  scorePareja2: number | null;
}

/** Error explícito cuando el partido ya tiene un resultado distinto guardado por otro proceso. */
export class LigaScoreConflictError extends Error {
  readonly code = "conflict" as const;
  readonly current: LigaScoreConflict;

  constructor(current: LigaScoreConflict) {
    super(
      `Este partido ya tiene resultado (${current.scorePareja1 ?? "?"}-${current.scorePareja2 ?? "?"}). ` +
        "Recarga para revisar el marcador actual antes de sobrescribir."
    );
    this.name = "LigaScoreConflictError";
    this.current = current;
  }
}

interface UpdateLigaPartidoScoreRpcResult {
  ok: boolean;
  status?: "updated" | "unchanged";
  error?: string;
  partido_id?: string;
  jornada_id?: string;
  ronda?: number;
  score_pareja1?: number | null;
  score_pareja2?: number | null;
}

export async function updateScore(
  partidoId: string,
  score1: number,
  score2: number,
  force = false
): Promise<void> {
  const organizadorId = await requireUserId();

  const { data, error: rpcErr } = await supabase.rpc(
    "update_liga_partido_score",
    {
      p_partido_id: partidoId,
      p_score1: score1,
      p_score2: score2,
      p_force: force,
    }
  );

  if (rpcErr) throw new Error(rpcErr.message);

  const result = data as UpdateLigaPartidoScoreRpcResult | null;
  if (!result) throw new Error("Respuesta inválida del servidor.");

  if (!result.ok) {
    if (result.error === "not_found") {
      throw new Error("Partido no encontrado.");
    }
    if (result.error === "invalid_score") {
      throw new Error("Marcador inválido.");
    }
    if (result.error === "conflict") {
      throw new LigaScoreConflictError({
        scorePareja1: result.score_pareja1 ?? null,
        scorePareja2: result.score_pareja2 ?? null,
      });
    }
    throw new Error(result.error ?? "No se pudo guardar el resultado.");
  }

  // Idempotente: mismo marcador ya guardado antes — no re-disparar rating ni cascada.
  if (result.status === "unchanged") return;

  void import("../lib/rivieraJugadores/aplicarRatingPartido").then(
    ({ aplicarRatingLigaPartido }) =>
      aplicarRatingLigaPartido(partidoId, organizadorId).catch((e) =>
        console.warn("[rating] liga:", e)
      )
  );

  const jornadaId = String(result.jornada_id);
  const ronda = Number(result.ronda);

  const { data: rondaPartidos, error: rErr } = await supabase
    .from("liga_partidos")
    .select("id, estado")
    .eq("jornada_id", jornadaId)
    .eq("ronda", ronda);

  if (rErr) throw new Error(rErr.message);

  const rondaCompleta = (rondaPartidos ?? []).every(
    (p) => p.estado === "completed"
  );

  if (!rondaCompleta) return;

  const { data: nextRonda } = await supabase
    .from("liga_partidos")
    .select("id")
    .eq("jornada_id", jornadaId)
    .eq("ronda", ronda + 1)
    .limit(1);

  if (nextRonda?.length) {
    const { error: actErr } = await supabase
      .from("liga_partidos")
      .update({ estado: "in_progress" })
      .eq("jornada_id", jornadaId)
      .eq("ronda", ronda + 1)
      .eq("estado", "upcoming");

    if (actErr) throw new Error(actErr.message);
    return;
  }

  const { data: jornadaRow, error: jRowErr } = await supabase
    .from("liga_jornadas")
    .select("liga_id")
    .eq("id", jornadaId)
    .maybeSingle();

  if (jRowErr) throw new Error(jRowErr.message);

  const { data: allPartidos, error: aErr } = await supabase
    .from("liga_partidos")
    .select("estado")
    .eq("jornada_id", jornadaId);

  if (aErr) throw new Error(aErr.message);

  const jornadaLista = allPartidos ?? [];
  const jornadaCompleta =
    jornadaLista.length > 0 &&
    jornadaLista.every((p) => p.estado === "completed");

  if (jornadaCompleta && jornadaRow?.liga_id) {
    await recalcularPuntosLiga(String(jornadaRow.liga_id));
    // Await (no void): si el sync falla, el organizador ve el error al
    // guardar el último partido y puede reintentar con finishJornada /
    // resyncLigaJornadaCareer. El fire-and-forget anterior dejaba la
    // jornada completed + puntos_aplicados sin historial Riviera.
    const career = await resyncLigaJornadaCareer(jornadaId);
    if (!career.careerSyncOk) {
      console.error(
        "[riviera-jugadores] auto-sync jornada liga incompleto:",
        career.careerSyncMessage
      );
    }
  }
}

interface UpdateLigaPartidoScoreParejasFijasRpcResult {
  ok: boolean;
  status?: "updated" | "unchanged";
  error?: string;
  partido_id?: string;
  jornada_id?: string;
  score_pareja1?: number | null;
  score_pareja2?: number | null;
  set_scores?: { sets: LigaPartidoSetScore[] } | null;
}

/**
 * Resultado al mejor de 3 sets (parejas fijas): sets 1-2 normales, set 3
 * super tie-break a 10. Guardado atómico server-side (BLK-03): RPC con
 * SELECT...FOR UPDATE + ownership + detección de conflicto, mismo patrón que
 * `updateScore` (Liga rotativa) — ver
 * supabase/migrations/0002_update_liga_partido_score_parejas_fijas.sql.
 */
export async function updateScoreParejasFijas(
  partidoId: string,
  sets: LigaPartidoSetScore[],
  force = false
): Promise<{ setScoresPersisted: boolean }> {
  const organizadorId = await requireUserId();
  const totals = computeParejasFijasMatchTotals(sets);

  const { data, error: rpcErr } = await supabase.rpc(
    "update_liga_partido_score_parejas_fijas",
    {
      p_partido_id: partidoId,
      p_score1: totals.gamesP1,
      p_score2: totals.gamesP2,
      p_set_scores: { sets },
      p_force: force,
    }
  );

  if (rpcErr) throw new Error(rpcErr.message);

  const result = data as UpdateLigaPartidoScoreParejasFijasRpcResult | null;
  if (!result) throw new Error("Respuesta inválida del servidor.");

  if (!result.ok) {
    if (result.error === "not_found") {
      throw new Error("Partido no encontrado.");
    }
    if (result.error === "invalid_score") {
      throw new Error("Marcador inválido.");
    }
    if (result.error === "conflict") {
      throw new LigaScoreConflictError({
        scorePareja1: result.score_pareja1 ?? null,
        scorePareja2: result.score_pareja2 ?? null,
      });
    }
    throw new Error(result.error ?? "No se pudo guardar el resultado.");
  }

  // Idempotente: mismo marcador ya guardado antes — no re-disparar rating ni cascada.
  if (result.status === "unchanged") {
    return { setScoresPersisted: true };
  }

  void import("../lib/rivieraJugadores/aplicarRatingPartido").then(
    ({ aplicarRatingLigaPartido }) =>
      aplicarRatingLigaPartido(partidoId, organizadorId).catch((e) =>
        console.warn("[rating] liga:", e)
      )
  );

  const jornadaId = result.jornada_id ? String(result.jornada_id) : null;
  if (jornadaId) {
    const { data: jornadaRow, error: jRowErr } = await supabase
      .from("liga_jornadas")
      .select("liga_id")
      .eq("id", jornadaId)
      .maybeSingle();

    if (jRowErr) throw new Error(jRowErr.message);

    if (jornadaRow?.liga_id) {
      await recalcularPuntosLiga(String(jornadaRow.liga_id));

      const { data: allPartidos, error: aErr } = await supabase
        .from("liga_partidos")
        .select("estado")
        .eq("jornada_id", jornadaId);
      const jornadaCompleta =
        !aErr &&
        (allPartidos?.length ?? 0) > 0 &&
        (allPartidos ?? []).every((p) => p.estado === "completed");
      if (jornadaCompleta) {
        const career = await resyncLigaJornadaCareer(jornadaId);
        if (!career.careerSyncOk) {
          console.error(
            "[riviera-jugadores] auto-sync jornada liga incompleto:",
            career.careerSyncMessage
          );
        }
      }
    }
  }

  return { setScoresPersisted: true };
}

export async function updateJornadaFecha(
  jornadaId: string,
  fecha: string | null
): Promise<void> {
  await requireUserId();

  const fechaNorm = fecha?.trim() ? fecha.trim().slice(0, 10) : null;
  if (fechaNorm && !/^\d{4}-\d{2}-\d{2}$/.test(fechaNorm)) {
    throw new Error("Fecha inválida.");
  }

  const { error } = await supabase
    .from("liga_jornadas")
    .update({ fecha: fechaNorm })
    .eq("id", jornadaId);

  if (error) throw new Error(error.message);
}

export async function updatePartidoProgramacion(
  partidoId: string,
  input: { cancha?: number; hora_inicio?: string | null },
  canchasDisponibles: number
): Promise<void> {
  await requireUserId();

  const patch: { cancha?: number; hora_inicio?: string | null } = {};

  if (input.cancha != null) {
    validateCancha(input.cancha, canchasDisponibles);
    patch.cancha = input.cancha;
  }

  if (input.hora_inicio !== undefined) {
    patch.hora_inicio =
      input.hora_inicio != null && input.hora_inicio.trim()
        ? normalizeHoraInicio(input.hora_inicio)
        : null;
  }

  if (!Object.keys(patch).length) return;

  const { error } = await supabase
    .from("liga_partidos")
    .update(patch)
    .eq("id", partidoId);

  if (error) throw new Error(error.message);
}

export async function updateRondaProgramacion(
  jornadaId: string,
  ronda: number,
  input: { hora_inicio?: string | null },
  canchasDisponibles: number
): Promise<void> {
  await requireUserId();

  const { data: partidos, error: pErr } = await supabase
    .from("liga_partidos")
    .select("id, cancha")
    .eq("jornada_id", jornadaId)
    .eq("ronda", ronda);

  if (pErr) throw new Error(pErr.message);
  if (!partidos?.length) return;

  const horaNorm =
    input.hora_inicio != null && input.hora_inicio.trim()
      ? normalizeHoraInicio(input.hora_inicio)
      : null;

  for (const p of partidos) {
    const cancha = p.cancha != null ? Number(p.cancha) : undefined;
    await updatePartidoProgramacion(
      String(p.id),
      { cancha, hora_inicio: horaNorm },
      canchasDisponibles
    );
  }
}

/**
 * Guarda la hora de inicio de la jornada (referencia interna en ronda 1).
 * No hay horarios por partido en UI: rondas 2+ se limpian siempre.
 */
export async function updateJornadaHoraInicio(
  jornadaId: string,
  hora_inicio: string | null,
  canchasDisponibles: number
): Promise<void> {
  await requireUserId();

  const { data: partidos, error: pErr } = await supabase
    .from("liga_partidos")
    .select("id, cancha, ronda")
    .eq("jornada_id", jornadaId)
    .eq("ronda", 1);

  if (pErr) throw new Error(pErr.message);
  if (!partidos?.length) return;

  const horaNorm =
    hora_inicio != null && hora_inicio.trim()
      ? normalizeHoraInicio(hora_inicio)
      : null;

  for (const p of partidos) {
    const cancha = p.cancha != null ? Number(p.cancha) : undefined;
    await updatePartidoProgramacion(
      String(p.id),
      { cancha, hora_inicio: horaNorm },
      canchasDisponibles
    );
  }

  const { error: clearErr } = await supabase
    .from("liga_partidos")
    .update({ hora_inicio: null })
    .eq("jornada_id", jornadaId)
    .gt("ronda", 1);

  if (clearErr) throw new Error(clearErr.message);
}

/** @deprecated Usar updateJornadaHoraInicio (solo ronda 1). */
export async function updateJornadaHorarioPartidos(
  jornadaId: string,
  hora_inicio: string | null,
  canchasDisponibles: number
): Promise<void> {
  return updateJornadaHoraInicio(jornadaId, hora_inicio, canchasDisponibles);
}

type PartidoPuntosRow = {
  score_pareja1: number | null;
  score_pareja2: number | null;
  pareja1_id: string;
  pareja2_id: string;
  estado: string;
};

type ParejaPuntosRow = {
  id: string;
  jugador1_id: string;
  jugador2_id: string;
};

function computePuntosPorJugadorDesdePartidos(
  partidos: PartidoPuntosRow[],
  parejas: ParejaPuntosRow[]
): Map<string, number> {
  const parejaPlayers = new Map<string, { j1: string; j2: string }>();
  for (const p of parejas) {
    parejaPlayers.set(String(p.id), {
      j1: String(p.jugador1_id),
      j2: String(p.jugador2_id),
    });
  }

  const puntosPorJugador = new Map<string, number>();

  for (const m of partidos) {
    if (m.estado !== "completed") continue;
    const s1 = Number(m.score_pareja1 ?? 0);
    const s2 = Number(m.score_pareja2 ?? 0);
    const p1 = parejaPlayers.get(String(m.pareja1_id));
    const p2 = parejaPlayers.get(String(m.pareja2_id));
    if (p1) {
      puntosPorJugador.set(p1.j1, (puntosPorJugador.get(p1.j1) ?? 0) + s1);
      puntosPorJugador.set(p1.j2, (puntosPorJugador.get(p1.j2) ?? 0) + s1);
    }
    if (p2) {
      puntosPorJugador.set(p2.j1, (puntosPorJugador.get(p2.j1) ?? 0) + s2);
      puntosPorJugador.set(p2.j2, (puntosPorJugador.get(p2.j2) ?? 0) + s2);
    }
  }

  return puntosPorJugador;
}

/** Recalcula el ranking acumulado desde todos los partidos completados de la liga. */
export async function recalcularPuntosLiga(ligaId: string): Promise<void> {
  await requireUserId();

  const { data: liga, error: lErr } = await supabase
    .from("ligas")
    .select("modalidad")
    .eq("id", ligaId)
    .maybeSingle();

  if (lErr) throw new Error(lErr.message);

  if (isParejasFijasLegacy(parseLigaModalidad(liga?.modalidad))) {
    await recalcularPuntosLigaEquipos(ligaId);
    return;
  }
  if (isParejasFijasPlayoffs(parseLigaModalidad(liga?.modalidad))) {
    await recalcularPuntosLigaEquiposPlayoffs(ligaId);
    return;
  }

  const { error: resetErr } = await supabase
    .from("liga_inscripciones")
    .update({ puntos: 0 })
    .eq("liga_id", ligaId);

  if (resetErr) {
    throw new Error(
      resetErr.message +
        " (¿El esquema de liga en Supabase permite actualizar puntos?)"
    );
  }

  const { data: jornadas, error: jErr } = await supabase
    .from("liga_jornadas")
    .select("id")
    .eq("liga_id", ligaId)
    .order("numero", { ascending: true });

  if (jErr) throw new Error(jErr.message);

  const jornadaIds = (jornadas ?? []).map((j) => String(j.id));
  if (jornadaIds.length === 0) return;

  // Todos los partidos y parejas de la liga en 2 lecturas en paralelo (antes:
  // 2 por jornada, secuenciales) — se agrupan en memoria por jornada_id.
  const [{ data: partidosRows, error: pErr }, { data: parejasRows, error: parErr }] =
    await Promise.all([
      supabase
        .from("liga_partidos")
        .select(
          "jornada_id, score_pareja1, score_pareja2, pareja1_id, pareja2_id, estado"
        )
        .in("jornada_id", jornadaIds),
      supabase
        .from("liga_jornada_parejas")
        .select("id, jornada_id, jugador1_id, jugador2_id")
        .in("jornada_id", jornadaIds),
    ]);

  if (pErr) throw new Error(pErr.message);
  if (parErr) throw new Error(parErr.message);

  const partidosByJornada = new Map<string, PartidoPuntosRow[]>();
  for (const row of partidosRows ?? []) {
    const jid = String((row as { jornada_id: string }).jornada_id);
    const list = partidosByJornada.get(jid) ?? [];
    list.push(row as PartidoPuntosRow);
    partidosByJornada.set(jid, list);
  }

  const parejasByJornada = new Map<string, ParejaPuntosRow[]>();
  for (const row of parejasRows ?? []) {
    const jid = String((row as { jornada_id: string }).jornada_id);
    const list = parejasByJornada.get(jid) ?? [];
    list.push(row as ParejaPuntosRow);
    parejasByJornada.set(jid, list);
  }

  const totales = new Map<string, number>();
  const completedJornadaIds: string[] = [];
  const incompleteJornadaIds: string[] = [];

  for (const jornadaId of jornadaIds) {
    const lista = partidosByJornada.get(jornadaId) ?? [];
    const jornadaCompleta =
      lista.length > 0 && lista.every((p) => p.estado === "completed");

    if (jornadaCompleta) {
      completedJornadaIds.push(jornadaId);
      const ptsJornada = computePuntosPorJugadorDesdePartidos(
        lista,
        parejasByJornada.get(jornadaId) ?? []
      );
      for (const [jugadorId, pts] of Array.from(ptsJornada.entries())) {
        totales.set(jugadorId, (totales.get(jugadorId) ?? 0) + pts);
      }
    } else {
      incompleteJornadaIds.push(jornadaId);
    }
  }

  if (completedJornadaIds.length > 0) {
    const { error: jUpErr } = await supabase
      .from("liga_jornadas")
      .update({ estado: "completed", puntos_aplicados: true })
      .in("id", completedJornadaIds);

    if (jUpErr?.message?.includes("puntos_aplicados")) {
      const { error: fallback } = await supabase
        .from("liga_jornadas")
        .update({ estado: "completed" })
        .in("id", completedJornadaIds);
      if (fallback) throw new Error(fallback.message);
    } else if (jUpErr) {
      throw new Error(jUpErr.message);
    }
  }

  if (incompleteJornadaIds.length > 0) {
    const { error: flagErr } = await supabase
      .from("liga_jornadas")
      .update({ puntos_aplicados: false })
      .in("id", incompleteJornadaIds);

    if (
      flagErr &&
      !flagErr.message.includes("puntos_aplicados") &&
      !flagErr.message.includes("column")
    ) {
      throw new Error(flagErr.message);
    }
  }

  // Escrituras independientes (1 fila cada una, valores distintos): se
  // paralelizan en vez de esperarlas una por una.
  const results = await Promise.all(
    Array.from(totales.entries()).map(([jugadorId, pts]) =>
      supabase
        .from("liga_inscripciones")
        .update({ puntos: pts })
        .eq("liga_id", ligaId)
        .eq("jugador_id", jugadorId)
    )
  );
  const firstError = results.find((r) => r.error)?.error;
  if (firstError) throw new Error(firstError.message);
}

/** Suma puntos de una jornada al ranking (recalcula toda la liga). */
export async function aplicarPuntosJornada(jornadaId: string): Promise<void> {
  await requireUserId();

  const { data: jornada, error: jErr } = await supabase
    .from("liga_jornadas")
    .select("id, liga_id")
    .eq("id", jornadaId)
    .maybeSingle();

  if (jErr) throw new Error(jErr.message);
  if (!jornada) throw new Error("Jornada no encontrada.");

  const { data: partidos, error: pErr } = await supabase
    .from("liga_partidos")
    .select("estado")
    .eq("jornada_id", jornadaId);

  if (pErr) throw new Error(pErr.message);

  const incompletos = (partidos ?? []).filter((p) => p.estado !== "completed");
  if (incompletos.length > 0 || !(partidos ?? []).length) {
    throw new Error("Completa todos los partidos antes de finalizar la jornada.");
  }

  await recalcularPuntosLiga(String(jornada.liga_id));
}

export type LigaCareerCloseResult = {
  careerSyncOk: boolean;
  careerSyncMessage?: string;
};

/**
 * Repara historial Riviera de una jornada ya cerrada sin reabrirla.
 * No recalcula ranking local — solo finalizeCareerEvent (idempotente).
 */
export async function resyncLigaJornadaCareer(
  jornadaId: string
): Promise<LigaCareerCloseResult> {
  const userId = await requireUserId();
  const { data: jornada, error: jErr } = await supabase
    .from("liga_jornadas")
    .select("liga_id, numero, estado")
    .eq("id", jornadaId)
    .maybeSingle();

  if (jErr || jornada?.liga_id == null || jornada.numero == null) {
    return {
      careerSyncOk: false,
      careerSyncMessage:
        "No se pudo localizar la jornada para sincronizar el historial.",
    };
  }

  try {
    const ligaId = String(jornada.liga_id);
    const detalle = await getLigaById(ligaId);
    await ensureLigaInscripcionRankingForLiga(
      ligaId,
      userId,
      collectLigaParticipantLegacyJugadorIds(detalle)
    );

    const { repairLigaJornadaCareerSync } = await import(
      "../lib/rivieraJugadores/repairCareerClose"
    );
    const outcome = await repairLigaJornadaCareerSync({
      organizadorId: userId,
      ligaId: String(jornada.liga_id),
      jornadaNumero: Number(jornada.numero),
    });
    if (!outcome.careerSyncOk) {
      console.error(
        "[riviera-jugadores] repair jornada de liga incompleto:",
        {
          ligaId: jornada.liga_id,
          jornadaNumero: jornada.numero,
          jornadaId,
          organizadorId: userId,
          failures: outcome.pipeline.failures,
        }
      );
    }
    return {
      careerSyncOk: outcome.careerSyncOk,
      careerSyncMessage: outcome.careerSyncMessage,
    };
  } catch (err) {
    console.error("[riviera-jugadores] repair jornada de liga:", err);
    return {
      careerSyncOk: false,
      careerSyncMessage:
        err instanceof Error
          ? err.message
          : "No se pudo sincronizar el historial Riviera de la jornada.",
    };
  }
}

/** Repara podio/carrera de una liga ya completed sin reabrir. */
export async function resyncLigaPodioCareer(
  ligaId: string
): Promise<LigaCareerCloseResult> {
  const uid = await requireUserId();
  try {
    const detalle = await getLigaById(ligaId);
    await ensureLigaInscripcionRankingForLiga(
      ligaId,
      uid,
      collectLigaParticipantLegacyJugadorIds(detalle)
    );

    const { repairLigaPodioCareerSync } = await import(
      "../lib/rivieraJugadores/repairCareerClose"
    );
    const outcome = await repairLigaPodioCareerSync({
      organizadorId: uid,
      ligaId,
    });
    if (!outcome.careerSyncOk) {
      console.error("[riviera-jugadores] repair podio liga incompleto:", {
        ligaId,
        organizadorId: uid,
        failures: outcome.pipeline.failures,
      });
    }
    return {
      careerSyncOk: outcome.careerSyncOk,
      careerSyncMessage: outcome.careerSyncMessage,
    };
  } catch (err) {
    console.error("[riviera-jugadores] repair podio liga:", err);
    return {
      careerSyncOk: false,
      careerSyncMessage:
        err instanceof Error
          ? err.message
          : "No se pudo sincronizar el historial Riviera (podio).",
    };
  }
}

export async function finishJornada(
  jornadaId: string
): Promise<LigaCareerCloseResult> {
  await aplicarPuntosJornada(jornadaId);

  // Jornada ya marcada completed en recalcularPuntosLiga; await carrera
  // (no void). Si falla → careerSyncOk=false; resyncLigaJornadaCareer repara.
  return resyncLigaJornadaCareer(jornadaId);
}

/** Borra el resultado de un partido para volver a capturarlo y recalcula ranking. */
export async function resetPartidoResult(
  partidoId: string,
  ligaId: string
): Promise<void> {
  await requireUserId();

  const { data: partido, error: fetchErr } = await supabase
    .from("liga_partidos")
    .select("id, jornada_id, estado")
    .eq("id", partidoId)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!partido) throw new Error("Partido no encontrado.");
  if (partido.estado !== "completed") return;

  const jornadaId = String(partido.jornada_id);

  const { error: updateErr } = await supabase
    .from("liga_partidos")
    .update({
      score_pareja1: null,
      score_pareja2: null,
      set_scores: null,
      estado: "in_progress",
    })
    .eq("id", partidoId);

  if (updateErr) throw new Error(updateErr.message);

  await recalcularPuntosLiga(ligaId);

  const { error: jornadaErr } = await supabase
    .from("liga_jornadas")
    .update({ estado: "in_progress", puntos_aplicados: false })
    .eq("id", jornadaId)
    .eq("estado", "completed");

  if (jornadaErr?.message?.includes("puntos_aplicados")) {
    const { error: fallback } = await supabase
      .from("liga_jornadas")
      .update({ estado: "in_progress" })
      .eq("id", jornadaId)
      .eq("estado", "completed");
    if (fallback) throw new Error(fallback.message);
  } else if (
    jornadaErr &&
    !jornadaErr.message.includes("puntos_aplicados") &&
    !jornadaErr.message.includes("column")
  ) {
    throw new Error(jornadaErr.message);
  }

  await supabase
    .from("ligas")
    .update({ estado: "in_progress", fecha_fin: null })
    .eq("id", ligaId)
    .eq("estado", "completed");
}

export async function actualizarPuntosInscripcion(
  ligaId: string,
  jugadorId: string,
  puntos: number
): Promise<void> {
  await requireUserId();

  const valor = Math.max(0, Math.round(Number(puntos)));
  if (Number.isNaN(valor)) {
    throw new Error("Puntos inválidos.");
  }

  const { error } = await supabase
    .from("liga_inscripciones")
    .update({ puntos: valor })
    .eq("liga_id", ligaId)
    .eq("jugador_id", jugadorId);

  if (error) {
    throw new Error(
      error.message +
        " (¿El esquema de liga en Supabase permite actualizar puntos?)"
    );
  }
}

export async function finishLiga(ligaId: string): Promise<LigaCareerCloseResult> {
  await requireUserId();

  const detalle = await getLigaById(ligaId);
  if (!detalle.jornadas.length) {
    throw new Error("La liga no tiene jornadas.");
  }

  // Ya completed → solo repair de carrera (no reabrir).
  if (detalle.estado === "completed") {
    return resyncLigaPodioCareer(ligaId);
  }

  const pendientes = detalle.jornadas.filter((j) => j.estado !== "completed");
  if (pendientes.length > 0) {
    throw new Error("Todas las jornadas deben estar completadas.");
  }

  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("ligas")
    .update({ estado: "completed", fecha_fin: today })
    .eq("id", ligaId);

  if (error) throw new Error(error.message);

  return resyncLigaPodioCareer(ligaId);
}

export async function getRanking(ligaId: string): Promise<RankingItem[]> {
  const { data, error } = await supabase
    .from("liga_inscripciones")
    .select("jugador_id, puntos, jugador:liga_jugadores(nombre)")
    .eq("liga_id", ligaId)
    .order("puntos", { ascending: false });

  if (error) throw new Error(error.message);

  const { data: jornadas } = await supabase
    .from("liga_jornadas")
    .select("id")
    .eq("liga_id", ligaId)
    .eq("estado", "completed");

  const jornadaIds = (jornadas ?? []).map((j) => j.id);
  const jornadasPorJugador = new Map<string, number>();

  if (jornadaIds.length > 0) {
    const { data: parejas } = await supabase
      .from("liga_jornada_parejas")
      .select("jugador1_id, jugador2_id, jornada_id")
      .in("jornada_id", jornadaIds);

    const seen = new Map<string, Set<string>>();
    for (const p of parejas ?? []) {
      for (const jid of [String(p.jugador1_id), String(p.jugador2_id)]) {
        const key = jid;
        const jSet = seen.get(key) ?? new Set();
        jSet.add(String(p.jornada_id));
        seen.set(key, jSet);
      }
    }
    Array.from(seen.entries()).forEach(([jid, set]) => {
      jornadasPorJugador.set(jid, set.size);
    });
  }

  const sorted = (data ?? []).slice().sort((a, b) => b.puntos - a.puntos);

  return sorted.map((row, idx) => {
    const jug = row.jugador as { nombre?: string } | null;
    const jugadorId = String(row.jugador_id);
    return {
      posicion: idx + 1,
      jugador_id: jugadorId,
      nombre: jug?.nombre ?? "Jugador",
      puntos: Number(row.puntos),
      jornadas_jugadas: jornadasPorJugador.get(jugadorId) ?? 0,
    };
  });
}

export function publicLigaUrl(ligaId: string): string {
  if (typeof window === "undefined") return `/public/liga/${ligaId}`;
  return `${window.location.origin}/public/liga/${ligaId}`;
}

export function publicLigaJornadaUrl(ligaId: string, numero: number): string {
  if (typeof window === "undefined") {
    return `/public/liga/${ligaId}/jornada/${numero}`;
  }
  return `${window.location.origin}/public/liga/${ligaId}/jornada/${numero}`;
}

export {
  createEquipoLiga,
  deleteEquipoLiga,
  getRankingEquipos,
} from "./ligaParejasFijasService";

export { updateScoreParejasFijasPlayoffs } from "./ligaParejasFijasPlayoffsService";

export { buildFixedPairLeagueSchedule } from "../lib/liga/fixedPairSchedule";
