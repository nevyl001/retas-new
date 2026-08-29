import type { Pair } from "../../db/types";
import {
  buildParticipacionFechaFields,
} from "../../matchDate";
import { getOrganizerDisplayNameSync } from "../../organizer/organizerDisplayName";
import { supabase } from "../../supabaseClient";
import {
  calcularPuntosEventoDesglose,
  RANKING_PUNTOS_ESQUEMA,
  type CalcularPuntosEventoParams,
  type PuntosDesglose,
  type RivieraRankingFormato,
} from "../rivieraRankingPoints";
import {
  ensureRivieraJugadorVisibleEnRanking,
  rebuildJugadorStats,
  registrarParticipacionConLedger,
  actualizarParticipacionConLedger,
} from "../rivieraJugadoresService";
import type { JugadorResultado, JugadorTipoEvento } from "../types";
import { isParticipacionExcluded } from "../participacionExclusions";
import type { CloseIdentityCache } from "../careerEventPipeline/closeIdentityCache";
import type { PlayerParticipacionSyncResult } from "../careerEventPipeline/careerEventPlayerSync";
import {
  enrichMetadataWithPartidosDetalle,
  mergeMetadataWithPartidosDetalle,
  parsePartidosDetalle,
  summarizePartidosDetalle,
  type PartidoDetalle,
} from "../../shared/buildPartidosDetalle";

async function readJugadorSumaRankingState(jugadorId: string): Promise<{
  sumaRanking: boolean;
  estado: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from("riviera_jugadores")
      .select("suma_ranking, estado")
      .eq("id", jugadorId)
      .maybeSingle();

    if (error || !data) {
      return { sumaRanking: true, estado: null };
    }

    return {
      sumaRanking:
        data.estado !== "archivado" &&
        (data as { suma_ranking?: boolean }).suma_ranking !== false,
      estado: (data.estado as string | null) ?? null,
    };
  } catch {
    return { sumaRanking: true, estado: null };
  }
}

export const PAIRS_SELECT =
  "id, tournament_id, player1_id, player2_id, player1_name, player2_name, created_at";

export type PlayerAgg = {
  wins: number;
  losses: number;
  draws: number;
  setsFavor: number;
  setsContra: number;
  puntosObtenidos: number;
  nombre: string;
  legacyPlayerId?: string;
  legacyLigaJugadorId?: string;
  email?: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function yaRegistrada(
  jugadorId: string,
  eventoId: string,
  tipoEvento: JugadorTipoEvento
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("jugador_participaciones")
      .select("id")
      .eq("jugador_id", jugadorId)
      .eq("evento_id", eventoId)
      .eq("tipo_evento", tipoEvento)
      .limit(1)
      .maybeSingle();

    if (error) {
      const msg = (error.message ?? "").toLowerCase();
      if (
        error.code === "42P01" ||
        error.code === "PGRST205" ||
        msg.includes("jugador_participaciones")
      ) {
        return false;
      }
      console.error("[riviera-jugadores] yaRegistrada:", error);
      return false;
    }
    return !!data;
  } catch (e) {
    console.error("[riviera-jugadores] yaRegistrada:", e);
    return false;
  }
}

export function rankingMetadata(
  desglose: PuntosDesglose,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const total = Object.values(desglose).reduce((a, b) => a + b, 0);
  return {
    ...extra,
    puntos_aplicados: true,
    puntos_desglose: desglose,
    puntos_evento: total,
    ranking_puntos_esquema: RANKING_PUNTOS_ESQUEMA,
  };
}

/** Resultado estándar de sync para el pipeline canónico de carrera. */
export type CareerEventSyncOutcome = {
  touchedJugadorIds: string[];
  /** evento_id en jugador_participaciones (puede diferir del id lógico del evento). */
  participacionEventoId?: string;
  /** Fallos aislados por jugador durante el sync (no abortan al resto). */
  syncFailures?: import("../careerEventPipeline/types").CareerEventAssertionFailure[];
};

export type CareerEventSyncOptions = {
  excludeJugadorIds?: string[];
  /**
   * Perf batch-1 (2026-08-08): caché de identidad de UN cierre (ver
   * closeIdentityCache.ts), generalizado a todas las modalidades. Memoiza
   * resolveJugadorIdForParticipacion/ensureRivieraIdentity/profile-link
   * dentro de la MISMA ejecución de finalizeCareerEvent -- no persiste, no
   * cruza eventos, no se comparte fuera de este cierre. No cambia ninguna
   * validación: solo evita repetir una llamada de red ya resuelta.
   */
  identityCache?: CloseIdentityCache;
};

