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
import { slugifyJugadorNombre, ensureUniqueSlug } from "./slug";

const JUGADOR_SELECT =
  "id,nombre,slug,foto_url,email,telefono,whatsapp,nivel,categoria,edad,mano_dominante,en_cancha,instagram_url,facebook_url,tiktok_url,visible_publico,genero,fecha_nacimiento,club,organizador_id,estado,legacy_player_id,legacy_liga_jugador_id,created_at,updated_at";

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
  legacyPlayerId: string
): Promise<RivieraJugador | null> {
  const { data, error } = await supabase
    .from("riviera_jugadores")
    .select(JUGADOR_SELECT)
    .eq("legacy_player_id", legacyPlayerId)
    .maybeSingle();

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
      genero: input.genero ?? null,
      club: input.club ?? null,
      foto_url: input.foto_url ?? null,
      organizador_id: organizadorId,
      estado: "activo",
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
      | "email"
      | "telefono"
      | "whatsapp"
      | "nivel"
      | "categoria"
      | "edad"
      | "mano_dominante"
      | "en_cancha"
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
  const { data, error } = await supabase
    .from("riviera_jugadores")
    .update(updates)
    .eq("id", id)
    .select(JUGADOR_SELECT)
    .single();
  if (error) throw error;
  return data as RivieraJugador;
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

export async function getRivieraJugadorPublicBySlug(
  slug: string,
  organizadorId?: string | null
): Promise<RivieraJugadorWithStats | null> {
  let q = supabase
    .from("riviera_jugadores")
    .select(`${JUGADOR_SELECT}, stats:jugador_stats(${STATS_SELECT})`)
    .eq("slug", slug)
    .eq("estado", "activo")
    .eq("visible_publico", true);

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
    .eq("visible_publico", true)
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
