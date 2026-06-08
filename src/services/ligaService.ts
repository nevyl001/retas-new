import { supabase } from "../lib/supabaseClient";
import type {
  AddJugadorLigaInput,
  CreateLigaInput,
  Liga,
  LigaDetalle,
  LigaJornada,
  LigaJornadaPareja,
  LigaJugador,
  LigaJugadorPoolItem,
  LigaPartido,
  RankingItem,
  UpdateJugadorLigaInput,
} from "../lib/liga/types";
import { validateInscripcionesParaCalendario } from "../lib/liga/calendario";
import { dedupeLigaJugadoresByName } from "../lib/liga/dedupeJugadores";
import { normalizePlayerNameKey } from "../lib/rivieraJugadores/playerNameKey";
import type { RivieraJugadorCategoria } from "../lib/rivieraJugadores/types";

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
  return {
    id: String(row.id),
    nombre: String(row.nombre),
    estado: row.estado as Liga["estado"],
    organizador_id: row.organizador_id ? String(row.organizador_id) : null,
    canchas_disponibles: Number(row.canchas_disponibles ?? 3),
    fecha_inicio: row.fecha_inicio ? String(row.fecha_inicio) : null,
    fecha_fin: row.fecha_fin ? String(row.fecha_fin) : null,
    created_at: String(row.created_at),
    inscripciones_count:
      row.inscripciones_count != null
        ? Number(row.inscripciones_count)
        : undefined,
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
  const { data: row, error } = await supabase
    .from("ligas")
    .insert({
      nombre: data.nombre.trim(),
      organizador_id: uid,
      canchas_disponibles: data.canchas_disponibles ?? 3,
      fecha_inicio: data.fecha_inicio ?? null,
      fecha_fin: data.fecha_fin ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
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
  const { data: counts, error: cErr } = await supabase
    .from("liga_inscripciones")
    .select("liga_id")
    .in("liga_id", ids);

  if (cErr) throw new Error(cErr.message);

  const countMap = new Map<string, number>();
  for (const row of counts ?? []) {
    const lid = String(row.liga_id);
    countMap.set(lid, (countMap.get(lid) ?? 0) + 1);
  }

  return ligas.map((l) =>
    mapLiga({
      ...l,
      inscripciones_count: countMap.get(String(l.id)) ?? 0,
    } as Record<string, unknown>)
  );
}

export async function getLigaById(ligaId: string): Promise<LigaDetalle> {
  const { data: liga, error: lErr } = await supabase
    .from("ligas")
    .select("*")
    .eq("id", ligaId)
    .maybeSingle();

  if (lErr) throw new Error(lErr.message);
  if (!liga) throw new Error("Liga no encontrada.");

  const [
    { data: inscripciones, error: iErr },
    { data: jornadas, error: jErr },
  ] = await Promise.all([
    supabase
      .from("liga_inscripciones")
      .select("*, jugador:liga_jugadores(*)")
      .eq("liga_id", ligaId),
    supabase
      .from("liga_jornadas")
      .select("*")
      .eq("liga_id", ligaId)
      .order("numero", { ascending: true }),
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

    parejas = (pRows ?? []).map((p) => ({
      id: String(p.id),
      jornada_id: String(p.jornada_id),
      jugador1_id: String(p.jugador1_id),
      jugador2_id: String(p.jugador2_id),
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
      cancha: m.cancha != null ? Number(m.cancha) : null,
      ronda: Number(m.ronda),
      estado: m.estado as LigaPartido["estado"],
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
    jugadores: Array.from(jugadorMap.values()),
    jornadas: jornadasDetalle,
  };
}

export async function addJugadorLiga(
  data: AddJugadorLigaInput
): Promise<LigaJugador> {
  const uid = await requireUserId();
  const nombreTrim = data.nombre.trim();
  const nameKey = normalizePlayerNameKey(nombreTrim);

  if (nameKey) {
    const { data: existingRows } = await supabase
      .from("liga_jugadores")
      .select("*")
      .eq("organizador_id", uid)
      .eq("estado", "activo");
    const match = (existingRows ?? []).find(
      (r) => normalizePlayerNameKey(String(r.nombre ?? "")) === nameKey
    );
    if (match) {
      return mapJugador(match as Record<string, unknown>);
    }
  }

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
  await requireUserId();
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

async function insertJornadasForLiga(
  ligaId: string,
  playerIds: string[]
): Promise<void> {
  validateInscripcionesParaCalendario(playerIds.length);
  const jornadasParejas = buildJornadaParejasFromPlayers(playerIds);

  for (let i = 0; i < jornadasParejas.length; i++) {
    const { data: jornada, error: jErr } = await supabase
      .from("liga_jornadas")
      .insert({
        liga_id: ligaId,
        numero: i + 1,
        estado: "upcoming",
      })
      .select("id")
      .single();

    if (jErr) throw new Error(jErr.message);

    const parejasRows = jornadasParejas[i].map((p) => ({
      jornada_id: jornada.id,
      jugador1_id: p.jugador1_id,
      jugador2_id: p.jugador2_id,
    }));

    const { error: pErr } = await supabase
      .from("liga_jornada_parejas")
      .insert(parejasRows);

    if (pErr) throw new Error(pErr.message);
  }
}

/** Elimina la liga y todos sus datos (inscripciones, jornadas, partidos). */
export async function deleteLiga(ligaId: string): Promise<void> {
  const uid = await requireUserId();

  const { data: liga, error: lErr } = await supabase
    .from("ligas")
    .select("id, organizador_id")
    .eq("id", ligaId)
    .maybeSingle();

  if (lErr) throw new Error(lErr.message);
  if (!liga) throw new Error("Liga no encontrada.");
  if (liga.organizador_id !== uid) {
    throw new Error("No tienes permiso para eliminar esta liga.");
  }

  const { data: jornadas, error: jErr } = await supabase
    .from("liga_jornadas")
    .select("id")
    .eq("liga_id", ligaId);

  if (jErr) throw new Error(jErr.message);

  const jornadaIds = (jornadas ?? []).map((j) => String(j.id));

  if (jornadaIds.length > 0) {
    const { error: partErr } = await supabase
      .from("liga_partidos")
      .delete()
      .in("jornada_id", jornadaIds);
    if (partErr) throw new Error(partErr.message);

    const { error: parejaErr } = await supabase
      .from("liga_jornada_parejas")
      .delete()
      .in("jornada_id", jornadaIds);
    if (parejaErr) throw new Error(parejaErr.message);
  }

  await deleteAllJornadasLiga(ligaId);

  const { error: inscErr } = await supabase
    .from("liga_inscripciones")
    .delete()
    .eq("liga_id", ligaId);
  if (inscErr) throw new Error(inscErr.message);

  const { error: delErr } = await supabase
    .from("ligas")
    .delete()
    .eq("id", ligaId);
  if (delErr) throw new Error(delErr.message);
}

/** Borra jornadas, puntos y vuelve la liga a «upcoming». */
export async function resetLiga(ligaId: string): Promise<void> {
  await requireUserId();
  await deleteAllJornadasLiga(ligaId);
  await resetPuntosLiga(ligaId);

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
  const playerIds = detalle.inscripciones.map((i) => i.jugador_id);

  validateInscripcionesParaCalendario(playerIds.length);
  await deleteAllJornadasLiga(ligaId);

  if (options?.resetPuntos) {
    await resetPuntosLiga(ligaId);
  }

  await insertJornadasForLiga(ligaId, playerIds);

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
    .select("categoria, legacy_liga_jugador_id, nombre")
    .eq("organizador_id", organizadorId)
    .neq("estado", "archivado");

  if (error) {
    console.warn("enrichLigaJugadoresWithCategoria:", error.message);
    return jugadores.map((j) => ({ ...j, categoria: null }));
  }

  const byLigaId = new Map<string, RivieraJugadorCategoria>();
  const byName = new Map<string, RivieraJugadorCategoria>();

  for (const row of data ?? []) {
    const cat = row.categoria as RivieraJugadorCategoria | null;
    if (!cat) continue;
    if (row.legacy_liga_jugador_id) {
      byLigaId.set(String(row.legacy_liga_jugador_id), cat);
    }
    const key = normalizePlayerNameKey(String(row.nombre ?? ""));
    if (key) byName.set(key, cat);
  }

  return jugadores.map((j) => ({
    ...j,
    categoria:
      byLigaId.get(j.id) ??
      byName.get(normalizePlayerNameKey(j.nombre)) ??
      null,
  }));
}

export async function getJugadoresOrganizador(): Promise<LigaJugadorPoolItem[]> {
  const uid = await requireUserId();
  try {
    const { syncLigaJugadoresFromRivieraRegistry } = await import(
      "../lib/rivieraJugadores/playerPoolSync"
    );
    await syncLigaJugadoresFromRivieraRegistry(uid);
  } catch (syncErr) {
    console.warn("Riviera → liga_jugadores sync skipped:", syncErr);
  }
  const { data, error } = await supabase
    .from("liga_jugadores")
    .select("*")
    .eq("organizador_id", uid)
    .eq("estado", "activo")
    .order("nombre", { ascending: true });

  if (error) throw new Error(error.message);
  const rows = (data ?? []).map((r) => mapJugador(r as Record<string, unknown>));
  const deduped = dedupeLigaJugadoresByName(rows);
  return enrichLigaJugadoresWithCategoria(uid, deduped);
}

export async function inscribirJugador(
  ligaId: string,
  jugadorId: string
): Promise<void> {
  await requireUserId();

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

  const uid = await requireUserId();
  void import("../lib/rivieraJugadores/syncParticipaciones")
    .then(({ syncLigaInscripcionRanking }) =>
      syncLigaInscripcionRanking(ligaId, jugadorId, uid)
    )
    .catch((err) =>
      console.error("[riviera-jugadores] sync inscripción liga:", err)
    );
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
  await requireUserId();

  const detalle = await getLigaById(ligaId);
  if (detalle.estado === "completed") {
    throw new Error("La liga está finalizada. Usa «Reiniciar liga» primero.");
  }
  if (detalle.jornadas.length > 0) {
    throw new Error(
      "Ya hay jornadas generadas. Usa «Regenerar calendario» si cambiaste inscritos."
    );
  }

  const playerIds = detalle.inscripciones.map((i) => i.jugador_id);
  await insertJornadasForLiga(ligaId, playerIds);

  const today = new Date().toISOString().slice(0, 10);
  const { error: uErr } = await supabase
    .from("ligas")
    .update({ estado: "in_progress", fecha_inicio: today })
    .eq("id", ligaId);

  if (uErr) throw new Error(uErr.message);
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

  const liga = jornada.liga as { canchas_disponibles?: number };
  const canchas = Math.max(1, Number(liga?.canchas_disponibles ?? 3));

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

export async function updateScore(
  partidoId: string,
  score1: number,
  score2: number,
  force = false
): Promise<void> {
  await requireUserId();

  const { data: partido, error: pErr } = await supabase
    .from("liga_partidos")
    .select("*")
    .eq("id", partidoId)
    .maybeSingle();

  if (pErr) throw new Error(pErr.message);
  if (!partido) throw new Error("Partido no encontrado.");

  if (partido.estado === "completed" && !force) {
    throw new Error(
      "Este partido ya tiene resultado. Confirma para sobrescribir."
    );
  }

  const { error: uErr } = await supabase
    .from("liga_partidos")
    .update({
      score_pareja1: score1,
      score_pareja2: score2,
      estado: "completed",
    })
    .eq("id", partidoId);

  if (uErr) throw new Error(uErr.message);

  const jornadaId = String(partido.jornada_id);
  const ronda = Number(partido.ronda);

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
  }
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

  const totales = new Map<string, number>();

  for (const j of jornadas ?? []) {
    const jornadaId = String(j.id);

    const { data: partidos, error: pErr } = await supabase
      .from("liga_partidos")
      .select(
        "score_pareja1, score_pareja2, pareja1_id, pareja2_id, estado"
      )
      .eq("jornada_id", jornadaId);

    if (pErr) throw new Error(pErr.message);

    const lista = partidos ?? [];
    const jornadaCompleta =
      lista.length > 0 && lista.every((p) => p.estado === "completed");

    if (jornadaCompleta) {
      const { data: parejas, error: parErr } = await supabase
        .from("liga_jornada_parejas")
        .select("id, jugador1_id, jugador2_id")
        .eq("jornada_id", jornadaId);

      if (parErr) throw new Error(parErr.message);

      const ptsJornada = computePuntosPorJugadorDesdePartidos(
        lista as PartidoPuntosRow[],
        (parejas ?? []) as ParejaPuntosRow[]
      );

      for (const [jugadorId, pts] of Array.from(ptsJornada.entries())) {
        totales.set(jugadorId, (totales.get(jugadorId) ?? 0) + pts);
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
    } else {
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
    }
  }

  for (const [jugadorId, pts] of Array.from(totales.entries())) {
    const { error: upErr } = await supabase
      .from("liga_inscripciones")
      .update({ puntos: pts })
      .eq("liga_id", ligaId)
      .eq("jugador_id", jugadorId);

    if (upErr) throw new Error(upErr.message);
  }
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

export async function finishJornada(jornadaId: string): Promise<void> {
  await aplicarPuntosJornada(jornadaId);

  const userId = await requireUserId();
  const { data: jornada, error: jErr } = await supabase
    .from("liga_jornadas")
    .select("liga_id, numero")
    .eq("id", jornadaId)
    .maybeSingle();

  if (!jErr && jornada?.liga_id != null && jornada.numero != null) {
    // Registro Riviera Open: una participación por jugador y jornada.
    void import("../lib/rivieraJugadores/syncParticipaciones")
      .then(({ syncLigaJornada }) =>
        syncLigaJornada(
          String(jornada.liga_id),
          Number(jornada.numero),
          userId
        )
      )
      .catch((err) =>
        console.error(
          "[riviera-jugadores] sync tras finalizar jornada de liga:",
          err
        )
      );
  }
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

export async function finishLiga(ligaId: string): Promise<void> {
  await requireUserId();

  const detalle = await getLigaById(ligaId);
  if (!detalle.jornadas.length) {
    throw new Error("La liga no tiene jornadas.");
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

  const uid = await requireUserId();
  void import("../lib/rivieraJugadores/syncParticipaciones")
    .then(({ syncLigaFinalPodio }) => syncLigaFinalPodio(ligaId, uid))
    .catch((err) =>
      console.error("[riviera-jugadores] sync podio final liga:", err)
    );
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
