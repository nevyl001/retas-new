import { supabase } from "../supabaseClient";
import {
  mergeJugadorStatsPuntosTotales,
  rankingPuntosJugador,
} from "./rankingPosition";
import type {
  JugadorParticipacion,
  JugadorResultado,
  JugadorTipoEvento,
  RivieraJugadorWithStats,
} from "./types";

const TEMP_ROMC_LOG_PREFIX = "TEMP_MULTICLUB_ROMC_2_2_B";

export interface OfficialLedgerActivityRow {
  ledger_id: string;
  participacion_id: string;
  official_player_key: string;
  source_organizador_id: string;
  source_club_name: string | null;
  event_type: string;
  event_id: string;
  event_name: string;
  points: number;
  activity_at: string;
  metadata: Record<string, unknown>;
}

/** @deprecated Use OfficialLedgerActivityRow */
export type OfficialCrossClubActivityRow = OfficialLedgerActivityRow;

function logRomcPhase22B(payload: Record<string, unknown>): void {
  console.info(TEMP_ROMC_LOG_PREFIX, payload);
}

function isMissingRomcRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "42883" ||
    error.code === "PGRST202" ||
    msg.includes("could not find the function") ||
    msg.includes("list_riviera_official_player_activity") ||
    msg.includes("list_riviera_official_cross_club_activity") ||
    msg.includes("list_riviera_official_legacy_participaciones") ||
    msg.includes("riviera_official_display_puntos_for_jugador") ||
    msg.includes("riviera_official_ranking_posicion_for_jugador") ||
    msg.includes("get_riviera_oficial_jugador_public_profile")
  );
}

export async function fetchOfficialDisplayPuntosForJugador(
  jugadorId: string
): Promise<number | null> {
  const { data, error } = await supabase.rpc(
    "riviera_official_display_puntos_for_jugador",
    { p_riviera_jugador_id: jugadorId }
  );

  if (error) {
    if (isMissingRomcRpc(error)) return null;
    console.warn("[riviera-official-activity] display_puntos:", error);
    return null;
  }

  const puntos = typeof data === "number" ? data : Number(data ?? 0);
  logRomcPhase22B({
    action: "official_display_puntos",
    jugadorId,
    puntosOficiales: puntos,
    fuente:
      "riviera_official_ledger_points + riviera_official_legacy_points (todos los clubes)",
  });
  return Number.isFinite(puntos) ? puntos : 0;
}

export async function listOfficialPlayerActivity(
  jugadorId: string,
  limit = 100
): Promise<OfficialLedgerActivityRow[]> {
  const { data, error } = await supabase.rpc(
    "list_riviera_official_player_activity",
    {
      p_riviera_jugador_id: jugadorId,
      p_limit: limit,
    }
  );

  if (error) {
    if (isMissingRomcRpc(error)) {
      return listOfficialCrossClubActivity(jugadorId, limit);
    }
    console.warn("[riviera-official-activity] player_activity:", error);
    return [];
  }

  return mapLedgerActivityRows(data, jugadorId, "list_riviera_official_player_activity");
}

/** Compat: delega al listado global completo. */
export async function listOfficialCrossClubActivity(
  jugadorId: string,
  limit = 100
): Promise<OfficialLedgerActivityRow[]> {
  const { data, error } = await supabase.rpc(
    "list_riviera_official_cross_club_activity",
    {
      p_riviera_jugador_id: jugadorId,
      p_limit: limit,
    }
  );

  if (error) {
    if (isMissingRomcRpc(error)) return [];
    console.warn("[riviera-official-activity] cross_club_activity:", error);
    return [];
  }

  return mapLedgerActivityRows(data, jugadorId, "list_riviera_official_cross_club_activity");
}

function mapLedgerActivityRows(
  data: unknown,
  jugadorId: string,
  fuente: string
): OfficialLedgerActivityRow[] {
  const rows = (data ?? []) as Record<string, unknown>[];
  logRomcPhase22B({
    action: "official_player_activity",
    jugadorId,
    count: rows.length,
    fuente,
  });

  return rows.map((row) => ({
    ledger_id: String(row.ledger_id),
    participacion_id: String(row.participacion_id),
    official_player_key: String(row.official_player_key),
    source_organizador_id: String(row.source_organizador_id),
    source_club_name: row.source_club_name ? String(row.source_club_name) : null,
    event_type: String(row.event_type),
    event_id: String(row.event_id),
    event_name: String(row.event_name),
    points: Number(row.points ?? 0),
    activity_at: String(row.activity_at),
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
  }));
}

