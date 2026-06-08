import { supabase } from "../supabaseClient";
import type {
  CreateRivieraJugadorInput,
  JugadorParticipacion,
  JugadorStats,
  RegistrarParticipacionParams,
  RivieraJugador,
  RivieraJugadorCategoria,
  RivieraJugadorNivel,
  RivieraJugadorWithStats,
} from "./types";
import { normalizePaisCodigo } from "./paises";
import { slugifyJugadorNombre, ensureUniqueSlug } from "./slug";

const JUGADOR_SELECT =
  "id,nombre,slug,foto_url,email,telefono,whatsapp,nivel,categoria,edad,mano_dominante,en_cancha,pais_codigo,instagram_url,facebook_url,tiktok_url,visible_publico,genero,fecha_nacimiento,club,organizador_id,estado,legacy_player_id,legacy_liga_jugador_id,created_at,updated_at";

const STATS_SELECT =
  "jugador_id,total_partidos,victorias,derrotas,empates,participaciones_solo,pct_victorias,total_retas,total_torneos_express,total_ligas,total_americanos,sets_favor_total,sets_contra_total,racha_actual,ultima_actividad,puntos_totales,updated_at";

function normalizeStatsJoin(
  stats: JugadorStats | JugadorStats[] | null | undefined
): JugadorStats | null {
  if (!stats) return null;
  if (Array.isArray(stats)) return stats[0] ?? null;
  return stats;
}

const NIVEL_TO_CATEGORIA: Record<RivieraJugadorNivel, RivieraJugadorCategoria> = {
  élite: "open",
  competición: "1ra_fuerza",
  avanzado: "2da_fuerza",
  intermedio: "3ra_fuerza",
  iniciación: "4ta_fuerza",
};

function normalizeJugadorFields(
  raw: Record<string, unknown>
): RivieraJugador {
  const j = raw as unknown as RivieraJugador;
  if (!j.categoria && j.nivel) {
    j.categoria = NIVEL_TO_CATEGORIA[j.nivel] ?? "3ra_fuerza";
  }
  if (j.visible_publico === undefined) {
    j.visible_publico = true;
  }
  if (j.tiktok_url === undefined) {
    j.tiktok_url = null;
  }
  if (j.en_cancha === undefined) {
    j.en_cancha = null;
  }
  if (j.pais_codigo === undefined) {
    j.pais_codigo = null;
  }
  return j;
}

function mapJugadorRow(row: Record<string, unknown>): RivieraJugadorWithStats {
  const { stats, ...rest } = row;
  const jugador = normalizeJugadorFields(rest);
  const st = normalizeStatsJoin(stats as JugadorStats | JugadorStats[] | null);
  if (st && st.puntos_totales === undefined) {
    (st as JugadorStats).puntos_totales = 0;
  }
  return {
    ...jugador,
    stats: st,
  };
}

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    msg.includes("riviera_jugadores") ||
    msg.includes("does not exist")
  );
}

export async function listRivieraJugadores(
  organizadorId: string,
  opts?: { search?: string; nivel?: string; activosRecientes?: boolean }
): Promise<RivieraJugadorWithStats[]> {
  let q = supabase
    .from("riviera_jugadores")
    .select(`${JUGADOR_SELECT}, stats:jugador_stats(${STATS_SELECT})`)
    .eq("organizador_id", organizadorId)
    .neq("estado", "archivado")
    .order("nombre");

  if (opts?.search?.trim()) {
    q = q.ilike("nombre", `%${opts.search.trim()}%`);
  }
  if (opts?.nivel) {
    q = q.eq("categoria", opts.nivel);
  }

  const { data, error } = await q;
  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }

  let rows = (data ?? []).map((row) =>
    mapJugadorRow(row as Record<string, unknown>)
  );
  if (opts?.activosRecientes) {
    rows = [...rows].sort((a, b) => {
      const da = a.stats?.ultima_actividad ?? "";
      const db = b.stats?.ultima_actividad ?? "";
      return db.localeCompare(da);
    });
  }
  return rows;
}

