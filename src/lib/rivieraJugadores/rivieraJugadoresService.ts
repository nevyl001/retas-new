import { isMissingColumnError, sanitizeUuid } from "../db/schemaHelpers";
import { supabase, supabasePublicRead } from "../supabaseClient";
import { listCareerParticipacionesPublic } from "./publicCareerLinkage";
import { RIVIERA_IDENTITY_ENSURE_ENABLED } from "../../config/careerIdentity";
import type {
  CreateRivieraJugadorInput,
  JugadorParticipacion,
  JugadorStats,
  RegistrarParticipacionParams,
  RivieraJugador,
  RivieraJugadorCategoria,
  RivieraJugadorNivel,
  RivieraJugadorWithStats,
  RatingHistorialEntry,
  RatingMovimientoPartido,
} from "./types";
import { normalizePaisCodigo } from "./paises";
import { slugifyJugadorNombre, ensureUniqueSlug } from "./slug";
import {
  isJugadorInGeneroBracket,
  type RivieraJugadorGenero,
} from "./genero";
import {
  applyGrantedSourceDisplayToJugador,
  enrichJugadorWithGlobalGrantedAccess,
  excludeRevokedGrantLocalClones,
  findGrantedAccessMetaForJugador,
  isRevokedGrantLocalJugador,
  listActiveGrantedAccessForOrganizerPublic,
  listRevokedGrantLocalJugadorIds,
  loadGrantedSourceDisplayData,
} from "./organizerPlayerAccess";
import {
  enrichJugadorConcedidoClubView,
  enrichJugadoresConcedidoClubViewBatch,
} from "./concedidoClubView";
import { filterParticipacionesForOrganizador, enrichParticipacionesOrganizadorFromEvents } from "./participacionesOrganizadorScope";
import type { RatingRpcFallbackOptions } from "./ratingRpcErrors";
import {
  mergeJugadorStatsPuntosTotales,
  rankingPuntosJugador,
  sortJugadoresByClubLocalPuntos,
} from "./rankingPosition";
import { enrichJugadoresOrganizerScopedStats } from "./organizerScopedStats";
import {
  registerJugadorImportBlocklist,
  isJugadorImportBlocked,
} from "./jugadorImportBlocklist";
import { computeJugadorStatsFromParticipaciones } from "./rebuildJugadorStats";
import {
  enrichJugadorWithRivieraId,
  enrichJugadoresWithRivieraId,
} from "./rivieraIdDisplay";

const JUGADOR_SELECT_BASE =
  "id,nombre,slug,foto_url,email,telefono,whatsapp,nivel,categoria,edad,mano_dominante,en_cancha,pais_codigo,instagram_url,facebook_url,tiktok_url,visible_publico,suma_ranking,genero,fecha_nacimiento,club,organizador_id,estado,legacy_player_id,legacy_liga_jugador_id,created_at,updated_at";

const JUGADOR_RATING_COLS = "rating,rating_partidos,rating_fiabilidad";

/** null = aún no probado; false = columnas rating no existen en riviera_jugadores */
let jugadorRatingColsInDb: boolean | null = null;

function getJugadorSelectColumns(): string {
  if (jugadorRatingColsInDb === false) return JUGADOR_SELECT_BASE;
  return `${JUGADOR_SELECT_BASE},${JUGADOR_RATING_COLS}`;
}

function isMissingRatingColumnError(
  error: { code?: string; message?: string } | null
): boolean {
  return (
    isMissingColumnError(error, "riviera_jugadores", "rating") ||
    isMissingColumnError(error, "riviera_jugadores", "rating_partidos") ||
    isMissingColumnError(error, "riviera_jugadores", "rating_fiabilidad")
  );
}

type SupabaseResult<T> = {
  data: T;
  error: { code?: string; message?: string } | null;
};

async function withJugadorSelectFallback<T>(
  run: (selectCols: string) => PromiseLike<SupabaseResult<T>>
): Promise<SupabaseResult<T>> {
  if (jugadorRatingColsInDb === false) {
    return run(JUGADOR_SELECT_BASE);
  }
  const result = await run(getJugadorSelectColumns());
  if (result.error && isMissingRatingColumnError(result.error)) {
    jugadorRatingColsInDb = false;
    return run(JUGADOR_SELECT_BASE);
  }
  if (!result.error) jugadorRatingColsInDb = true;
  return result;
}

const STATS_SELECT =
  "jugador_id,total_partidos,victorias,derrotas,empates,participaciones_solo,pct_victorias,total_retas,total_torneos_express,total_ligas,total_americanos,sets_favor_total,sets_contra_total,racha_actual,ultima_actividad,puntos_totales,updated_at";

function jugadorSelectWithStats(cols = getJugadorSelectColumns()): string {
  return `${cols}, stats:jugador_stats(${STATS_SELECT})`;
}

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
    j.visible_publico = false;
  }
  if (j.suma_ranking === undefined) {
    j.suma_ranking = true;
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
  const ratingRaw = raw.rating;
  const partidosRaw = raw.rating_partidos;
  const fiabRaw = raw.rating_fiabilidad;
  j.rating =
    ratingRaw != null && Number.isFinite(Number(ratingRaw))
      ? Number(ratingRaw)
      : 3.0;
  j.rating_partidos =
    partidosRaw != null && Number.isFinite(Number(partidosRaw))
      ? Number(partidosRaw)
      : 0;
  j.rating_fiabilidad =
    fiabRaw != null && Number.isFinite(Number(fiabRaw))
      ? Number(fiabRaw)
      : 0.2;
  return j;
}