export async function listOfficialLegacyParticipaciones(
  jugadorId: string,
  limit = 100
): Promise<JugadorParticipacion[]> {
  const { data, error } = await supabase.rpc(
    "list_riviera_official_legacy_participaciones",
    {
      p_riviera_jugador_id: jugadorId,
      p_limit: limit,
    }
  );

  if (error) {
    if (isMissingRomcRpc(error)) return [];
    console.warn("[riviera-official-activity] legacy_participaciones:", error);
    return [];
  }

  const rows = (data ?? []) as JugadorParticipacion[];
  logRomcPhase22B({
    action: "official_legacy_participaciones",
    jugadorId,
    count: rows.length,
    fuente: "list_riviera_official_legacy_participaciones (todos los perfiles enlazados)",
  });
  return rows;
}

const VALID_TIPO_EVENTO = new Set<JugadorTipoEvento>([
  "reta",
  "torneo_express",
  "liga",
  "americano",
  "duelo_2v2",
]);

function inferResultadoFromLedgerMetadata(
  metadata: Record<string, unknown>
): JugadorResultado {
  const placement = String(metadata.placement ?? metadata.posicion ?? "").toLowerCase();
  if (placement === "campeon" || metadata.campeon_torneo === true) return "victoria";
  if (placement === "subcampeon") return "derrota";
  return "participación";
}

export function officialLedgerRowToParticipacion(
  row: OfficialLedgerActivityRow,
  jugadorId: string
): JugadorParticipacion {
  const tipoEvento = VALID_TIPO_EVENTO.has(row.event_type as JugadorTipoEvento)
    ? (row.event_type as JugadorTipoEvento)
    : "reta";
  const clubLabel = row.source_club_name?.trim() || "Club";
  const meta = row.metadata ?? {};

  return {
    id: row.participacion_id,
    jugador_id: jugadorId,
    tipo_evento: tipoEvento,
    evento_id: row.event_id,
    evento_nombre: row.event_name,
    fecha: row.activity_at.slice(0, 10),
    resultado: inferResultadoFromLedgerMetadata(meta),
    sets_favor: 0,
    sets_contra: 0,
    puntos_obtenidos: row.points,
    pareja_con: null,
    metadata: {
      ...meta,
      subtipo:
        typeof meta.subtipo === "string"
          ? meta.subtipo
          : `${tipoEvento}_romc_global`,
      romc_ledger_id: row.ledger_id,
      romc_global: true,
      source_organizer_id: row.source_organizador_id,
      source_club_name: clubLabel,
      modalidad_label: meta.modalidad_label ?? tipoEvento.replace(/_/g, " "),
      lugar: meta.lugar ?? clubLabel,
      puntos_aplicados: true,
      puntos_evento: row.points,
    },
    created_at: row.activity_at,
  };
}

/** Historial oficial global: ledger (todos los clubes) + legacy sin duplicar. */
export function mergeOfficialGlobalParticipaciones(
  legacyParticipaciones: JugadorParticipacion[],
  ledgerRows: OfficialLedgerActivityRow[],
  jugadorId: string
): JugadorParticipacion[] {
  const ledgerIds = new Set(ledgerRows.map((row) => row.participacion_id));
  const fromLedger = ledgerRows.map((row) =>
    officialLedgerRowToParticipacion(row, jugadorId)
  );
  const legacyOnly = legacyParticipaciones.filter((p) => !ledgerIds.has(p.id));

  const merged = [...fromLedger, ...legacyOnly];
  merged.sort(
    (a, b) =>
      b.fecha.localeCompare(a.fecha) ||
      b.created_at.localeCompare(a.created_at)
  );

  logRomcPhase22B({
    action: "historial_merged_global",
    jugadorId,
    ledgerCount: fromLedger.length,
    legacyCount: legacyOnly.length,
    mergedCount: merged.length,
    fuenteHistorial:
      "riviera_official_points_ledger (todos los clubes) + legacy sin ledger",
  });

  return merged;
}

/** ROMC global + participaciones locales del club sin duplicar. */
export function mergeRomcWithLocalParticipaciones(
  localParticipaciones: JugadorParticipacion[],
  legacyParticipaciones: JugadorParticipacion[],
  ledgerRows: OfficialLedgerActivityRow[],
  jugadorId: string
): JugadorParticipacion[] {
  const fromRomc = mergeOfficialGlobalParticipaciones(
    legacyParticipaciones,
    ledgerRows,
    jugadorId
  );
  const romcIds = new Set(fromRomc.map((row) => row.id));
  const localOnly = localParticipaciones.filter((row) => !romcIds.has(row.id));
  const merged = [...fromRomc, ...localOnly];
  merged.sort(
    (a, b) =>
      b.fecha.localeCompare(a.fecha) ||
      b.created_at.localeCompare(a.created_at)
  );
  return merged;
}