export async function collectJugadorIdsForCareerEvent(
  tipoEvento: JugadorTipoEvento,
  eventoId: string
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("jugador_participaciones")
      .select("jugador_id")
      .eq("tipo_evento", tipoEvento)
      .eq("evento_id", eventoId);
    if (error || !data?.length) return [];
    return Array.from(
      new Set(data.map((r) => String((r as { jugador_id: string }).jugador_id)))
    );
  } catch {
    return [];
  }
}

export function hostClubMetadata(organizadorId: string): Record<string, string> {
  return {
    organizador_id: organizadorId,
    club_name: getOrganizerDisplayNameSync(organizadorId),
  };
}

/** Persistencia confirmada de una participación de ranking/carrera. */
type ParticipacionPersistResult = {
  ok: true;
  jugadorId: string;
  participacionId: string;
};

/** Solo toca touchedJugadorIds cuando hubo escritura/confirmación real. */
export function playerSyncFromPersist(
  persisted: ParticipacionPersistResult | null
): PlayerParticipacionSyncResult {
  if (!persisted?.ok || !persisted.participacionId) {
    return {};
  }
  return { jugadorId: persisted.jugadorId };
}

export async function registrarPuntosRanking(params: {
  jugadorId: string;
  tipoEvento: JugadorTipoEvento;
  eventoId: string;
  eventoNombre: string;
  resultado: JugadorResultado;
  formato: RivieraRankingFormato;
  calcParams: Omit<CalcularPuntosEventoParams, "formato">;
  setsFavor?: number;
  setsContra?: number;
  parejaCon?: string;
  metadata?: Record<string, unknown>;
  skipIfSubtipoExists?: string;
  upsertSubtipo?: string;
  eventoEn?: string;
}): Promise<ParticipacionPersistResult | null> {
  if (await isParticipacionExcluded(params.jugadorId, params.tipoEvento, params.eventoId)) {
    return null;
  }

  if (params.skipIfSubtipoExists) {
    const existing = await getParticipacionBySubtipo(
      params.jugadorId,
      params.tipoEvento,
      params.eventoId,
      params.skipIfSubtipoExists
    );
    if (existing) {
      return {
        ok: true,
        jugadorId: params.jugadorId,
        participacionId: existing.id,
      };
    }
  }

  // Perf batch-1 (2026-08-08): ya se confirmó arriba que NO está excluido y
  // se resuelve aquí el estado de ranking UNA vez -- se reenvía a
  // upsertParticipacionRanking/safeRegistrar para que no repitan el mismo
  // RPC/SELECT para este mismo jugador dentro de esta misma llamada.
  const rankingState = await readJugadorSumaRankingState(params.jugadorId);

  const { total, desglose } = calcularPuntosEventoDesglose({
    formato: params.formato,
    ...params.calcParams,
  });

  const metadata = rankingMetadata(desglose, {
    ...(params.metadata ?? {}),
    ...(params.eventoEn
      ? buildParticipacionFechaFields(params.eventoEn)
      : {}),
  });
  const subtipo =
    params.upsertSubtipo ??
    (typeof params.metadata?.subtipo === "string"
      ? params.metadata.subtipo
      : undefined);

  if (subtipo) {
    const participacionId = await upsertParticipacionRanking({
      jugadorId: params.jugadorId,
      tipoEvento: params.tipoEvento,
      eventoId: params.eventoId,
      eventoNombre: params.eventoNombre,
      resultado: params.resultado,
      subtipo,
      setsFavor: params.setsFavor,
      setsContra: params.setsContra,
      puntosObtenidos: total,
      parejaCon: params.parejaCon,
      metadata,
      fecha: typeof metadata.fecha === "string" ? metadata.fecha : undefined,
      precomputedExcluded: false,
      precomputedRankingState: rankingState,
    });
    return {
      ok: true,
      jugadorId: params.jugadorId,
      participacionId,
    };
  }

  const participacionId = await safeRegistrar({
    jugadorId: params.jugadorId,
    tipoEvento: params.tipoEvento,
    eventoId: params.eventoId,
    eventoNombre: params.eventoNombre,
    resultado: params.resultado,
    setsFavor: params.setsFavor,
    setsContra: params.setsContra,
    puntosObtenidos: total,
    parejaCon: params.parejaCon,
    metadata,
    fecha: typeof metadata.fecha === "string" ? metadata.fecha : undefined,
    precomputedExcluded: false,
    precomputedRankingState: rankingState,
  });
  return {
    ok: true,
    jugadorId: params.jugadorId,
    participacionId,
  };
}