export function mapJugadorRowFromService(
  row: Record<string, unknown>
): RivieraJugadorWithStats {
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

function emptyLocalJugadorStats(jugadorId: string): JugadorStats {
  return {
    jugador_id: jugadorId,
    total_partidos: 0,
    victorias: 0,
    derrotas: 0,
    empates: 0,
    participaciones_solo: 0,
    pct_victorias: 0,
    total_retas: 0,
    total_torneos_express: 0,
    total_ligas: 0,
    total_americanos: 0,
    sets_favor_total: 0,
    sets_contra_total: 0,
    racha_actual: "",
    ultima_actividad: null,
    puntos_totales: 0,
    updated_at: new Date().toISOString(),
  };
}

async function fetchSourceJugadorForGrant(
  sourceJugadorId: string
): Promise<Record<string, unknown> | null> {
  for (const client of [supabasePublicRead, supabase]) {
    const { data, error } = await client
      .from("riviera_jugadores")
      .select("*")
      .eq("id", sourceJugadorId)
      .maybeSingle();

    if (!error && data) return data as Record<string, unknown>;
    if (error && !isMissingTableError(error) && client === supabase) throw error;
  }
  return null;
}

async function enrichGrantedJugadorFromSource(
  jugador: RivieraJugadorWithStats,
  sourceJugadorId: string,
  ownerOrganizadorId?: string | null
): Promise<RivieraJugadorWithStats> {
  const display = await loadGrantedSourceDisplayData(sourceJugadorId);
  if (!display) return jugador;
  return applyGrantedSourceDisplayToJugador(
    jugador,
    display,
    ownerOrganizadorId ?? undefined
  );
}

/** Cedidos en ranking interno: stats/rating del club dueño + metadata de acceso. */
async function enrichInternalClubJugadorGrant(
  organizadorId: string,
  jugador: RivieraJugadorWithStats
): Promise<RivieraJugadorWithStats> {
  const meta = await findGrantedAccessMetaForJugador(organizadorId, jugador.id);
  if (!meta) return jugador;

  const ownerOrgId = meta.ownerOrganizadorId;
  const withMeta: RivieraJugadorWithStats = {
    ...jugador,
    concedidoPorAdmin: true,
    grantedAccess: {
      accessId: meta.accessId,
      sourceJugadorId: meta.sourceJugadorId,
      ownerOrganizadorId: ownerOrgId,
    },
  };
  return enrichJugadorConcedidoClubView(
    organizadorId,
    await enrichGrantedJugadorFromSource(
      withMeta,
      meta.sourceJugadorId,
      ownerOrgId
    )
  );
}

async function mergeGrantedJugadoresIntoRanking(
  organizadorId: string,
  categoria: string,
  genero: RivieraJugadorGenero,
  ownRows: RivieraJugadorWithStats[],
  rpcOptions?: RatingRpcFallbackOptions
): Promise<RivieraJugadorWithStats[]> {
  const revokedLocalIds = await listRevokedGrantLocalJugadorIds(organizadorId);
  const ownRowsFiltered = excludeRevokedGrantLocalClones(ownRows, revokedLocalIds);
  const grants = await listActiveGrantedAccessForOrganizerPublic(organizadorId);
  const ownById = new Map(ownRowsFiltered.map((r) => [r.id, r]));
  const merged = [...ownRowsFiltered];

  for (const grant of grants) {
    if (grant.local_jugador_id) {
      const existing = ownById.get(grant.local_jugador_id);
      if (
        !existing ||
        existing.categoria !== categoria ||
        !isJugadorInGeneroBracket(existing.genero, genero)
      ) {
        continue;
      }

      const ownerOrgId = grant.owner_organizador_id;
      existing.concedidoPorAdmin = true;
      existing.grantedAccess = {
        accessId: grant.id,
        sourceJugadorId: grant.jugador_id,
        ownerOrganizadorId: ownerOrgId,
      };
      const enriched = await enrichGrantedJugadorFromSource(
        existing,
        grant.jugador_id,
        ownerOrgId
      );
      Object.assign(existing, enriched);
      continue;
    }

    if (mergedIncludesGrantedSource(merged, grant.jugador_id)) continue;

    const source = await fetchSourceJugadorForGrant(grant.jugador_id);
    if (!source) continue;

    const categoriaRow =
      grant.local_category?.trim() ||
      String(source.categoria ?? "open");
    if (categoriaRow !== categoria) continue;

    const nombre =
      grant.local_display_name?.trim() ||
      String(source.nombre ?? "Jugador");

    const sourceId = String(source.id ?? grant.jugador_id);
    let mapped = mapJugadorRowFromService({
      ...source,
      nombre,
      categoria: categoriaRow,
      stats: emptyLocalJugadorStats(sourceId),
    });
    if (!isJugadorInGeneroBracket(mapped.genero, genero)) continue;

    mapped = await enrichGrantedJugadorFromSource(
      mapped,
      grant.jugador_id,
      grant.owner_organizador_id
    );
    mapped.concedidoPorAdmin = true;
    mapped.grantedAccess = {
      accessId: grant.id,
      sourceJugadorId: grant.jugador_id,
      ownerOrganizadorId: grant.owner_organizador_id,
    };
    merged.push(mapped);
  }

  const enriched = await enrichJugadoresConcedidoClubViewBatch(
    organizadorId,
    merged,
    rpcOptions
  );
  return sortJugadoresByClubLocalPuntos(enriched);
}

function mergedIncludesGrantedSource(
  rows: RivieraJugadorWithStats[],
  sourceJugadorId: string
): boolean {
  return rows.some(
    (row) =>
      row.id === sourceJugadorId ||
      row.grantedAccess?.sourceJugadorId === sourceJugadorId
  );
}

async function mergeGrantedJugadoresIntoList(
  organizadorId: string,
  ownRows: RivieraJugadorWithStats[],
  genero?: RivieraJugadorGenero
): Promise<RivieraJugadorWithStats[]> {
  const revokedLocalIds = await listRevokedGrantLocalJugadorIds(organizadorId);
  const grants = await listActiveGrantedAccessForOrganizerPublic(organizadorId);
  if (grants.length === 0) {
    return excludeRevokedGrantLocalClones(ownRows, revokedLocalIds);
  }

  const ownById = new Map(ownRows.map((r) => [r.id, r]));
  const merged = excludeRevokedGrantLocalClones([...ownRows], revokedLocalIds);

  for (const grant of grants) {
    if (grant.local_jugador_id) {
      const existing = ownById.get(grant.local_jugador_id);
      if (existing) {
        const ownerOrgId = grant.owner_organizador_id;
        existing.concedidoPorAdmin = true;
        existing.grantedAccess = {
          accessId: grant.id,
          sourceJugadorId: grant.jugador_id,
          ownerOrganizadorId: ownerOrgId,
        };
        const enriched = await enrichGrantedJugadorFromSource(
          existing,
          grant.jugador_id,
          ownerOrgId
        );
        Object.assign(existing, enriched);
      }
      continue;
    }

    if (mergedIncludesGrantedSource(merged, grant.jugador_id)) continue;

    const source = await fetchSourceJugadorForGrant(grant.jugador_id);
    if (!source) continue;

    const nombre =
      grant.local_display_name?.trim() ||
      String(source.nombre ?? "Jugador");
    const categoria =
      grant.local_category?.trim() ||
      String(source.categoria ?? "open");

    let mapped = mapJugadorRowFromService({
      ...source,
      nombre,
      categoria,
      stats: null,
    });

    if (genero && !isJugadorInGeneroBracket(mapped.genero, genero)) continue;

    mapped = await enrichGrantedJugadorFromSource(
      mapped,
      grant.jugador_id,
      grant.owner_organizador_id
    );
    mapped.concedidoPorAdmin = true;
    mapped.grantedAccess = {
      accessId: grant.id,
      sourceJugadorId: grant.jugador_id,
      ownerOrganizadorId: grant.owner_organizador_id,
    };
    merged.push(mapped);
  }

  merged.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return merged;
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

function isMissingRpcError(error: { code?: string; message?: string; status?: number } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.status === 404 ||
    error.code === "42883" ||
    error.code === "PGRST202" ||
    msg.includes("could not find the function") ||
    msg.includes("riviera_jugador_interno") ||
    msg.includes("riviera_participaciones_interno") ||
    msg.includes("riviera_list_career_participaciones_public") ||
    msg.includes("get_public_career_jugador_ids") ||
    msg.includes("riviera_ranking_interno") ||
    msg.includes("refresh_jugador_stats")
  );
}

function isRlsPolicyError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return error.code === "42501" || msg.includes("row-level security");
}

async function fetchInternalClubJugadorRow(
  organizadorId: string,
  opts: { slug?: string; jugadorId?: string }
): Promise<RivieraJugadorWithStats | null> {
  const trimmedOrg = organizadorId.trim();
  const rpcName = opts.jugadorId
    ? "riviera_jugador_interno_por_id"
    : "riviera_jugador_interno_por_slug";
  const rpcParams = opts.jugadorId
    ? { p_organizador_id: trimmedOrg, p_jugador_id: opts.jugadorId.trim() }
    : { p_organizador_id: trimmedOrg, p_slug: (opts.slug ?? "").trim() };

  const { data, error } = await supabasePublicRead.rpc(rpcName, rpcParams);
  if (!error && data) {
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    const mapped = mapInternalClubJugadorRow(row as Record<string, unknown>);
    if (await isRevokedGrantLocalJugador(trimmedOrg, mapped.id)) return null;
    return enrichInternalClubJugadorGrant(trimmedOrg, mapped);
  }
  if (error && !isMissingRpcError(error) && !isMissingTableError(error)) {
    const { data: authData, error: authError } = await supabase.rpc(
      rpcName,
      rpcParams
    );
    if (!authError && authData) {
      const row = Array.isArray(authData) ? authData[0] : authData;
      if (!row) return null;
      const mapped = mapInternalClubJugadorRow(row as Record<string, unknown>);
      if (await isRevokedGrantLocalJugador(trimmedOrg, mapped.id)) return null;
      return enrichInternalClubJugadorGrant(trimmedOrg, mapped);
    }
    if (!isMissingRpcError(authError) && !isMissingTableError(authError)) {
      throw authError ?? error;
    }
  }

  const { data: fallbackData, error: fallbackError } =
    await withJugadorSelectFallback((cols) => {
      let q = supabasePublicRead
        .from("riviera_jugadores")
        .select(jugadorSelectWithStats(cols))
        .eq("organizador_id", trimmedOrg)
        .eq("estado", "activo");

      if (opts.jugadorId) {
        q = q.eq("id", opts.jugadorId.trim());
      } else {
        q = q.eq("slug", (opts.slug ?? "").trim());
      }

      return q.maybeSingle();
    });

  if (fallbackError) {
    if (isMissingTableError(fallbackError)) return null;
    throw fallbackError;
  }
  if (!fallbackData) return null;
  const mapped = mapJugadorRowFromService(
    fallbackData as unknown as Record<string, unknown>
  );
  if (await isRevokedGrantLocalJugador(trimmedOrg, mapped.id)) return null;
  return enrichInternalClubJugadorGrant(trimmedOrg, mapped);
}

