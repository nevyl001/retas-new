import { supabase, supabasePublicRead } from "../supabaseClient";
import type { JugadorParticipacion, JugadorStats, RivieraJugadorWithStats } from "./types";
import { discoverLinkedJugadorIds } from "./grantedPlayerUnifiedView";

export type ConcedidoClubMeta = {
  isConcedido: boolean;
  sourceJugadorId?: string;
  localJugadorId?: string;
  ownerOrganizadorId?: string;
  origenPuntosTotales?: number;
  localPuntosTotales?: number;
};

let concedidoClubRpcAvailable: boolean | null = null;

function isMissingConcedidoRpcError(
  error: { code?: string; message?: string; status?: number } | null
): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.status === 404 ||
    error.status === 405 ||
    error.code === "25006" ||
    error.code === "42883" ||
    error.code === "PGRST202" ||
    msg.includes("could not find the function") ||
    msg.includes("method not allowed") ||
    msg.includes("read-only transaction") ||
    msg.includes("riviera_rating_canonico_para_jugador") ||
    msg.includes("riviera_concedidos_ranking_enriquecimiento")
  );
}

let concedidosRankingBatchRpcAvailable: boolean | null = null;

function mapConcedidoRankingBatchRow(
  row: Record<string, unknown>
): ConcedidoClubMeta | null {
  const sourceId = row.source_jugador_id
    ? String(row.source_jugador_id).trim()
    : "";
  const localId = row.local_jugador_id
    ? String(row.local_jugador_id).trim()
    : "";
  if (!sourceId || !localId || sourceId === localId) return null;

  return {
    isConcedido: true,
    sourceJugadorId: sourceId,
    localJugadorId: localId,
    ownerOrganizadorId: row.owner_organizador_id
      ? String(row.owner_organizador_id)
      : undefined,
    origenPuntosTotales: Number(row.origen_puntos_totales ?? 0),
    localPuntosTotales: Number(row.local_puntos_totales ?? 0),
  };
}

/** Una sola llamada RPC para todo el ranking público (anon-safe). */
export async function fetchConcedidosRankingMetaBatch(
  granteeOrganizadorId: string
): Promise<Map<string, ConcedidoClubMeta>> {
  const map = new Map<string, ConcedidoClubMeta>();
  if (concedidosRankingBatchRpcAvailable === false) return map;

  const org = granteeOrganizadorId.trim();
  if (!org) return map;

  const { data, error } = await supabase.rpc(
    "riviera_concedidos_ranking_enriquecimiento",
    { p_grantee_organizer_id: org }
  );

  if (error) {
    if (isMissingConcedidoRpcError(error)) {
      concedidosRankingBatchRpcAvailable = false;
      return map;
    }
    throw error;
  }

  concedidosRankingBatchRpcAvailable = true;
  for (const raw of data ?? []) {
    const meta = mapConcedidoRankingBatchRow(raw as Record<string, unknown>);
    if (!meta) continue;
    if (meta.localJugadorId) map.set(meta.localJugadorId, meta);
    if (meta.sourceJugadorId) map.set(meta.sourceJugadorId, meta);
  }
  return map;
}

function resolveConcedidoMetaFromBatch(
  batch: Map<string, ConcedidoClubMeta>,
  jugador: RivieraJugadorWithStats
): ConcedidoClubMeta | undefined {
  return (
    batch.get(jugador.id) ??
    (jugador.grantedAccess?.sourceJugadorId
      ? batch.get(jugador.grantedAccess.sourceJugadorId)
      : undefined)
  );
}

export async function enrichJugadoresConcedidoClubViewBatch(
  granteeOrganizadorId: string | null | undefined,
  jugadores: RivieraJugadorWithStats[]
): Promise<RivieraJugadorWithStats[]> {
  const org = granteeOrganizadorId?.trim();
  if (!org || jugadores.length === 0) return jugadores;

  const batch = await fetchConcedidosRankingMetaBatch(org);
  if (concedidosRankingBatchRpcAvailable === false) {
    return Promise.all(
      jugadores.map((j) => enrichJugadorConcedidoClubView(org, j))
    );
  }

  if (batch.size === 0) {
    return Promise.all(
      jugadores.map((j) =>
        j.concedidoPorAdmin
          ? enrichJugadorConcedidoClubView(org, j)
          : Promise.resolve(j)
      )
    );
  }

  return jugadores.map((j) => {
    const fromBatch = resolveConcedidoMetaFromBatch(batch, j);
    return fromBatch?.isConcedido ? applyConcedidoClubMeta(j, fromBatch) : j;
  });
}