/**
 * Contrato de persistencia: éxito solo con participacion_id confirmado.
 * Errores (incl. autorización) siempre se propagan — nunca swallow.
 */
export async function safeRegistrar(params: {
  jugadorId: string;
  tipoEvento: JugadorTipoEvento;
  eventoId: string;
  eventoNombre: string;
  resultado: JugadorResultado;
  setsFavor?: number;
  setsContra?: number;
  puntosObtenidos?: number;
  parejaCon?: string;
  metadata?: Record<string, unknown>;
  fecha?: string;
  /**
   * Perf batch-1 (2026-08-08): si el caller YA resolvió isParticipacionExcluded
   * para este mismo (jugadorId, tipoEvento, eventoId), reenvía el boolean
   * resultante (true = excluido, false = no excluido) para no repetir el RPC.
   * Tras confirmar que NO está excluido debe pasarse `false` — nunca `true`
   * como “ya verificado” (bug 2026-08-12: true saltaba la escritura).
   */
  precomputedExcluded?: boolean;
  precomputedRankingState?: { sumaRanking: boolean; estado: string | null };
}): Promise<string> {
  const excluded =
    params.precomputedExcluded !== undefined
      ? params.precomputedExcluded
      : await isParticipacionExcluded(params.jugadorId, params.tipoEvento, params.eventoId);
  if (excluded) {
    throw new Error(
      `participación excluida para jugador ${params.jugadorId} en ${params.tipoEvento}/${params.eventoId}`
    );
  }

  const rankingState =
    params.precomputedRankingState ??
    (await readJugadorSumaRankingState(params.jugadorId));
  const puntosCalculados = Math.max(0, params.puntosObtenidos ?? 0);
  const puntos = rankingState.sumaRanking ? puntosCalculados : 0;

  // BLK-04: registro local + ledger oficial global en una sola llamada
  // RPC transaccional (antes: 2 llamadas separadas, podían quedar
  // desalineadas si la segunda fallaba). Ver
  // supabase/migrations/0005_participacion_con_ledger.sql.
  const participacionId = await registrarParticipacionConLedger({
    jugadorId: params.jugadorId,
    tipoEvento: params.tipoEvento,
    eventoId: params.eventoId,
    eventoNombre: params.eventoNombre,
    resultado: params.resultado,
    setsFavor: params.setsFavor,
    setsContra: params.setsContra,
    puntosObtenidos: puntos,
    parejaCon: params.parejaCon,
    metadata: params.metadata,
    fecha: params.fecha,
  });
  if (!participacionId) {
    throw new Error(
      "registrar_participacion_jugador_con_ledger no devolvió participacion_id"
    );
  }
  if (rankingState.sumaRanking) {
    await ensureRivieraJugadorVisibleEnRanking(params.jugadorId);
  }
  return participacionId;
}

export async function getParticipacionBySubtipo(
  jugadorId: string,
  tipoEvento: JugadorTipoEvento,
  eventoId: string,
  subtipo: string
): Promise<{
  id: string;
  puntos_obtenidos: number | null;
  metadata: Record<string, unknown> | null;
  sets_favor: number | null;
  sets_contra: number | null;
  resultado: JugadorResultado | null;
  pareja_con: string | null;
} | null> {
  try {
    const { data, error } = await supabase
      .from("jugador_participaciones")
      .select(
        "id, puntos_obtenidos, metadata, sets_favor, sets_contra, resultado, pareja_con"
      )
      .eq("jugador_id", jugadorId)
      .eq("tipo_evento", tipoEvento)
      .eq("evento_id", eventoId)
      .filter("metadata->>subtipo", "eq", subtipo)
      .maybeSingle();
    if (error || !data) return null;
    return data as {
      id: string;
      puntos_obtenidos: number | null;
      metadata: Record<string, unknown> | null;
      sets_favor: number | null;
      sets_contra: number | null;
      resultado: JugadorResultado | null;
      pareja_con: string | null;
    };
  } catch {
    return null;
  }
}