/** Cedido sin perfil local en el club: ficha por ID del jugador origen. */
async function fetchGrantedJugadorForInternalClub(
  organizadorId: string,
  jugadorId: string
): Promise<RivieraJugadorWithStats | null> {
  const trimmedId = jugadorId.trim();
  const meta = await findGrantedAccessMetaForJugador(organizadorId, trimmedId);
  if (!meta) return null;

  if (
    meta.localJugadorId &&
    meta.sourceJugadorId === trimmedId &&
    meta.localJugadorId !== trimmedId
  ) {
    return fetchInternalClubJugadorRow(organizadorId, {
      jugadorId: meta.localJugadorId,
    });
  }

  const source = await fetchSourceJugadorForGrant(meta.sourceJugadorId);
  if (!source) return null;

  const grants = await listActiveGrantedAccessForOrganizerPublic(organizadorId);
  const grant = grants.find((g) => g.id === meta.accessId);
  if (!grant) return null;

  const nombre =
    grant.local_display_name?.trim() ||
    String(source.nombre ?? "Jugador");
  const categoria =
    grant.local_category?.trim() ||
    String(source.categoria ?? "open");
  const sourceId = String(source.id ?? meta.sourceJugadorId);

  let mapped = mapJugadorRowFromService({
    ...source,
    nombre,
    categoria,
    stats: emptyLocalJugadorStats(sourceId),
  });
  mapped = await enrichGrantedJugadorFromSource(
    mapped,
    meta.sourceJugadorId,
    meta.ownerOrganizadorId
  );
  mapped.concedidoPorAdmin = true;
  mapped.grantedAccess = {
    accessId: meta.accessId,
    sourceJugadorId: meta.sourceJugadorId,
    ownerOrganizadorId: meta.ownerOrganizadorId,
  };
  return mapped;
}

export async function getRivieraJugadorInternalClubById(
  jugadorId: string,
  organizadorId: string
): Promise<RivieraJugadorWithStats | null> {
  const direct = await fetchInternalClubJugadorRow(organizadorId, { jugadorId });
  if (direct) return enrichJugadorWithRivieraId(direct, { publicRanking: true });
  const granted = await fetchGrantedJugadorForInternalClub(
    organizadorId,
    jugadorId
  );
  return granted ? enrichJugadorWithRivieraId(granted, { publicRanking: true }) : null;
}

async function fetchJugadorStatsRow(
  jugadorId: string
): Promise<JugadorStats | null> {
  const { data, error } = await supabase
    .from("jugador_stats")
    .select(STATS_SELECT)
    .eq("jugador_id", jugadorId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
  return data ? (data as JugadorStats) : null;
}

async function computeStatsFromParticipaciones(
  jugadorId: string
): Promise<JugadorStats> {
  const { data: jugadorRow } = await supabase
    .from("riviera_jugadores")
    .select("organizador_id")
    .eq("id", jugadorId)
    .maybeSingle();

  const rows = await listParticipaciones(jugadorId, 500);
  const stats = computeJugadorStatsFromParticipaciones(
    jugadorId,
    rows,
    (jugadorRow as { organizador_id?: string } | null)?.organizador_id ?? null
  );
  return {
    ...stats,
    updated_at: new Date().toISOString(),
  };
}

/** Escribe jugador_stats calculado desde participaciones (fuente de verdad). */
async function persistJugadorStats(stats: JugadorStats): Promise<JugadorStats> {
  const { error } = await supabase.from("jugador_stats").upsert(
    {
      jugador_id: stats.jugador_id,
      total_partidos: stats.total_partidos,
      victorias: stats.victorias,
      derrotas: stats.derrotas,
      empates: stats.empates,
      participaciones_solo: stats.participaciones_solo,
      pct_victorias: stats.pct_victorias,
      total_retas: stats.total_retas,
      total_torneos_express: stats.total_torneos_express,
      total_ligas: stats.total_ligas,
      total_americanos: stats.total_americanos,
      sets_favor_total: stats.sets_favor_total,
      sets_contra_total: stats.sets_contra_total,
      racha_actual: stats.racha_actual,
      ultima_actividad: stats.ultima_actividad,
      puntos_totales: stats.puntos_totales,
      updated_at: stats.updated_at,
    },
    { onConflict: "jugador_id" }
  );

  if (error) {
    if (isMissingTableError(error)) return stats;
    if (isRlsPolicyError(error)) return stats;
    console.warn("[riviera-jugadores] persist jugador_stats:", error);
  }

  return stats;
}

export async function listRivieraJugadores(
  organizadorId: string,
  opts?: {
    search?: string;
    nivel?: string;
    activosRecientes?: boolean;
    genero?: RivieraJugadorGenero;
  }
): Promise<RivieraJugadorWithStats[]> {
  const buildQuery = (selectCols: string) => {
    let q = supabase
      .from("riviera_jugadores")
      .select(jugadorSelectWithStats(selectCols))
      .eq("organizador_id", organizadorId)
      .neq("estado", "archivado")
      .order("nombre");

    if (opts?.genero === "F") {
      q = q.eq("genero", "F");
    } else if (opts?.genero === "M") {
      q = q.or("genero.eq.M,genero.is.null");
    }

    if (opts?.search?.trim()) {
      q = q.ilike("nombre", `%${opts.search.trim()}%`);
    }
    if (opts?.nivel) {
      q = q.eq("categoria", opts.nivel);
    }

    return q;
  };

  const { data, error } = await withJugadorSelectFallback((cols) =>
    buildQuery(cols)
  );
  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }

  let rows = ((data ?? []) as unknown as Record<string, unknown>[]).map(
    (row) => mapJugadorRowFromService(row)
  );
  if (opts?.genero) {
    rows = rows.filter((row) =>
      isJugadorInGeneroBracket(row.genero, opts.genero!)
    );
  }
  if (opts?.activosRecientes) {
    rows = [...rows].sort((a, b) => {
      const da = a.stats?.ultima_actividad ?? "";
      const db = b.stats?.ultima_actividad ?? "";
      return db.localeCompare(da);
    });
  }

  rows = await mergeGrantedJugadoresIntoList(organizadorId, rows, opts?.genero);

  if (opts?.search?.trim()) {
    const sq = opts.search.trim().toLowerCase();
    rows = rows.filter((r) => r.nombre.toLowerCase().includes(sq));
  }
  if (opts?.nivel) {
    rows = rows.filter((r) => r.categoria === opts.nivel);
  }

  rows = await enrichJugadoresOrganizerScopedStats(organizadorId, rows);
  return enrichJugadoresWithRivieraId(rows);
}

export async function getRivieraJugadorBySlug(
  organizadorId: string,
  slug: string
): Promise<RivieraJugadorWithStats | null> {
  const { data, error } = await withJugadorSelectFallback<
    Record<string, unknown> | null
  >((cols) =>
    supabase
      .from("riviera_jugadores")
      .select(jugadorSelectWithStats(cols))
      .eq("organizador_id", organizadorId)
      .eq("slug", slug)
      .maybeSingle()
  );

  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }

  if (data) {
    const own = mapJugadorRowFromService(data as unknown as Record<string, unknown>);
    if (await isRevokedGrantLocalJugador(organizadorId, own.id)) return null;
    return enrichJugadorWithRivieraId(
      await enrichInternalClubJugadorGrant(organizadorId, own)
    );
  }

  const { data: grantedRow, error: grantedErr } = await withJugadorSelectFallback<
    Record<string, unknown> | null
  >((cols) =>
    supabase
      .from("riviera_jugadores")
      .select(jugadorSelectWithStats(cols))
      .eq("slug", slug)
      .maybeSingle()
  );

  if (grantedErr) {
    if (isMissingTableError(grantedErr)) return null;
    throw grantedErr;
  }
  if (!grantedRow) return null;

  const ownerOrgId = String(grantedRow.organizador_id ?? "");
  if (ownerOrgId === organizadorId) return null;

  const sourceId = String(grantedRow.id ?? "");
  const meta = await findGrantedAccessMetaForJugador(organizadorId, sourceId);
  if (!meta) return null;

  const mapped = mapJugadorRowFromService(
    grantedRow as unknown as Record<string, unknown>
  );
  mapped.concedidoPorAdmin = true;
  mapped.grantedAccess = {
    accessId: meta.accessId,
    sourceJugadorId: meta.sourceJugadorId,
    ownerOrganizadorId: meta.ownerOrganizadorId,
  };
  return enrichJugadorWithRivieraId(
    await enrichGrantedJugadorFromSource(
      mapped,
      meta.sourceJugadorId,
      meta.ownerOrganizadorId
    )
  );
}