export interface RomcOfficialPlayerView {
  historial: JugadorParticipacion[];
  puntosOficiales: number | null;
  hasRomcData: boolean;
}

/** Vista oficial global: ledger + legacy (+ merge opcional con local). */
export async function loadRomcOfficialPlayerView(
  jugadorId: string,
  options?: {
    localParticipaciones?: JugadorParticipacion[];
    limit?: number;
  }
): Promise<RomcOfficialPlayerView> {
  const limit = options?.limit ?? 100;
  const localParticipaciones = options?.localParticipaciones ?? [];

  const [ledgerActivity, legacyParticipaciones, displayPuntos] =
    await Promise.all([
      listOfficialPlayerActivity(jugadorId, limit),
      listOfficialLegacyParticipaciones(jugadorId, limit),
      fetchOfficialDisplayPuntosForJugador(jugadorId),
    ]);

  const hasRomcData =
    ledgerActivity.length > 0 ||
    legacyParticipaciones.length > 0 ||
    (displayPuntos != null && displayPuntos > 0);

  if (!hasRomcData) {
    return {
      historial: localParticipaciones,
      puntosOficiales: null,
      hasRomcData: false,
    };
  }

  const historial = mergeRomcWithLocalParticipaciones(
    localParticipaciones,
    legacyParticipaciones,
    ledgerActivity,
    jugadorId
  );
  const puntosOficiales =
    displayPuntos ??
    (historial.length > 0 ? sumParticipacionesPuntos(historial) : null);

  logRomcPhase22B({
    action: "official_player_view_loaded",
    jugadorId,
    hasRomcData,
    puntosOficiales,
    historialCount: historial.length,
    ledgerCount: ledgerActivity.length,
    legacyCount: legacyParticipaciones.length,
    localCount: localParticipaciones.length,
  });

  return { historial, puntosOficiales, hasRomcData };
}

export function sumParticipacionesPuntos(
  participaciones: JugadorParticipacion[]
): number {
  return participaciones.reduce(
    (sum, row) => sum + Math.max(0, Number(row.puntos_obtenidos ?? 0)),
    0
  );
}

export async function fetchOfficialRankingPosicionForJugador(
  jugadorId: string,
  organizadorId: string,
  categoria: string,
  genero: "M" | "F" = "M"
): Promise<number | null> {
  const { data, error } = await supabase.rpc(
    "riviera_official_ranking_posicion_for_jugador",
    {
      p_jugador_id: jugadorId,
      p_organizador_id: organizadorId,
      p_categoria: categoria,
      p_genero: genero === "F" ? "F" : "M",
    }
  );

  if (error) {
    if (isMissingRomcRpc(error)) return null;
    console.warn("[riviera-official-activity] ranking_posicion:", error);
    return null;
  }

  const pos = typeof data === "number" ? data : Number(data ?? NaN);
  return Number.isFinite(pos) && pos > 0 ? pos : null;
}

export async function enrichJugadoresWithOfficialPuntos(
  jugadores: RivieraJugadorWithStats[]
): Promise<RivieraJugadorWithStats[]> {
  if (jugadores.length === 0) return jugadores;

  const enriched = await Promise.all(
    jugadores.map(async (j) => {
      const global = await fetchOfficialDisplayPuntosForJugador(j.id);
      if (global == null) return j;
      const stats = j.stats
        ? mergeJugadorStatsPuntosTotales(j.stats, global)
        : j.stats;
      return {
        ...j,
        officialPuntosGlobal: global,
        stats,
      };
    })
  );

  return [...enriched].sort((a, b) => {
    const pa = rankingPuntosJugador(a);
    const pb = rankingPuntosJugador(b);
    if (pb !== pa) return pb - pa;
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

/** @deprecated Use mergeOfficialGlobalParticipaciones */
export function mergeOfficialCrossClubParticipaciones(
  localParticipaciones: JugadorParticipacion[],
  ledgerRows: OfficialLedgerActivityRow[],
  jugadorId: string
): JugadorParticipacion[] {
  return mergeOfficialGlobalParticipaciones(
    localParticipaciones,
    ledgerRows,
    jugadorId
  );
}