export async function upsertParticipacionRanking(params: {
  jugadorId: string;
  tipoEvento: JugadorTipoEvento;
  eventoId: string;
  eventoNombre: string;
  resultado: JugadorResultado;
  subtipo: string;
  setsFavor?: number;
  setsContra?: number;
  puntosObtenidos: number;
  parejaCon?: string;
  metadata: Record<string, unknown>;
  force?: boolean;
  fecha?: string;
  /** Perf batch-1 (2026-08-08): ver safeRegistrar. */
  precomputedExcluded?: boolean;
  precomputedRankingState?: { sumaRanking: boolean; estado: string | null };
}): Promise<string> {
  const excluded =
    params.precomputedExcluded !== undefined
      ? params.precomputedExcluded
      : await isParticipacionExcluded(params.jugadorId, params.tipoEvento, params.eventoId);
  if (excluded) {
    throw new Error(
      `participación excluida para jugador ${params.jugadorId} en ${params.tipoEvento}/${params.eventoId}`
    );
  }

  const incomingDetalle = parsePartidosDetalle(params.metadata.partidos_detalle);
  const existing = await getParticipacionBySubtipo(
    params.jugadorId,
    params.tipoEvento,
    params.eventoId,
    params.subtipo
  );

  const mergedMeta = mergeMetadataWithPartidosDetalle(
    existing?.metadata,
    params.metadata,
    incomingDetalle,
    { force: params.force }
  );
  const detSummary = summarizePartidosDetalle(
    parsePartidosDetalle(mergedMeta.partidos_detalle)
  );
  const setsFavor =
    detSummary.jugados > 0
      ? detSummary.setsFavor
      : (params.setsFavor ?? existing?.sets_favor ?? 0);
  const setsContra =
    detSummary.jugados > 0
      ? detSummary.setsContra
      : (params.setsContra ?? existing?.sets_contra ?? 0);
  const rankingState =
    params.precomputedRankingState ??
    (await readJugadorSumaRankingState(params.jugadorId));
  const puntosCalculados = params.puntosObtenidos;
  const puntosObtenidos = rankingState.sumaRanking ? puntosCalculados : 0;

  if (existing) {
    // BLK-04: UPDATE local + ledger oficial global en una sola llamada RPC
    // transaccional (antes: UPDATE directo + ledger por separado). Ver
    // supabase/migrations/0005_participacion_con_ledger.sql.
    // Errores de persistencia se propagan — nunca swallow.
    await actualizarParticipacionConLedger({
      participacionId: existing.id,
      eventoNombre: params.eventoNombre,
      resultado: params.resultado,
      setsFavor,
      setsContra,
      puntosObtenidos,
      parejaCon: params.parejaCon ?? existing.pareja_con,
      metadata: mergedMeta,
    });
    return existing.id;
  }

  return safeRegistrar({
    jugadorId: params.jugadorId,
    tipoEvento: params.tipoEvento,
    eventoId: params.eventoId,
    eventoNombre: params.eventoNombre,
    resultado: params.resultado,
    setsFavor,
    setsContra,
    puntosObtenidos,
    parejaCon: params.parejaCon,
    metadata: mergedMeta,
    fecha: params.fecha,
    // Ya se verificó que NO está excluido; cachear boolean false.
    // Nunca pasar true aquí: true significa "excluido" y salta la escritura.
    precomputedExcluded: false,
    precomputedRankingState: rankingState,
  });
}

/** Persiste snapshot inmutable con merge de partidos_detalle (no sobrescribe si ya hay filas). */
export async function persistParticipacionSnapshot(params: {
  jugadorId: string;
  tipoEvento: JugadorTipoEvento;
  eventoId: string;
  eventoNombre: string;
  resultado: JugadorResultado;
  subtipo: string;
  metadata: Record<string, unknown>;
  partidosDetalle?: PartidoDetalle[];
  setsFavor?: number;
  setsContra?: number;
  puntosObtenidos: number;
  parejaCon?: string;
  force?: boolean;
}): Promise<void> {
  const metadata = params.partidosDetalle?.length
    ? enrichMetadataWithPartidosDetalle(params.metadata, params.partidosDetalle)
    : params.metadata;

  await upsertParticipacionRanking({
    jugadorId: params.jugadorId,
    tipoEvento: params.tipoEvento,
    eventoId: params.eventoId,
    eventoNombre: params.eventoNombre,
    resultado: params.resultado,
    subtipo: params.subtipo,
    setsFavor: params.setsFavor,
    setsContra: params.setsContra,
    puntosObtenidos: params.puntosObtenidos,
    parejaCon: params.parejaCon,
    metadata,
    force: params.force,
  });
}