export async function getRivieraJugadorByLegacyLigaId(
  legacyLigaJugadorId: string
): Promise<RivieraJugador | null> {
  const legacyId = sanitizeUuid(legacyLigaJugadorId);
  if (!legacyId) return null;

  const { data, error } = await withJugadorSelectFallback((cols) =>
    supabase
      .from("riviera_jugadores")
      .select(cols)
      .eq("legacy_liga_jugador_id", legacyId)
      .maybeSingle()
  );

  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
  return (data as unknown as RivieraJugador | null) ?? null;
}

export interface GetRivieraJugadorByLegacyOptions {
  /** Si hay varios perfiles con el mismo legacy (origen + clon cedido), prioriza el de otro club. */
  preferExcludingOrganizadorId?: string;
}

export async function listRivieraJugadoresByLegacyPlayerId(
  legacyPlayerId: string,
  organizadorId?: string,
  limit = 20
): Promise<RivieraJugador[]> {
  const { data, error } = await withJugadorSelectFallback((cols) => {
    let q = supabase
      .from("riviera_jugadores")
      .select(cols)
      .eq("legacy_player_id", legacyPlayerId);
    if (organizadorId?.trim()) {
      q = q.eq("organizador_id", organizadorId.trim());
    }
    return q.limit(limit);
  });

  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
  return (data ?? []) as unknown as RivieraJugador[];
}

function pickRivieraJugadorByLegacy(
  rows: RivieraJugador[],
  options?: GetRivieraJugadorByLegacyOptions
): RivieraJugador | null {
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];

  const exclude = options?.preferExcludingOrganizadorId?.trim();
  if (exclude) {
    const source = rows.find((r) => r.organizador_id !== exclude);
    if (source) return source;
  }
  return rows[0];
}

export async function getRivieraJugadorByLegacyPlayerId(
  legacyPlayerId: string,
  organizadorId?: string,
  options?: GetRivieraJugadorByLegacyOptions
): Promise<RivieraJugador | null> {
  const rows = await listRivieraJugadoresByLegacyPlayerId(
    legacyPlayerId,
    organizadorId,
    organizadorId?.trim() ? 5 : 20
  );
  return pickRivieraJugadorByLegacy(rows, options);
}

export async function slugExistsForOrg(
  organizadorId: string,
  slug: string,
  genero?: RivieraJugadorGenero | null
): Promise<boolean> {
  let q = supabase
    .from("riviera_jugadores")
    .select("id")
    .eq("organizador_id", organizadorId)
    .eq("slug", slug);

  if (genero === "F") {
    q = q.eq("genero", "F");
  } else if (genero === "M") {
    q = q.or("genero.eq.M,genero.is.null");
  }

  const { data, error } = await q.maybeSingle();
  if (error && isMissingTableError(error)) return false;
  if (error) throw error;
  return !!data;
}

export async function createRivieraJugador(
  organizadorId: string,
  input: CreateRivieraJugadorInput
): Promise<RivieraJugador> {
  const baseSlug = slugifyJugadorNombre(input.nombre);
  const genero = input.genero ?? "M";
  const slug = await ensureUniqueSlug(baseSlug, (s) =>
    slugExistsForOrg(organizadorId, s, genero)
  );

  const { data, error } = await withJugadorSelectFallback((cols) =>
    supabase
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
        genero,
        club: input.club ?? null,
        foto_url: input.foto_url ?? null,
        organizador_id: organizadorId,
        estado: "activo",
        visible_publico: false,
      })
      .select(cols)
      .single()
  );

  if (error) throw error;
  const jugador = data as unknown as RivieraJugador;

  if (RIVIERA_IDENTITY_ENSURE_ENABLED) {
    const { ensureRivieraIdentity } = await import("./careerIdentity");
    void ensureRivieraIdentity(jugador.id).catch((err) => {
      console.warn("[careerIdentity] ensure after create failed:", jugador.id, err);
    });
  }

  return jugador;
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

  const { data, error } = await withJugadorSelectFallback((cols) =>
    supabase
      .from("riviera_jugadores")
      .update(payload)
      .eq("id", id)
      .eq("organizador_id", organizadorId)
      .select(cols)
      .single()
  );
  if (error) throw error;

  const updated = data as unknown as RivieraJugador;
  if (updated.organizador_id) {
    const { syncRivieraJugadorToLinkedPools } = await import("./playerPoolSync");
    await syncRivieraJugadorToLinkedPools(updated.organizador_id, updated);
  }
  if (updated.visible_publico !== false && updated.estado !== "archivado") {
    await ensureRivieraJugadorVisibleEnRanking(updated.id);
  }
  return updated;
}

/** Jugadores importados de retas/americanos quedan visibles en ranking si suma_ranking lo permite. */
export async function ensureRivieraJugadorVisibleEnRanking(
  jugadorId: string
): Promise<void> {
  const { data: row, error: readErr } = await supabase
    .from("riviera_jugadores")
    .select("suma_ranking, estado")
    .eq("id", jugadorId)
    .maybeSingle();

  if (readErr && !isMissingTableError(readErr)) {
    console.warn("ensureRivieraJugadorVisibleEnRanking:", readErr);
    return;
  }
  if (row?.estado === "archivado" || row?.suma_ranking === false) {
    return;
  }

  const { error } = await supabase
    .from("riviera_jugadores")
    .update({ estado: "activo" })
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
  const rivieraId = sanitizeUuid(rivieraJugadorId);
  const ligaId = sanitizeUuid(legacyLigaJugadorId);
  if (!rivieraId || !ligaId) return;

  const { error } = await supabase
    .from("riviera_jugadores")
    .update({ legacy_liga_jugador_id: ligaId })
    .eq("id", rivieraId);
  if (error) throw error;
}