export async function getRivieraJugadorBySlug(
  organizadorId: string,
  slug: string
): Promise<RivieraJugadorWithStats | null> {
  const { data, error } = await supabase
    .from("riviera_jugadores")
    .select(`${JUGADOR_SELECT}, stats:jugador_stats(${STATS_SELECT})`)
    .eq("organizador_id", organizadorId)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
  return data ? mapJugadorRow(data as Record<string, unknown>) : null;
}

export async function getRivieraJugadorByLegacyLigaId(
  legacyLigaJugadorId: string
): Promise<RivieraJugador | null> {
  const { data, error } = await supabase
    .from("riviera_jugadores")
    .select(JUGADOR_SELECT)
    .eq("legacy_liga_jugador_id", legacyLigaJugadorId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
  return (data as RivieraJugador | null) ?? null;
}

export async function getRivieraJugadorByLegacyPlayerId(
  legacyPlayerId: string,
  organizadorId?: string
): Promise<RivieraJugador | null> {
  let q = supabase
    .from("riviera_jugadores")
    .select(JUGADOR_SELECT)
    .eq("legacy_player_id", legacyPlayerId);
  if (organizadorId?.trim()) {
    q = q.eq("organizador_id", organizadorId.trim());
  }
  const { data, error } = await q.maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
  return (data as RivieraJugador | null) ?? null;
}

export async function slugExistsForOrg(
  organizadorId: string,
  slug: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("riviera_jugadores")
    .select("id")
    .eq("organizador_id", organizadorId)
    .eq("slug", slug)
    .maybeSingle();
  if (error && isMissingTableError(error)) return false;
  if (error) throw error;
  return !!data;
}

export async function createRivieraJugador(
  organizadorId: string,
  input: CreateRivieraJugadorInput
): Promise<RivieraJugador> {
  const baseSlug = slugifyJugadorNombre(input.nombre);
  const slug = await ensureUniqueSlug(baseSlug, (s) =>
    slugExistsForOrg(organizadorId, s)
  );

  const { data, error } = await supabase
    .from("riviera_jugadores")
    .insert({
      nombre: input.nombre.trim(),
      slug,
      email: input.email ?? null,
      telefono: input.telefono ?? null,
      whatsapp: input.whatsapp ?? null,
      nivel: input.nivel ?? "intermedio",
      categoria: input.categoria ?? "open",
      edad: input.edad ?? null,
      mano_dominante: input.mano_dominante ?? null,
      en_cancha: input.en_cancha ?? null,
      pais_codigo: normalizePaisCodigo(input.pais_codigo),
      genero: input.genero ?? null,
      club: input.club ?? null,
      foto_url: input.foto_url ?? null,
      organizador_id: organizadorId,
      estado: "activo",
      visible_publico: true,
    })
    .select(JUGADOR_SELECT)
    .single();

  if (error) throw error;
  return data as RivieraJugador;
}

export async function updateRivieraJugador(
  id: string,
  updates: Partial<
    Pick<
      RivieraJugador,
      | "nombre"
      | "slug"
      | "email"
      | "telefono"
      | "whatsapp"
      | "nivel"
      | "categoria"
      | "edad"
      | "mano_dominante"
      | "en_cancha"
      | "pais_codigo"
      | "instagram_url"
      | "facebook_url"
      | "tiktok_url"
      | "visible_publico"
      | "genero"
      | "club"
      | "foto_url"
      | "estado"
    >
  >
): Promise<RivieraJugador> {
  const { data: rowMeta, error: metaErr } = await supabase
    .from("riviera_jugadores")
    .select("organizador_id, slug")
    .eq("id", id)
    .maybeSingle();

  if (metaErr) throw metaErr;
  if (!rowMeta?.organizador_id) {
    throw new Error("Jugador no encontrado.");
  }

  const organizadorId = String(rowMeta.organizador_id);
  const payload: Record<string, unknown> = { ...updates };

  if (updates.pais_codigo !== undefined) {
    payload.pais_codigo = normalizePaisCodigo(updates.pais_codigo);
  }

  if (updates.nombre !== undefined) {
    const trimmed = updates.nombre.trim();
    if (!trimmed) {
      throw new Error("El nombre del jugador es obligatorio.");
    }
    payload.nombre = trimmed;

    const baseSlug = slugifyJugadorNombre(trimmed);
    if (baseSlug !== rowMeta.slug) {
      payload.slug = await ensureUniqueSlug(baseSlug, async (candidate) => {
        const { data: taken } = await supabase
          .from("riviera_jugadores")
          .select("id")
          .eq("organizador_id", organizadorId)
          .eq("slug", candidate)
          .neq("id", id)
          .maybeSingle();
        return !!taken;
      });
    }
  }

  const { data, error } = await supabase
    .from("riviera_jugadores")
    .update(payload)
    .eq("id", id)
    .eq("organizador_id", organizadorId)
    .select(JUGADOR_SELECT)
    .single();
  if (error) throw error;

  const updated = data as RivieraJugador;
  if (updated.organizador_id) {
    const { syncRivieraJugadorToLinkedPools } = await import("./playerPoolSync");
    await syncRivieraJugadorToLinkedPools(updated.organizador_id, updated);
  }
  if (updated.visible_publico !== false && updated.estado !== "archivado") {
    await ensureRivieraJugadorVisibleEnRanking(updated.id);
  }
  return updated;
}

/** Jugadores importados de retas/americanos quedan visibles en ranking y ficha pública. */
export async function ensureRivieraJugadorVisibleEnRanking(
  jugadorId: string
): Promise<void> {
  const { error } = await supabase
    .from("riviera_jugadores")
    .update({ estado: "activo", visible_publico: true })
    .eq("id", jugadorId)
    .neq("estado", "archivado");
  if (error && !isMissingTableError(error)) {
    console.warn("ensureRivieraJugadorVisibleEnRanking:", error);
  }
}

/** Activa jugadores importados (estado invitado) que ya tienen historial o puntos. */
export async function promoteImportedRivieraJugadores(
  organizadorId: string
): Promise<number> {
  try {
    const { data: rows, error } = await supabase
      .from("riviera_jugadores")
      .select(`id, stats:jugador_stats(puntos_totales, total_partidos)`)
      .eq("organizador_id", organizadorId)
      .eq("estado", "invitado");

    if (error) {
      if (isMissingTableError(error)) return 0;
      throw error;
    }

    let count = 0;
    for (const raw of rows ?? []) {
      const row = raw as Record<string, unknown>;
      const st = normalizeStatsJoin(
        row.stats as JugadorStats | JugadorStats[] | null | undefined
      );
      const jugadorId = String(row.id ?? "");
      if (!jugadorId) continue;
      const hasStats =
        (st?.puntos_totales ?? 0) > 0 || (st?.total_partidos ?? 0) > 0;
      let hasHistorial = false;
      if (!hasStats) {
        const { count: n, error: pErr } = await supabase
          .from("jugador_participaciones")
          .select("id", { count: "exact", head: true })
          .eq("jugador_id", jugadorId);
        if (!pErr) hasHistorial = (n ?? 0) > 0;
      }
      if (hasStats || hasHistorial) {
        await ensureRivieraJugadorVisibleEnRanking(jugadorId);
        count += 1;
      }
    }
    return count;
  } catch (e) {
    console.warn("promoteImportedRivieraJugadores:", e);
    return 0;
  }
}

export async function linkLegacyPlayerId(
  rivieraJugadorId: string,
  legacyPlayerId: string
): Promise<void> {
  const { error } = await supabase
    .from("riviera_jugadores")
    .update({ legacy_player_id: legacyPlayerId })
    .eq("id", rivieraJugadorId);
  if (error) throw error;
}

export async function linkLegacyLigaJugadorId(
  rivieraJugadorId: string,
  legacyLigaJugadorId: string
): Promise<void> {
  const { error } = await supabase
    .from("riviera_jugadores")
    .update({ legacy_liga_jugador_id: legacyLigaJugadorId })
    .eq("id", rivieraJugadorId);
  if (error) throw error;
}

/** Crea o enlaza perfil Riviera al crear un player legacy */
export async function ensureRivieraJugadorForLegacyPlayer(
  organizadorId: string,
  legacyPlayer: { id: string; name: string; email?: string | null }
): Promise<RivieraJugador | null> {
  try {
    const existing = await getRivieraJugadorByLegacyPlayerId(legacyPlayer.id);
    if (existing) return existing;

    const email =
      legacyPlayer.email && !legacyPlayer.email.endsWith("@padel.local")
        ? legacyPlayer.email
        : null;

    if (email) {
      const { data: byEmail } = await supabase
        .from("riviera_jugadores")
        .select(JUGADOR_SELECT)
        .eq("organizador_id", organizadorId)
        .ilike("email", email)
        .maybeSingle();
      if (byEmail) {
        await linkLegacyPlayerId(byEmail.id, legacyPlayer.id);
        return byEmail as RivieraJugador;
      }
    }

    const created = await createRivieraJugador(organizadorId, {
      nombre: legacyPlayer.name,
      email,
    });
    await linkLegacyPlayerId(created.id, legacyPlayer.id);
    return created;
  } catch (e) {
    console.warn("ensureRivieraJugadorForLegacyPlayer:", e);
    return null;
  }
}

export async function listParticipaciones(
  jugadorId: string,
  limit = 100
): Promise<JugadorParticipacion[]> {
  const { data, error } = await supabase
    .from("jugador_participaciones")
    .select("*")
    .eq("jugador_id", jugadorId)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
  return (data ?? []) as JugadorParticipacion[];
}

export async function registrarParticipacion(
  params: RegistrarParticipacionParams
): Promise<string | null> {
  const { data, error } = await supabase.rpc("registrar_participacion_jugador", {
    p_jugador_id: params.jugadorId,
    p_tipo_evento: params.tipoEvento,
    p_evento_id: params.eventoId,
    p_evento_nombre: params.eventoNombre,
    p_pareja_con: params.parejaCon ?? null,
    p_resultado: params.resultado,
    p_sets_favor: params.setsFavor ?? 0,
    p_sets_contra: params.setsContra ?? 0,
    p_puntos_obtenidos: params.puntosObtenidos ?? 0,
    p_metadata: params.metadata ?? {},
    p_fecha: params.fecha ?? new Date().toISOString().slice(0, 10),
  });

  if (error) {
    if (isMissingTableError(error)) {
      console.warn("registrarParticipacion: tabla/RPC no disponible");
      return null;
    }
    throw error;
  }
  return data as string;
}

/** Ajuste manual de puntos de ranking (suma o resta vía participación). */
export async function adjustRankingPuntosManual(
  organizadorId: string,
  jugadorId: string,
  delta: number,
  motivo?: string
): Promise<void> {
  const n = Math.trunc(delta);
  if (!n) {
    throw new Error("Indica cuántos puntos sumar o restar (distinto de cero).");
  }
  const sign = n > 0 ? "+" : "";
  const nota = motivo?.trim();
  await registrarParticipacion({
    jugadorId,
    tipoEvento: "liga",
    eventoId: crypto.randomUUID(),
    eventoNombre: nota
      ? `Ajuste manual (${sign}${n} pts): ${nota}`
      : `Ajuste manual (${sign}${n} pts)`,
    resultado: "participación",
    puntosObtenidos: n,
    metadata: {
      subtipo: "ajuste_manual",
      delta: n,
      motivo: nota || null,
      organizador_id: organizadorId,
    },
  });
}

export async function getRivieraJugadorPublicBySlug(
  slug: string,
  organizadorId?: string | null
): Promise<RivieraJugadorWithStats | null> {
  let q = supabase
    .from("riviera_jugadores")
    .select(`${JUGADOR_SELECT}, stats:jugador_stats(${STATS_SELECT})`)
    .eq("slug", slug)
    .eq("estado", "activo")
    .or("visible_publico.eq.true,visible_publico.is.null");

  if (organizadorId) {
    q = q.eq("organizador_id", organizadorId);
  }

  const { data, error } = await q.maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
  return data ? mapJugadorRow(data as Record<string, unknown>) : null;
}

/** Ranking público por categoría (orden: más puntos, luego nombre). */
export async function listPublicJugadoresRanking(
  organizadorId: string,
  categoria: string
): Promise<RivieraJugadorWithStats[]> {
  const { data, error } = await supabase
    .from("riviera_jugadores")
    .select(`${JUGADOR_SELECT}, stats:jugador_stats(${STATS_SELECT})`)
    .eq("organizador_id", organizadorId)
    .eq("categoria", categoria)
    .eq("estado", "activo")
    .or("visible_publico.eq.true,visible_publico.is.null")
    .order("nombre");

  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }

  const rows = (data ?? []).map((row) =>
    mapJugadorRow(row as Record<string, unknown>)
  );
  return [...rows].sort((a, b) => {
    const pa = a.stats?.puntos_totales ?? 0;
    const pb = b.stats?.puntos_totales ?? 0;
    if (pb !== pa) return pb - pa;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

/** Posición # en el ranking público (empates comparten número). */
export async function getRankingPosicionEnCategoria(
  organizadorId: string,
  jugadorId: string,
  categoria: string
): Promise<number | null> {
  const { rankingPosicionEnLista } = await import("./rankingPosition");
  const list = await listPublicJugadoresRanking(organizadorId, categoria);
  return rankingPosicionEnLista(list, jugadorId);
}

/**
 * Elimina un jugador del registro Riviera y todo su historial de ranking
 * (participaciones y estadísticas). No borra retas/torneos ya jugados en `players`.
 */
export async function deleteRivieraJugador(
  organizadorId: string,
  jugadorId: string
): Promise<void> {
  const { data: row, error: fetchErr } = await supabase
    .from("riviera_jugadores")
    .select("id, legacy_liga_jugador_id")
    .eq("id", jugadorId)
    .eq("organizador_id", organizadorId)
    .maybeSingle();

  if (fetchErr) {
    if (isMissingTableError(fetchErr)) {
      throw new Error("El registro de jugadores no está disponible.");
    }
    throw fetchErr;
  }
  if (!row) {
    throw new Error("Jugador no encontrado o sin permiso para eliminarlo.");
  }

  const { error: partErr } = await supabase
    .from("jugador_participaciones")
    .delete()
    .eq("jugador_id", jugadorId);
  if (partErr && !isMissingTableError(partErr)) throw partErr;

  const { error: statsErr } = await supabase
    .from("jugador_stats")
    .delete()
    .eq("jugador_id", jugadorId);
  if (statsErr && !isMissingTableError(statsErr)) throw statsErr;

  const ligaJugadorId = (row.legacy_liga_jugador_id as string | null)?.trim();
  if (ligaJugadorId) {
    const { error: ligaErr } = await supabase
      .from("liga_inscripciones")
      .delete()
      .eq("jugador_id", ligaJugadorId);
    if (ligaErr && !isMissingTableError(ligaErr)) throw ligaErr;
  }

  const { error: delErr } = await supabase
    .from("riviera_jugadores")
    .delete()
    .eq("id", jugadorId)
    .eq("organizador_id", organizadorId);

  if (delErr) {
    if (isMissingTableError(delErr)) {
      throw new Error("No se pudo eliminar el jugador del registro.");
    }
    throw delErr;
  }
}

export async function searchRivieraJugadoresQuick(
  organizadorId: string,
  query: string,
  limit = 12
): Promise<RivieraJugador[]> {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase
    .from("riviera_jugadores")
    .select(JUGADOR_SELECT)
    .eq("organizador_id", organizadorId)
    .neq("estado", "archivado")
    .ilike("nombre", `%${q}%`)
    .order("nombre")
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
  return (data ?? []) as RivieraJugador[];
}

export type { JugadorStats };