/** @deprecated Usar pipeline canónico finalizeCareerEvent (refresh centralizado). */
export async function refreshJugadorStatsBatch(jugadorIds: Iterable<string>): Promise<void> {
  const unique = Array.from(new Set(Array.from(jugadorIds).filter(Boolean)));
  await Promise.allSettled(unique.map((id) => rebuildJugadorStats(id)));
}

export function resultadoFromRecord(
  wins: number,
  losses: number,
  draws: number
): JugadorResultado {
  if (wins > losses) return "victoria";
  if (losses > wins) return "derrota";
  if (draws > 0 && wins === losses) return "empate";
  if (wins === losses && wins > 0) return "empate";
  return "participación";
}
export async function fetchPairsByIds(pairIds: string[]): Promise<Pair[]> {
  const unique = Array.from(new Set(pairIds.filter(Boolean)));
  if (unique.length === 0) return [];
  const { data, error } = await supabase
    .from("pairs")
    .select(PAIRS_SELECT)
    .in("id", unique);
  if (error) {
    console.error("[riviera-jugadores] fetchPairsByIds:", error);
    return [];
  }
  return (data ?? []) as Pair[];
}

export function bumpPairPlayers(
  pair: Pair,
  won: boolean,
  drew: boolean,
  setsFavor: number,
  setsContra: number,
  puntosPartido: number,
  agg: Map<string, PlayerAgg>
) {
  const players: Array<{
    id: string;
    name: string;
    legacyPlayerId: string;
  }> = [];
  if (pair.player1_id) {
    players.push({
      id: pair.player1_id,
      name: pair.player1_name || "Jugador",
      legacyPlayerId: pair.player1_id,
    });
  }
  if (pair.player2_id) {
    players.push({
      id: pair.player2_id,
      name: pair.player2_name || "Jugador",
      legacyPlayerId: pair.player2_id,
    });
  }

  for (const pl of players) {
    if (!agg.has(pl.id)) {
      agg.set(pl.id, {
        wins: 0,
        losses: 0,
        draws: 0,
        setsFavor: 0,
        setsContra: 0,
        puntosObtenidos: 0,
        nombre: pl.name,
        legacyPlayerId: pl.legacyPlayerId,
      });
    }
    const st = agg.get(pl.id)!;
    if (drew) st.draws += 1;
    else if (won) st.wins += 1;
    else st.losses += 1;
    st.setsFavor += setsFavor;
    st.setsContra += setsContra;
    st.puntosObtenidos += puntosPartido;
  }
}

export function resolveExpressPartidoOutcome(
  localId: string,
  visitId: string,
  puntosLocal: number | null,
  puntosVisitante: number | null,
  ganadorId: string | null
): "local" | "visitante" | "empate" | null {
  if (ganadorId === localId) return "local";
  if (ganadorId === visitId) return "visitante";
  const pl = puntosLocal ?? 0;
  const pv = puntosVisitante ?? 0;
  if (pl > pv) return "local";
  if (pv > pl) return "visitante";
  if (pl === pv && pl > 0) return "empate";
  return null;
}

export function processExpressPartido(
  localId: string,
  visitId: string,
  puntosLocal: number | null,
  puntosVisitante: number | null,
  ganadorId: string | null,
  pairMap: Map<string, Pair>,
  agg: Map<string, PlayerAgg>
) {
  const local = pairMap.get(localId);
  const visit = pairMap.get(visitId);
  if (!local || !visit) return;

  const outcome = resolveExpressPartidoOutcome(
    localId,
    visitId,
    puntosLocal,
    puntosVisitante,
    ganadorId
  );
  if (!outcome) return;

  const pl = puntosLocal ?? 0;
  const pv = puntosVisitante ?? 0;

  if (outcome === "empate") {
    bumpPairPlayers(local, false, true, pl, pv, pl, agg);
    bumpPairPlayers(visit, false, true, pv, pl, pv, agg);
    return;
  }
  if (outcome === "local") {
    bumpPairPlayers(local, true, false, pl, pv, pl, agg);
    bumpPairPlayers(visit, false, false, pv, pl, pv, agg);
    return;
  }
  bumpPairPlayers(local, false, false, pl, pv, pl, agg);
  bumpPairPlayers(visit, true, false, pv, pl, pv, agg);
}