/** Crea o enlaza perfil Riviera al crear un player legacy */
export async function ensureRivieraJugadorForLegacyPlayer(
  organizadorId: string,
  legacyPlayer: { id: string; name: string; email?: string | null }
): Promise<RivieraJugador | null> {
  try {
    if (
      await isJugadorImportBlocked(organizadorId, {
        nombre: legacyPlayer.name,
        legacyPlayerId: legacyPlayer.id,
      })
    ) {
      return null;
    }

    const existing = await getRivieraJugadorByLegacyPlayerId(legacyPlayer.id);
    if (existing) return existing;

    const email =
      legacyPlayer.email && !legacyPlayer.email.endsWith("@padel.local")
        ? legacyPlayer.email
        : null;

    if (email) {
      const { data: byEmail } = await withJugadorSelectFallback((cols) =>
        supabase
          .from("riviera_jugadores")
          .select(cols)
          .eq("organizador_id", organizadorId)
          .ilike("email", email)
          .maybeSingle()
      );
      if (byEmail) {
        const jugador = byEmail as unknown as RivieraJugador;
        await linkLegacyPlayerId(jugador.id, legacyPlayer.id);
        return jugador;
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

/**
 * Recalcula jugador_stats desde jugador_participaciones y lo persiste.
 * Las participaciones son la fuente de verdad (p. ej. tras borrar del historial).
 */
export async function rebuildJugadorStats(
  jugadorId: string
): Promise<JugadorStats | null> {
  const { error: rpcErr } = await supabase.rpc("refresh_jugador_stats", {
    p_jugador_id: jugadorId,
  });

  const rpcMissing =
    rpcErr &&
    (isMissingTableError(rpcErr) || isMissingRpcError(rpcErr));

  if (!rpcErr) {
    try {
      return await fetchJugadorStatsRow(jugadorId);
    } catch {
      return null;
    }
  }

  if (rpcErr && !rpcMissing) {
    console.warn("[riviera-jugadores] refresh_jugador_stats:", rpcErr);
    try {
      return await fetchJugadorStatsRow(jugadorId);
    } catch {
      return null;
    }
  }

  try {
    const computed = await computeStatsFromParticipaciones(jugadorId);
    return await persistJugadorStats(computed);
  } catch (e) {
    console.warn("[riviera-jugadores] rebuildJugadorStats:", e);
    try {
      return await fetchJugadorStatsRow(jugadorId);
    } catch {
      return null;
    }
  }
}

/**
 * Elimina una participación del historial (local o de otro club enlazado ROMC),
 * recalcula estadísticas y revierte ledger oficial si aplica.
 */
export async function deleteParticipacionJugador(
  organizadorId: string,
  jugadorId: string,
  participacionId: string
): Promise<JugadorStats | null> {
  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    "delete_jugador_participacion_linked",
    {
      p_organizador_id: organizadorId,
      p_view_jugador_id: jugadorId,
      p_participacion_id: participacionId,
    }
  );

  if (!rpcErr) {
    const payload = rpcData as {
      status?: string;
      rebuilt_jugador_ids?: string[];
      source_jugador_id?: string;
    } | null;
    if (payload?.status === "deleted") {
      const ids = new Set<string>([jugadorId]);
      if (payload.source_jugador_id) ids.add(payload.source_jugador_id);
      for (const id of payload.rebuilt_jugador_ids ?? []) {
        if (id) ids.add(id);
      }
      let primary: JugadorStats | null = null;
      for (const id of Array.from(ids)) {
        try {
          const stats = await rebuildJugadorStats(id);
          if (id === jugadorId) primary = stats;
        } catch (e) {
          console.warn("[riviera-jugadores] rebuild tras delete linked:", id, e);
        }
      }
      return primary ?? (await fetchJugadorStatsRow(jugadorId));
    }
  }

  const rpcMsg = (rpcErr?.message ?? "").toLowerCase();
  const rpcMissing =
    rpcErr &&
    (rpcErr.code === "42883" ||
      rpcErr.code === "PGRST202" ||
      rpcMsg.includes("delete_jugador_participacion_linked"));

  if (rpcErr && !rpcMissing) {
    throw new Error(rpcErr.message || "No se pudo eliminar el registro");
  }

  const { data: jugador, error: jugErr } = await supabase
    .from("riviera_jugadores")
    .select("id")
    .eq("id", jugadorId)
    .eq("organizador_id", organizadorId)
    .maybeSingle();

  if (jugErr) {
    if (isMissingTableError(jugErr)) {
      throw new Error("El registro de jugadores no está disponible.");
    }
    throw jugErr;
  }
  if (!jugador) {
    throw new Error("Jugador no encontrado o sin permiso.");
  }

  const { data: part, error: partFetchErr } = await supabase
    .from("jugador_participaciones")
    .select("id, jugador_id, evento_nombre, puntos_obtenidos")
    .eq("id", participacionId)
    .eq("jugador_id", jugadorId)
    .maybeSingle();

  if (partFetchErr) {
    if (isMissingTableError(partFetchErr)) {
      throw new Error("El historial no está disponible.");
    }
    throw partFetchErr;
  }
  if (!part) {
    throw new Error("Registro de historial no encontrado.");
  }

  const { error: delErr } = await supabase
    .from("jugador_participaciones")
    .delete()
    .eq("id", participacionId)
    .eq("jugador_id", jugadorId);

  if (delErr) {
    if (isMissingTableError(delErr)) {
      throw new Error("No se pudo eliminar el registro.");
    }
    throw delErr;
  }

  try {
    return await rebuildJugadorStats(jugadorId);
  } catch (e) {
    console.warn("[riviera-jugadores] rebuild tras eliminar participación:", e);
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
  return enrichParticipacionesOrganizadorFromEvents(
    (data ?? []) as JugadorParticipacion[]
  );
}

/** Historial scoped al club (admin autenticado). Misma lógica que vista pública interna. */
export async function listParticipacionesForOrganizador(
  jugadorId: string,
  limit = 100,
  organizadorId?: string | null
): Promise<JugadorParticipacion[]> {
  const org = organizadorId?.trim();
  if (!org) return listParticipaciones(jugadorId, limit);

  const { data, error } = await supabase.rpc("riviera_participaciones_interno", {
    p_organizador_id: org,
    p_jugador_id: jugadorId,
    p_limit: limit,
  });

  if (!error && data) {
    return filterParticipacionesForOrganizador(
      (data ?? []) as JugadorParticipacion[],
      org
    );
  }

  if (error && !isMissingRpcError(error) && !isMissingTableError(error)) {
    throw error;
  }

  return filterParticipacionesForOrganizador(
    await listParticipaciones(jugadorId, limit),
    org
  );
}

/**
 * Historial público del jugador (anon). Incluye metadata.partidos_detalle
 * — fuente única para el sitio web; no depende de matches/games borrados.
 */
export async function listParticipacionesPublic(
  jugadorId: string,
  limit = 100,
  organizadorId?: string | null
): Promise<JugadorParticipacion[]> {
  const org = organizadorId?.trim();
  if (org) {
    for (const client of [supabasePublicRead, supabase]) {
      const { data, error } = await client.rpc("riviera_participaciones_interno", {
        p_organizador_id: org,
        p_jugador_id: jugadorId,
        p_limit: limit,
      });
      if (!error && data) {
        return filterParticipacionesForOrganizador(
          (data ?? []) as JugadorParticipacion[],
          org
        );
      }
      if (
        error &&
        !isMissingRpcError(error) &&
        !isMissingTableError(error) &&
        client === supabase
      ) {
        throw error;
      }
    }

    const { data: fallbackData, error: fallbackError } = await supabasePublicRead
      .from("jugador_participaciones")
      .select("*")
      .eq("jugador_id", jugadorId)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!fallbackError && fallbackData?.length) {
      return filterParticipacionesForOrganizador(
        fallbackData as JugadorParticipacion[],
        org
      );
    }
    return [];
  }

  const careerRows = await listCareerParticipacionesPublic(jugadorId, limit);
  if (careerRows) {
    return enrichParticipacionesOrganizadorFromEvents(careerRows);
  }

  const { data, error } = await supabasePublicRead
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
  return enrichParticipacionesOrganizadorFromEvents(
    (data ?? []) as JugadorParticipacion[]
  );
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
  motivo?: string,
  options?: { bypassPermisoCheck?: boolean }
): Promise<void> {
  if (!options?.bypassPermisoCheck) {
    const { fetchOrganizadorAccountSettings } = await import(
      "../admin/accountControls"
    );
    const settings = await fetchOrganizadorAccountSettings(organizadorId);
    if (!settings.permiteAjustePuntosManuales) {
      throw new Error(
        "Tu cuenta no puede ajustar puntos manualmente. Solo se registran por partidos jugados en la app."
      );
    }
  }

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

function mapInternalClubJugadorRow(
  row: Record<string, unknown>
): RivieraJugadorWithStats {
  const stats: JugadorStats = {
    jugador_id: String(row.id),
    total_partidos: Number(row.total_partidos ?? 0),
    victorias: Number(row.victorias ?? 0),
    derrotas: Number(row.derrotas ?? 0),
    empates: Number(row.empates ?? 0),
    participaciones_solo: Number(row.participaciones_solo ?? 0),
    pct_victorias: Number(row.pct_victorias ?? 0),
    total_retas: Number(row.total_retas ?? 0),
    total_torneos_express: Number(row.total_torneos_express ?? 0),
    total_ligas: Number(row.total_ligas ?? 0),
    total_americanos: Number(row.total_americanos ?? 0),
    sets_favor_total: Number(row.sets_favor_total ?? 0),
    sets_contra_total: Number(row.sets_contra_total ?? 0),
    racha_actual: String(row.racha_actual ?? ""),
    ultima_actividad: (row.ultima_actividad as string | null) ?? null,
    puntos_totales: Number(row.puntos_totales ?? 0),
    updated_at: String(row.stats_updated_at ?? row.updated_at ?? ""),
  };
  return mapJugadorRowFromService({ ...row, stats });
}

function mapSitioOficialRow(
  row: Record<string, unknown>
): RivieraJugadorWithStats {
  const j = mapJugadorRowFromService(row);
  const romcPts = Number(row.puntos_totales ?? j.stats?.puntos_totales ?? 0);
  const partidos = Number(row.total_partidos ?? j.stats?.total_partidos ?? 0);
  const victorias = Number(row.victorias ?? j.stats?.victorias ?? 0);
  j.officialPuntosGlobal = romcPts;
  j.stats = {
    ...(j.stats ?? {
      jugador_id: j.id,
      total_partidos: 0,
      victorias: 0,
      derrotas: 0,
      empates: 0,
      participaciones_solo: 0,
      pct_victorias: 0,
      total_retas: 0,
      total_torneos_express: 0,
      total_ligas: 0,
      total_americanos: 0,
      sets_favor_total: 0,
      sets_contra_total: 0,
      racha_actual: "",
      ultima_actividad: null,
      puntos_totales: 0,
      updated_at: "",
    }),
    puntos_totales: romcPts,
    total_partidos: partidos,
    victorias,
  };
  return j;
}

/** Fusiona jugador_stats local (ajustes manuales) con puntos ROMC del ranking oficial. */
async function enrichOfficialSiteRankingWithLocalPuntos(
  jugadores: RivieraJugadorWithStats[]
): Promise<RivieraJugadorWithStats[]> {
  if (jugadores.length === 0) return jugadores;

  const ids = jugadores.map((j) => j.id);
  const { data, error } = await supabase
    .from("jugador_stats")
    .select("jugador_id, puntos_totales")
    .in("jugador_id", ids);

  if (error) {
    console.warn("[riviera-jugadores] enrich local puntos sitio oficial:", error);
    return jugadores;
  }

  const localById = new Map(
    (data ?? []).map((row) => [
      String(row.jugador_id),
      Number(row.puntos_totales ?? 0),
    ])
  );

  const enriched = jugadores.map((j) => {
    const romcPts = j.officialPuntosGlobal ?? j.stats?.puntos_totales ?? 0;
    const localPts = localById.get(j.id);
    const statsBase = j.stats ?? {
      jugador_id: j.id,
      total_partidos: 0,
      victorias: 0,
      derrotas: 0,
      empates: 0,
      participaciones_solo: 0,
      pct_victorias: 0,
      total_retas: 0,
      total_torneos_express: 0,
      total_ligas: 0,
      total_americanos: 0,
      sets_favor_total: 0,
      sets_contra_total: 0,
      racha_actual: "",
      ultima_actividad: null,
      puntos_totales: 0,
      updated_at: "",
    };
    let stats = mergeJugadorStatsPuntosTotales(statsBase, romcPts);
    if (localPts != null) {
      stats = {
        ...stats,
        puntos_totales: Math.max(stats.puntos_totales, localPts),
      };
    }
    return {
      ...j,
      officialPuntosGlobal: romcPts,
      stats,
    };
  });

  return [...enriched].sort((a, b) => {
    const pa = rankingPuntosJugador(a);
    const pb = rankingPuntosJugador(b);
    if (pb !== pa) return pb - pa;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

export async function getRivieraJugadorPublicById(
  jugadorId: string
): Promise<RivieraJugadorWithStats | null> {
  const { isJugadorVisibleSitioOficial } = await import("../admin/accountControls");
  if (!(await isJugadorVisibleSitioOficial(jugadorId))) return null;

  const { data, error } = await withJugadorSelectFallback((cols) =>
    supabase
      .from("riviera_jugadores")
      .select(jugadorSelectWithStats(cols))
      .eq("id", jugadorId)
      .maybeSingle()
  );

  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
  if (!data) return null;
  const mapped = mapJugadorRowFromService(data as unknown as Record<string, unknown>);
  return enrichJugadorWithRivieraId(
    await enrichJugadorWithGlobalGrantedAccess(mapped)
  );
}

/** Ranking oficial global (todos los clubs con jugadores publicados). */
export async function listOfficialSiteJugadoresRankingGlobal(
  categoria: string,
  genero: RivieraJugadorGenero = "M"
): Promise<RivieraJugadorWithStats[]> {
  const generoParam = genero === "F" ? "F" : "M";
  const { data, error } = await supabase.rpc("riviera_ranking_sitio_oficial_global", {
    p_categoria: categoria,
    p_genero: generoParam,
  });

  if (!error && data) {
    const rows = (data as Record<string, unknown>[]).map(mapSitioOficialRow);
    const filtered = rows.filter((row) => isJugadorInGeneroBracket(row.genero, genero));
    return enrichJugadoresWithRivieraId(
      await enrichOfficialSiteRankingWithLocalPuntos(filtered)
    );
  }

  if (
    error &&
    !isMissingTableError(error) &&
    !error.message?.includes("riviera_ranking_sitio_oficial_global")
  ) {
    throw error;
  }

  let q = supabase.from("riviera_jugadores_sitio_oficial").select("*").eq("categoria", categoria);

  if (genero === "F") {
    q = q.eq("genero", "F");
  } else {
    q = q.or("genero.eq.M,genero.is.null");
  }

  const { data: viewData, error: viewError } = await q.order("nombre");

  if (viewError) {
    if (
      isMissingTableError(viewError) ||
      viewError.message?.includes("riviera_jugadores_sitio_oficial")
    ) {
      return [];
    }
    throw viewError;
  }

  const rows = ((viewData ?? []) as Record<string, unknown>[]).map(mapSitioOficialRow);
  const filtered = rows.filter((row) =>
    isJugadorInGeneroBracket(row.genero, genero)
  );
  return enrichJugadoresWithRivieraId(
    await enrichOfficialSiteRankingWithLocalPuntos(filtered)
  );
}

/** Ranking oficial por club (solo jugadores con «Sitio oficial» en admin). */
export async function listOfficialSiteJugadoresRanking(
  organizadorId: string,
  categoria: string,
  genero: RivieraJugadorGenero = "M"
): Promise<RivieraJugadorWithStats[]> {
  const generoParam = genero === "F" ? "F" : "M";
  const { data, error } = await supabase.rpc(
    "riviera_ranking_sitio_oficial_por_organizador",
    {
      p_organizador_id: organizadorId,
      p_categoria: categoria,
      p_genero: generoParam,
    }
  );

  if (!error && data) {
    const rows = (data as Record<string, unknown>[]).map(mapSitioOficialRow);
    const filtered = rows.filter((row) => isJugadorInGeneroBracket(row.genero, genero));
    return enrichJugadoresWithRivieraId(
      await enrichOfficialSiteRankingWithLocalPuntos(filtered)
    );
  }

  if (
    error &&
    !isMissingTableError(error) &&
    !error.message?.includes("riviera_ranking_sitio_oficial_por_organizador")
  ) {
    throw error;
  }

  let q = supabase
    .from("riviera_jugadores_sitio_oficial")
    .select("*")
    .eq("organizador_id", organizadorId)
    .eq("categoria", categoria);

  if (genero === "F") {
    q = q.eq("genero", "F");
  } else {
    q = q.or("genero.eq.M,genero.is.null");
  }

  const { data: viewData, error: viewError } = await q.order("nombre");

  if (viewError) {
    if (
      isMissingTableError(viewError) ||
      viewError.message?.includes("riviera_jugadores_sitio_oficial")
    ) {
      return [];
    }
    throw viewError;
  }

  const rows = ((viewData ?? []) as Record<string, unknown>[]).map(mapSitioOficialRow);
  const filtered = rows.filter((row) =>
    isJugadorInGeneroBracket(row.genero, genero)
  );
  return enrichJugadoresWithRivieraId(
    await enrichOfficialSiteRankingWithLocalPuntos(filtered)
  );
}

export async function getRankingPosicionOficialEnCategoria(
  jugadorId: string,
  organizadorId: string,
  categoria: string,
  genero: RivieraJugadorGenero = "M"
): Promise<number | null> {
  const {
    rankingPosicionEnListaByIds,
    sortJugadoresForOfficialSiteRanking,
  } = await import("./rankingPosition");
  const list = await listOfficialSiteJugadoresRanking(
    organizadorId,
    categoria,
    genero
  );
  const sorted = sortJugadoresForOfficialSiteRanking(list);
  return rankingPosicionEnListaByIds(sorted, [jugadorId]);
}

/**
 * Posición en el ranking global de rivieraopen.com (todos los clubes publicados).
 * Nunca usar el ranking por-organizador para la ficha de jugadores en sitio oficial.
 */
export async function getRankingPosicionOficialGlobalEnCategoria(
  jugadorId: string,
  categoria: string,
  genero: RivieraJugadorGenero = "M",
  altJugadorId?: string | null
): Promise<number | null> {
  const {
    rankingPosicionEnListaByIds,
    sortJugadoresForOfficialSiteRanking,
  } = await import("./rankingPosition");
  const list = await listOfficialSiteJugadoresRankingGlobal(categoria, genero);
  const sorted = sortJugadoresForOfficialSiteRanking(list);
  const ids = [jugadorId, altJugadorId?.trim()].filter(
    (id): id is string => Boolean(id)
  );
  return rankingPosicionEnListaByIds(sorted, ids);
}

/** Única entrada para la ficha pública: evita mezclar ranking club vs global. */
export async function resolveRankingPosicionForPublicFicha(
  jugador: RivieraJugadorWithStats,
  options: {
    orgId?: string | null;
    internalClub?: boolean;
    preferClubRanking?: boolean;
  }
): Promise<number | null> {
  const { resolvePublicFichaRankingTarget } = await import("./publicFichaRanking");
  const { normalizeRivieraGenero } = await import("./genero");
  const genero = normalizeRivieraGenero(jugador.genero) ?? "M";
  const org = options.orgId?.trim();
  const target = resolvePublicFichaRankingTarget(jugador, {
    orgId: options.orgId,
    internalClub: options.internalClub,
    preferClubRanking: options.preferClubRanking,
  });

  if (target === "global") {
    return getRankingPosicionOficialGlobalEnCategoria(
      jugador.id,
      jugador.categoria,
      genero,
      jugador.grantedAccess?.sourceJugadorId
    );
  }

  if (target === "club" && org) {
    const { PUBLIC_ORGANIZER_RPC_FALLBACK } = await import("./publicOrganizador");
    return getRankingPosicionEnCategoria(
      org,
      jugador.id,
      jugador.categoria,
      genero,
      PUBLIC_ORGANIZER_RPC_FALLBACK
    );
  }

  return null;
}

/**
 * Ranking interno del club (appriviera): jugadores activos del organizador.
 * No filtra visible_publico (eso solo aplica en rivieraopen.com).
 */
export async function listInternalClubJugadoresRanking(
  organizadorId: string,
  categoria: string,
  genero: RivieraJugadorGenero = "M",
  options?: RatingRpcFallbackOptions
): Promise<RivieraJugadorWithStats[]> {
  const generoParam = genero === "F" ? "F" : "M";
  const rpcParams = {
    p_organizador_id: organizadorId,
    p_categoria: categoria,
    p_genero: generoParam,
  };

  let resolvedData: unknown = null;
  const { data, error } = await supabasePublicRead.rpc(
    "riviera_ranking_interno_por_organizador",
    rpcParams
  );
  if (!error && data) {
    resolvedData = data;
  } else if (error && !isMissingTableError(error) && !isMissingRpcError(error)) {
    const { data: authData, error: authError } = await supabase.rpc(
      "riviera_ranking_interno_por_organizador",
      rpcParams
    );
    if (authError) throw authError;
    resolvedData = authData;
  }

  if (resolvedData) {
    const rows = (resolvedData as Record<string, unknown>[]).map(
      mapInternalClubJugadorRow
    );
    const filtered = rows.filter((row) => isJugadorInGeneroBracket(row.genero, genero));
    const merged = await mergeGrantedJugadoresIntoRanking(
      organizadorId,
      categoria,
      genero,
      filtered,
      options
    );
    const scoped = await enrichJugadoresOrganizerScopedStats(organizadorId, merged);
    return enrichJugadoresWithRivieraId(
      stripOfficialPuntosFromInternalClubRanking(scoped),
      { publicRanking: true }
    );
  }

  if (error && !isMissingTableError(error) && !isMissingRpcError(error)) {
    throw error;
  }

  const { data: viewData, error: viewError } = await withJugadorSelectFallback((cols) => {
    let q = supabasePublicRead
      .from("riviera_jugadores")
      .select(jugadorSelectWithStats(cols))
      .eq("organizador_id", organizadorId)
      .eq("categoria", categoria)
      .eq("estado", "activo")
      .order("nombre");

    if (genero === "F") {
      q = q.eq("genero", "F");
    } else {
      q = q.or("genero.eq.M,genero.is.null");
    }

    return q;
  });

  if (viewError) {
    if (isMissingTableError(viewError)) return [];
    throw viewError;
  }

  const rows = ((viewData ?? []) as unknown as Record<string, unknown>[]).map((row) =>
    mapJugadorRowFromService(row)
  );
  const filtered = rows.filter((row) =>
    isJugadorInGeneroBracket(row.genero, genero)
  );
  const sorted = [...filtered].sort((a, b) => {
    const pa = a.stats?.puntos_totales ?? 0;
    const pb = b.stats?.puntos_totales ?? 0;
    if (pb !== pa) return pb - pa;
    return a.nombre.localeCompare(b.nombre, "es");
  });
  const merged = await mergeGrantedJugadoresIntoRanking(
    organizadorId,
    categoria,
    genero,
    sorted,
    options
  );
  const scoped = await enrichJugadoresOrganizerScopedStats(organizadorId, merged);
  return enrichJugadoresWithRivieraId(
    stripOfficialPuntosFromInternalClubRanking(scoped),
    { publicRanking: true }
  );
}

function stripOfficialPuntosFromInternalClubRanking(
  jugadores: RivieraJugadorWithStats[]
): RivieraJugadorWithStats[] {
  return sortJugadoresByClubLocalPuntos(
    jugadores.map((j) => ({
      ...j,
      officialPuntosGlobal: undefined,
    }))
  );
}

export async function getRivieraJugadorPublicBySlug(
  slug: string,
  organizadorId?: string | null
): Promise<RivieraJugadorWithStats | null> {
  const trimmedSlug = slug.trim();
  const trimmedOrg = organizadorId?.trim();

  if (trimmedOrg) {
    const row = await fetchInternalClubJugadorRow(trimmedOrg, {
      slug: trimmedSlug,
    });
    return row ? enrichJugadorWithRivieraId(row, { publicRanking: true }) : null;
  }

  const { data, error } = await withJugadorSelectFallback((cols) => {
    let q = supabase
      .from("riviera_jugadores")
      .select(jugadorSelectWithStats(cols))
      .eq("slug", trimmedSlug)
      .eq("estado", "activo")
      .or("visible_publico.eq.true,visible_publico.is.null");

    return q.maybeSingle();
  });
  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
  const j = data ? mapJugadorRowFromService(data as unknown as Record<string, unknown>) : null;
  if (!j) return null;

  const { isJugadorVisibleSitioOficial } = await import("../admin/accountControls");
  if (!(await isJugadorVisibleSitioOficial(j.id))) return null;

  return enrichJugadorWithRivieraId(await enrichJugadorWithGlobalGrantedAccess(j));
}

/** Ranking público por categoría y género (orden: más puntos, luego nombre). */
export async function listPublicJugadoresRanking(
  organizadorId: string,
  categoria: string,
  genero: RivieraJugadorGenero = "M"
): Promise<RivieraJugadorWithStats[]> {
  const { isOrganizadorRankingPublico } = await import("../admin/accountControls");
  const publicado = await isOrganizadorRankingPublico(organizadorId);
  if (!publicado) return [];

  const { data, error } = await withJugadorSelectFallback((cols) => {
    let q = supabase
      .from("riviera_jugadores")
      .select(jugadorSelectWithStats(cols))
      .eq("organizador_id", organizadorId)
      .eq("categoria", categoria)
      .eq("estado", "activo")
      .or("visible_publico.eq.true,visible_publico.is.null")
      .or("suma_ranking.eq.true,suma_ranking.is.null")
      .order("nombre");

    if (genero === "F") {
      q = q.eq("genero", "F");
    } else {
      q = q.or("genero.eq.M,genero.is.null");
    }

    return q;
  });

  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }

  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map(
    (row) => mapJugadorRowFromService(row)
  );
  const filtered = rows.filter((row) =>
    isJugadorInGeneroBracket(row.genero, genero)
  );
  const sorted = [...filtered].sort((a, b) => {
    const pa = a.stats?.puntos_totales ?? 0;
    const pb = b.stats?.puntos_totales ?? 0;
    if (pb !== pa) return pb - pa;
    return a.nombre.localeCompare(b.nombre, "es");
  });
  return enrichJugadoresWithRivieraId(sorted);
}

/** Posición # en el ranking interno del club (empates comparten número). */
export async function getRankingPosicionEnCategoria(
  organizadorId: string,
  jugadorId: string,
  categoria: string,
  genero: RivieraJugadorGenero = "M",
  rpcOptions?: RatingRpcFallbackOptions
): Promise<number | null> {
  const { rankingPosicionEnListaForClub } = await import("./rankingPosition");
  const list = await listInternalClubJugadoresRanking(
    organizadorId,
    categoria,
    genero,
    rpcOptions
  );
  return rankingPosicionEnListaForClub(list, jugadorId);
}

/**
 * Elimina un jugador del registro Riviera y todo su historial de ranking
 * (participaciones y estadísticas). No borra retas/torneos ya jugados en `players`.
 */
export async function deleteRivieraJugador(
  organizadorId: string,
  jugadorId: string
): Promise<void> {
  if (await isRevokedGrantLocalJugador(organizadorId, jugadorId)) {
    throw new Error(
      "Este jugador ya no tiene acceso concedido en este club. No se puede eliminar desde aquí."
    );
  }

  const grantMeta = await findGrantedAccessMetaForJugador(
    organizadorId,
    jugadorId
  );
  if (grantMeta) {
    throw new Error(
      "No puedes eliminar un jugador con acceso concedido. Quita el acceso desde Admin Principal."
    );
  }

  const { data, error: rpcErr } = await supabase.rpc("delete_riviera_jugador", {
    p_organizador_id: organizadorId,
    p_jugador_id: jugadorId,
  });

  if (!rpcErr) {
    const payload = data as { status?: string } | null;
    if (payload?.status === "deleted") return;
  }

  const rpcMsg = (rpcErr?.message ?? "").toLowerCase();
  const rpcMissing =
    rpcErr &&
    (isMissingRpcError(rpcErr) ||
      rpcMsg.includes("delete_riviera_jugador"));

  if (rpcErr && !rpcMissing) {
    throw new Error(rpcErr.message || "No se pudo eliminar el jugador.");
  }

  if (rpcErr && rpcMissing) {
    console.warn(
      "[riviera-jugadores] delete_riviera_jugador RPC no disponible; usando fallback. Ejecuta supabase/delete-riviera-jugador.sql"
    );
  }

  const { data: row, error: fetchErr } = await supabase
    .from("riviera_jugadores")
    .select("id, nombre, legacy_player_id, legacy_liga_jugador_id")
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

  const { data: participaciones } = await supabase
    .from("jugador_participaciones")
    .select("id")
    .eq("jugador_id", jugadorId);

  for (const part of participaciones ?? []) {
    const partId = String((part as { id: string }).id);
    await supabase.rpc("reverse_riviera_official_ledger_for_participacion", {
      p_participacion_id: partId,
    });
  }

  const { error: partErr } = await supabase
    .from("jugador_participaciones")
    .delete()
    .eq("jugador_id", jugadorId);
  if (partErr && !isMissingTableError(partErr)) {
    throw new Error(
      partErr.message.includes("409") || partErr.code === "23503"
        ? "No se pudo eliminar el historial (ranking oficial enlazado). Ejecuta supabase/delete-riviera-jugador.sql en Supabase."
        : partErr.message
    );
  }

  const { error: ratingErr } = await supabase
    .from("rating_historial")
    .delete()
    .eq("jugador_id", jugadorId);
  if (ratingErr && !isMissingTableError(ratingErr)) throw ratingErr;

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

    const { error: inactivoErr } = await supabase
      .from("liga_jugadores")
      .update({ estado: "inactivo" })
      .eq("id", ligaJugadorId)
      .eq("organizador_id", organizadorId);
    if (inactivoErr && !isMissingTableError(inactivoErr)) throw inactivoErr;
  }

  await registerJugadorImportBlocklist(organizadorId, {
    nombre: String(row.nombre ?? ""),
    legacyPlayerId: (row.legacy_player_id as string | null) ?? null,
    legacyLigaJugadorId: ligaJugadorId ?? null,
  });

  const { error: delErr } = await supabase
    .from("riviera_jugadores")
    .delete()
    .eq("id", jugadorId)
    .eq("organizador_id", organizadorId);

  if (delErr) {
    if (isMissingTableError(delErr)) {
      throw new Error("No se pudo eliminar el jugador del registro.");
    }
    throw new Error(
      delErr.message.includes("409") || delErr.code === "23503"
        ? "No se pudo eliminar el jugador (perfil oficial o duelos enlazados). Ejecuta supabase/delete-riviera-jugador.sql en Supabase."
        : delErr.message
    );
  }
}

export async function searchRivieraJugadoresQuick(
  organizadorId: string,
  query: string,
  limit = 12
): Promise<RivieraJugador[]> {
  const q = query.trim();
  if (!q) return [];
  const rows = await listRivieraJugadores(organizadorId, { search: q });
  return rows.slice(0, limit);
}

export async function obtenerHistorialRating(
  jugadorId: string,
  limite = 10
): Promise<RatingHistorialEntry[]> {
  const { data, error } = await supabase
    .from("rating_historial")
    .select(
      "id, fecha, rating_antes, rating_despues, delta, modo_juego, descripcion"
    )
    .eq("jugador_id", jugadorId)
    .order("fecha", { ascending: false })
    .limit(limite);

  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      fecha: String(r.fecha),
      rating_antes: Number(r.rating_antes ?? 0),
      rating_despues: Number(r.rating_despues ?? 0),
      delta: Number(r.delta ?? 0),
      modo_juego: String(r.modo_juego ?? ""),
      descripcion: String(r.descripcion ?? ""),
    };
  });
}

/** Historial de rating para vista pública (sin sesión de organizador). */
export async function obtenerHistorialRatingPublic(
  jugadorId: string,
  limite = 10
): Promise<RatingHistorialEntry[]> {
  const { data, error } = await supabasePublicRead
    .from("rating_historial")
    .select(
      "id, fecha, rating_antes, rating_despues, delta, modo_juego, descripcion"
    )
    .eq("jugador_id", jugadorId)
    .order("fecha", { ascending: false })
    .limit(limite);

  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      fecha: String(r.fecha),
      rating_antes: Number(r.rating_antes ?? 0),
      rating_despues: Number(r.rating_despues ?? 0),
      delta: Number(r.delta ?? 0),
      modo_juego: String(r.modo_juego ?? ""),
      descripcion: String(r.descripcion ?? ""),
    };
  });
}