export async function fetchConcedidoClubMeta(
  granteeOrganizadorId: string,
  jugadorId: string
): Promise<ConcedidoClubMeta | null> {
  if (concedidoClubRpcAvailable === false) return null;

  const org = granteeOrganizadorId.trim();
  const id = jugadorId.trim();
  if (!org || !id) return null;

  const { data, error } = await supabase.rpc("riviera_rating_canonico_para_jugador", {
    p_organizador_id: org,
    p_jugador_id: id,
  });

  if (error) {
    if (isMissingConcedidoRpcError(error)) {
      concedidoClubRpcAvailable = false;
      return null;
    }
    throw error;
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;

  concedidoClubRpcAvailable = true;
  const sourceId = row.source_jugador_id
    ? String(row.source_jugador_id).trim()
    : "";
  const localId = row.local_jugador_id
    ? String(row.local_jugador_id).trim()
    : id;
  const isConcedido = Boolean(sourceId && localId && sourceId !== localId);

  if (!isConcedido) {
    return { isConcedido: false };
  }

  return {
    isConcedido: true,
    sourceJugadorId: sourceId,
    localJugadorId: localId,
    ownerOrganizadorId: row.owner_organizador_id
      ? String(row.owner_organizador_id)
      : undefined,
    origenPuntosTotales: Number(row.origen_puntos_totales ?? 0),
    localPuntosTotales: Number(row.local_puntos_totales ?? 0),
  };
}

async function fetchOrigenStatsPublic(
  sourceJugadorId: string
): Promise<JugadorStats | null> {
  const { data, error } = await supabasePublicRead
    .from("jugador_stats")
    .select("*")
    .eq("jugador_id", sourceJugadorId)
    .maybeSingle();

  if (error || !data) return null;
  return data as JugadorStats;
}

async function fetchOwnerOrganizadorIdPublic(
  sourceJugadorId: string
): Promise<string | null> {
  const { data, error } = await supabasePublicRead
    .from("riviera_jugadores")
    .select("organizador_id")
    .eq("id", sourceJugadorId)
    .maybeSingle();

  if (error || !data?.organizador_id) return null;
  return String(data.organizador_id);
}

async function fetchConcedidoClubMetaFallback(
  jugador: RivieraJugadorWithStats,
  participaciones: JugadorParticipacion[] = [],
  options?: { skipRomcLegacy?: boolean }
): Promise<ConcedidoClubMeta | null> {
  const linkedIds = await discoverLinkedJugadorIds(jugador.id, participaciones, {
    skipRomcLegacy: options?.skipRomcLegacy,
  });
  const localId = jugador.id.trim();
  const sourceId = linkedIds.find((id) => id !== localId);
  if (!sourceId) return null;

  const [origenStats, ownerOrgId] = await Promise.all([
    fetchOrigenStatsPublic(sourceId),
    fetchOwnerOrganizadorIdPublic(sourceId),
  ]);

  if (!origenStats && !ownerOrgId) return null;

  return {
    isConcedido: true,
    sourceJugadorId: sourceId,
    localJugadorId: localId,
    ownerOrganizadorId: ownerOrgId ?? undefined,
    origenPuntosTotales: origenStats?.puntos_totales ?? 0,
    localPuntosTotales: jugador.stats?.puntos_totales ?? 0,
  };
}

export function applyConcedidoClubMeta(
  jugador: RivieraJugadorWithStats,
  meta: ConcedidoClubMeta
): RivieraJugadorWithStats {
  if (!meta.isConcedido || !meta.sourceJugadorId) return jugador;

  const localPuntos =
    meta.localPuntosTotales ?? jugador.stats?.puntos_totales ?? 0;
  const origenPuntos = meta.origenPuntosTotales ?? 0;

  const localStats = jugador.stats
    ? { ...jugador.stats, puntos_totales: localPuntos }
    : jugador.stats;

  const origenStats: JugadorStats | null = jugador.statsOrigenConcedido
    ? {
        ...jugador.statsOrigenConcedido,
        puntos_totales: Math.max(
          jugador.statsOrigenConcedido.puntos_totales,
          origenPuntos
        ),
      }
    : origenPuntos > 0
    ? {
        jugador_id: meta.sourceJugadorId,
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
        puntos_totales: origenPuntos,
        updated_at: new Date().toISOString(),
      }
    : null;

  return {
    ...jugador,
    concedidoPorAdmin: true,
    stats: localStats,
    statsOrigenConcedido: origenStats,
    grantedAccess: {
      accessId: jugador.grantedAccess?.accessId ?? "",
      sourceJugadorId: meta.sourceJugadorId,
      ownerOrganizadorId:
        meta.ownerOrganizadorId ??
        jugador.grantedAccess?.ownerOrganizadorId ??
        "",
    },
  };
}

/** Cedido en club anfitrión: puntos locales para ranking + origen aparte (público o autenticado). */
export async function enrichJugadorConcedidoClubView(
  granteeOrganizadorId: string | null | undefined,
  jugador: RivieraJugadorWithStats,
  options?: { participaciones?: JugadorParticipacion[] }
): Promise<RivieraJugadorWithStats> {
  if (
    jugador.concedidoPorAdmin &&
    jugador.grantedAccess?.sourceJugadorId &&
    jugador.grantedAccess?.ownerOrganizadorId &&
    jugador.statsOrigenConcedido
  ) {
    return applyConcedidoClubMeta(jugador, {
      isConcedido: true,
      sourceJugadorId: jugador.grantedAccess.sourceJugadorId,
      localJugadorId: jugador.id,
      ownerOrganizadorId: jugador.grantedAccess.ownerOrganizadorId,
      origenPuntosTotales: jugador.statsOrigenConcedido.puntos_totales,
      localPuntosTotales: jugador.stats?.puntos_totales ?? 0,
    });
  }

  const org = granteeOrganizadorId?.trim();
  let meta: ConcedidoClubMeta | null = null;
  if (org) {
    meta = await fetchConcedidoClubMeta(org, jugador.id);
  }
  if (!meta?.isConcedido) {
    meta = await fetchConcedidoClubMetaFallback(
      jugador,
      options?.participaciones ?? [],
      { skipRomcLegacy: true }
    );
  }
  if (!meta?.isConcedido) return jugador;

  return applyConcedidoClubMeta(jugador, meta);
}