/** Movimientos de nivel por partido (vista pública, p. ej. duelo 2v2). */
export async function fetchRatingMovimientosByPartidoRef(
  partidoRef: string
): Promise<RatingMovimientoPartido[]> {
  const ref = partidoRef?.trim();
  if (!ref) return [];

  const parseRows = (rows: unknown[]): RatingMovimientoPartido[] =>
    rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        jugadorId: String(r.jugador_id),
        ratingAntes: Number(r.rating_antes ?? 0),
        ratingDespues: Number(r.rating_despues ?? 0),
        delta: Number(r.delta ?? 0),
      };
    });

  const selectCols = "jugador_id, rating_antes, rating_despues, delta";

  const dueloMatch = ref.match(
    /^duelo2v2:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
  );
  if (dueloMatch) {
    const dueloId = dueloMatch[1];
    for (const client of [supabasePublicRead, supabase] as const) {
      const { data, error } = await client.rpc("get_public_duelo2v2_rating_moves", {
        p_duelo_id: dueloId,
      });
      if (!error && (data?.length ?? 0) > 0) {
        return parseRows(data ?? []);
      }
    }
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session) {
    const { data, error } = await supabase
      .from("rating_historial")
      .select(selectCols)
      .eq("partido_ref", ref);
    if (!error && (data?.length ?? 0) > 0) {
      return parseRows(data ?? []);
    }
  }

  const { data, error } = await supabasePublicRead
    .from("rating_historial")
    .select(selectCols)
    .eq("partido_ref", ref);

  if (error) {
    if (isMissingTableError(error)) return [];
    return [];
  }

  return parseRows(data ?? []);
}

export type { JugadorStats };
