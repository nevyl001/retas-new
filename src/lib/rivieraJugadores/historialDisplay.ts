import {
  JUGADOR_CATEGORIA_LABELS,
  TIPO_EVENTO_LABELS,
} from "./constants";
import type {
  JugadorParticipacion,
  JugadorTipoEvento,
  RivieraJugadorCategoria,
} from "./types";

export type HistorialModalidadId =
  | "torneo_express"
  | "liga"
  | "reta"
  | "torneo"
  | "round_robin"
  | "reta_equipos"
  | "americano"
  | "dual_meet";

export interface HistorialItemView {
  id: string;
  modalidadId: HistorialModalidadId;
  modalidadLabel: string;
  modalidadIcon: string;
  eventoNombre: string;
  fecha: string;
  lugarLabel: string;
  detalle?: string;
  categoriaLabel?: string;
  eventoDescripcion?: string;
  balanceLabel?: string;
  puntos?: number;
  esCampeon: boolean;
  esSubcampeon: boolean;
  tipoEvento: JugadorTipoEvento;
}

const MODALIDAD_ICONS: Record<HistorialModalidadId, string> = {
  torneo_express: "⚡",
  liga: "🏅",
  reta: "🏆",
  torneo: "🏆",
  round_robin: "🏆",
  reta_equipos: "👥",
  americano: "🎾",
  dual_meet: "🤝",
};

function metaStr(meta: Record<string, unknown>, key: string): string | undefined {
  const v = meta[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Ajustes de puntos hechos por el organizador (no se muestran en fichas/historial). */
export function isParticipacionAjusteManual(row: JugadorParticipacion): boolean {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  if (meta.subtipo === "ajuste_manual") return true;
  const nombre = row.evento_nombre?.trim() ?? "";
  return nombre.startsWith("Ajuste manual");
}

export function filterParticipacionesHistorialVisible(
  rows: JugadorParticipacion[]
): JugadorParticipacion[] {
  return rows.filter((p) => !isParticipacionAjusteManual(p));
}

function metaNum(meta: Record<string, unknown>, key: string): number | undefined {
  const v = meta[key];
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

export function placementTorneoLabel(placement: string): string {
  if (placement === "campeon") return "Campeón";
  if (placement === "subcampeon") return "Subcampeón";
  return "Participación";
}

export function formatLugarOrdinal(pos: number, total?: number): string {
  if (pos === 1) return "1er lugar";
  if (pos === 2) return "2do lugar";
  if (pos === 3) return "3er lugar";
  if (total && total > 0) return `${pos}º de ${total}`;
  return `${pos}º lugar`;
}

/** Reta cerrada en app (tournaments), distinto de Torneo Express. */
function isRetaParticipacion(row: JugadorParticipacion): boolean {
  return row.tipo_evento === "reta";
}

export function resolveModalidadFromParticipacion(
  row: JugadorParticipacion
): { id: HistorialModalidadId; label: string } {
  const meta = row.metadata ?? {};
  const explicit = metaStr(meta, "modalidad");

  if (row.tipo_evento === "torneo_express") {
    return { id: "torneo_express", label: "Torneos" };
  }
  if (row.tipo_evento === "americano") {
    return { id: "americano", label: "Pádel Americano" };
  }
  if (row.tipo_evento === "liga") {
    return { id: "liga", label: "Liga" };
  }
  if (row.tipo_evento === "duelo_2v2") {
    return { id: "dual_meet", label: "Duelo 2 vs 2" };
  }
  if (isRetaParticipacion(row)) {
    if (
      explicit === "reta_equipos" ||
      explicit === "teams" ||
      metaStr(meta, "formato") === "teams"
    ) {
      return { id: "reta_equipos", label: "Reta por equipos" };
    }
    const fmt = metaStr(meta, "formato");
    if (fmt === "round_robin" || explicit === "round_robin") {
      return { id: "round_robin", label: TIPO_EVENTO_LABELS.reta };
    }
    return { id: "reta", label: TIPO_EVENTO_LABELS.reta };
  }

  if (explicit === "reta_equipos" || explicit === "teams") {
    return { id: "reta_equipos", label: "Reta por equipos" };
  }
  const label = metaStr(meta, "modalidad_label");
  if (label) {
    const id = (explicit as HistorialModalidadId) || inferIdFromLabel(label);
    return { id, label };
  }

  return { id: "reta", label: TIPO_EVENTO_LABELS.reta };
}

function inferIdFromLabel(label: string): HistorialModalidadId {
  const l = label.toLowerCase();
  if (l.includes("americano")) return "americano";
  if (l.includes("liga")) return "liga";
  if (l.includes("express") || l === "torneos") return "torneo_express";
  if (l.includes("round")) return "round_robin";
  if (l.includes("dual")) return "dual_meet";
  if (l.includes("equipo")) return "reta_equipos";
  if (l.includes("reta")) return "reta";
  return "reta";
}

/** Victoria en el evento (incluye 1.er lugar aunque resultado sea participación). */
export function participacionCuentaComoVictoria(
  row: JugadorParticipacion
): boolean {
  if (row.resultado === "victoria") return true;
  if (row.resultado === "derrota") return false;

  const meta = row.metadata ?? {};
  if (meta.placement === "campeon" || meta.campeon_torneo === true) return true;

  const pos =
    metaNum(meta, "posicion") ??
    metaNum(meta, "posicion_final") ??
    metaNum(meta, "posicion_jornada");
  if (pos === 1) return true;

  const lugar = (metaStr(meta, "lugar") ?? resolveLugarLabel(row)).toLowerCase();
  if (lugar === "campeón" || lugar.startsWith("1er")) return true;

  return false;
}

export function participacionCuentaComoDerrota(
  row: JugadorParticipacion
): boolean {
  if (row.resultado === "derrota") return true;
  if (participacionCuentaComoVictoria(row)) return false;

  const meta = row.metadata ?? {};
  const pos =
    metaNum(meta, "posicion") ?? metaNum(meta, "posicion_final");
  if (pos != null && pos > 1) return true;

  return false;
}

function resolveCategoriaLabel(
  meta: Record<string, unknown>,
  fallback?: RivieraJugadorCategoria
): string | undefined {
  const raw = metaStr(meta, "jugador_categoria") ?? metaStr(meta, "categoria");
  if (raw && raw in JUGADOR_CATEGORIA_LABELS) {
    return JUGADOR_CATEGORIA_LABELS[raw as RivieraJugadorCategoria];
  }
  if (fallback) return JUGADOR_CATEGORIA_LABELS[fallback];
  return undefined;
}

/** Victorias y derrotas en partidos del evento (no confundir con V/D del marcador de sets). */
function formatBalanceParticipacion(
  meta: Record<string, unknown>,
  row: JugadorParticipacion
): string | undefined {
  let wins = metaNum(meta, "partidos_ganados");
  let losses = metaNum(meta, "partidos_perdidos");
  if (wins == null) wins = metaNum(meta, "victorias_ranking");
  if (losses == null && wins != null) {
    const jugados =
      metaNum(meta, "partidos_jugados") ?? metaNum(meta, "partidos");
    const empates = metaNum(meta, "partidos_empatados") ?? 0;
    if (jugados != null) losses = Math.max(0, jugados - wins - empates);
  }
  if (wins != null && (wins > 0 || (losses ?? 0) > 0)) {
    const wTxt = `${wins} victoria${wins === 1 ? "" : "s"}`;
    const lTxt =
      losses != null && losses > 0
        ? ` · ${losses} derrota${losses === 1 ? "" : "s"}`
        : "";
    return wTxt + lTxt;
  }
  const sf = row.sets_favor ?? 0;
  const sc = row.sets_contra ?? 0;
  if (sf > 0 || sc > 0) {
    return `Marcador acumulado ${sf}–${sc}`;
  }
  return undefined;
}

export function resolveLugarLabel(row: JugadorParticipacion): string {
  const meta = row.metadata ?? {};
  const stored = metaStr(meta, "lugar") ?? metaStr(meta, "lugar_label");
  if (stored) return stored;

  const placement = metaStr(meta, "placement");
  if (placement === "campeon" || meta.campeon_torneo === true) {
    return "Campeón";
  }
  if (placement === "subcampeon" || meta.subcampeon_torneo === true) {
    return "Subcampeón";
  }

  const pos =
    metaNum(meta, "posicion") ??
    metaNum(meta, "posicion_final") ??
    metaNum(meta, "posicion_jornada");
  const total = metaNum(meta, "total_participantes");

  if (pos != null && pos > 0) {
    if (pos === 1 && row.tipo_evento === "liga") return "1er lugar en jornada";
    return formatLugarOrdinal(pos, total);
  }

  if (row.resultado === "victoria") return "Victoria";
  if (row.resultado === "derrota") return "Derrota";
  if (row.resultado === "empate") return "Empate";
  return "Participación";
}

export function participacionToHistorialItem(
  row: JugadorParticipacion,
  opts?: { categoriaFallback?: RivieraJugadorCategoria }
): HistorialItemView {
  const { id: modalidadId, label: modalidadLabel } =
    resolveModalidadFromParticipacion(row);
  const meta = row.metadata ?? {};
  const lugarLabel = resolveLugarLabel(row);
  const ligaNombre = metaStr(meta, "liga_nombre");
  const jornadaNum = metaNum(meta, "jornada_numero");
  const categoriaLabel = resolveCategoriaLabel(meta, opts?.categoriaFallback);
  const eventoDescripcion =
    metaStr(meta, "evento_descripcion") ??
    metaStr(meta, "reta_descripcion") ??
    metaStr(meta, "descripcion");
  const balanceLabel = formatBalanceParticipacion(meta, row);

  const detalleParts: string[] = [];
  if (categoriaLabel) detalleParts.push(categoriaLabel);
  if (
    row.tipo_evento === "reta" &&
    metaStr(meta, "formato") === "round_robin"
  ) {
    detalleParts.push("Round Robin");
  }
  if (row.pareja_con) detalleParts.push(`Pareja: ${row.pareja_con}`);
  if (row.tipo_evento === "liga" && ligaNombre) {
    detalleParts.push(
      jornadaNum ? `${ligaNombre} · Jornada ${jornadaNum}` : ligaNombre
    );
  }
  if (balanceLabel) detalleParts.push(balanceLabel);
  const detalle =
    detalleParts.length > 0 ? detalleParts.join(" · ") : undefined;

  return {
    id: row.id,
    modalidadId,
    modalidadLabel,
    modalidadIcon: MODALIDAD_ICONS[modalidadId] ?? "🏆",
    eventoNombre: row.evento_nombre,
    fecha: row.fecha,
    lugarLabel,
    detalle,
    categoriaLabel,
    eventoDescripcion,
    balanceLabel,
    puntos: row.puntos_obtenidos > 0 ? row.puntos_obtenidos : undefined,
    esCampeon:
      participacionCuentaComoVictoria(row) &&
      (lugarLabel === "Campeón" ||
        lugarLabel.startsWith("1er") ||
        meta.placement === "campeon" ||
        meta.campeon_torneo === true ||
        metaStr(meta, "placement") === "campeon"),
    esSubcampeon:
      lugarLabel === "Subcampeón" ||
      meta.placement === "subcampeon" ||
      meta.subcampeon_torneo === true ||
      metaStr(meta, "placement") === "subcampeon",
    tipoEvento: row.tipo_evento,
  };
}

function isLigaInscripcionParticipacion(row: JugadorParticipacion): boolean {
  const meta = row.metadata ?? {};
  return meta.subtipo === "liga_inscripcion";
}

/** Partidos ganados/perdidos dentro de cada evento (no el puesto final del torneo). */
export function extractPartidosFromParticipacion(
  row: JugadorParticipacion
): { ganados: number; perdidos: number; empates: number } {
  const meta = row.metadata ?? {};

  if (isLigaInscripcionParticipacion(row)) {
    return { ganados: 0, perdidos: 0, empates: 0 };
  }

  const hasWinsKey = metaNum(meta, "partidos_ganados") != null;
  const hasLossesKey = metaNum(meta, "partidos_perdidos") != null;
  const victoriasRanking = metaNum(meta, "victorias_ranking");
  const jugados =
    metaNum(meta, "partidos_jugados") ?? metaNum(meta, "partidos");

  let ganados =
    metaNum(meta, "partidos_ganados") ?? victoriasRanking;
  let perdidos = metaNum(meta, "partidos_perdidos");
  let empates = metaNum(meta, "partidos_empatados") ?? 0;

  if (hasWinsKey || hasLossesKey || victoriasRanking != null) {
    if (perdidos == null && jugados != null && ganados != null) {
      perdidos = Math.max(0, jugados - ganados - empates);
    }
    const g = ganados ?? 0;
    const p = perdidos ?? 0;
    if (g + p + empates > 0) {
      return { ganados: g, perdidos: p, empates };
    }
    if (jugados != null && jugados > 0) {
      /* Metadatos incompletos: hay partidos pero sin desglose W/L. */
    } else {
      return { ganados: g, perdidos: p, empates };
    }
  }

  const sf = row.sets_favor ?? 0;
  const sc = row.sets_contra ?? 0;
  // sets_favor en reta/americano/liga = games acumulados, no contar como 1 partido.
  const skipSetsAsSingleMatch =
    row.tipo_evento === "reta" ||
    row.tipo_evento === "americano" ||
    row.tipo_evento === "liga" ||
    row.tipo_evento === "duelo_2v2";
  if (!skipSetsAsSingleMatch && (sf > 0 || sc > 0)) {
    if (sf > sc) return { ganados: 1, perdidos: 0, empates: 0 };
    if (sc > sf) return { ganados: 0, perdidos: 1, empates: 0 };
    return { ganados: 0, perdidos: 0, empates: 1 };
  }

  if (participacionCuentaComoVictoria(row)) {
    return { ganados: 1, perdidos: 0, empates: 0 };
  }
  if (participacionCuentaComoDerrota(row)) {
    return { ganados: 0, perdidos: 1, empates: 0 };
  }
  if (row.resultado === "empate") {
    return { ganados: 0, perdidos: 0, empates: 1 };
  }

  return { ganados: 0, perdidos: 0, empates: 0 };
}

export function computeWinRatePct(
  ganados: number,
  perdidos: number
): number | null {
  const decididos = ganados + perdidos;
  if (decididos <= 0) return ganados > 0 ? 100 : null;
  return Math.round((ganados / decididos) * 100);
}

export function computePublicProfileStats(
  participaciones: JugadorParticipacion[]
): {
  /** Solo eventos tipo reta (admin / desglose). */
  retasClasicas: number;
  /** Retas + americanos + ligas + torneos (tarjeta pública «Retas»). */
  eventosJugados: number;
  torneosExpress: number;
  ligas: number;
  americanos: number;
  /** Partidos ganados en duelos (suma de todos los eventos). */
  partidosGanados: number;
  partidosPerdidos: number;
  partidosEmpatados: number;
  victorias: number;
  winRate: number | null;
} {
  let retasClasicas = 0;
  let torneosExpress = 0;
  let ligas = 0;
  let americanos = 0;
  let partidosGanados = 0;
  let partidosPerdidos = 0;
  let partidosEmpatados = 0;

  const visible = filterParticipacionesHistorialVisible(participaciones);

  for (const p of visible) {
    if (p.tipo_evento === "reta") retasClasicas += 1;
    else if (p.tipo_evento === "torneo_express") torneosExpress += 1;
    else if (p.tipo_evento === "liga") ligas += 1;
    else if (p.tipo_evento === "americano") americanos += 1;
    else if (p.tipo_evento === "duelo_2v2") retasClasicas += 1;

    const m = extractPartidosFromParticipacion(p);
    partidosGanados += m.ganados;
    partidosPerdidos += m.perdidos;
    partidosEmpatados += m.empates;
  }

  const winRate = computeWinRatePct(partidosGanados, partidosPerdidos);

  return {
    retasClasicas,
    eventosJugados: visible.length,
    torneosExpress,
    ligas,
    americanos,
    partidosGanados,
    partidosPerdidos,
    partidosEmpatados,
    victorias: partidosGanados,
    winRate,
  };
}

export function groupHistorialResumen(items: HistorialItemView[]): {
  campeonatos: number;
  subcampeonatos: number;
  porModalidad: Record<string, number>;
} {
  let campeonatos = 0;
  let subcampeonatos = 0;
  const porModalidad: Record<string, number> = {};

  for (const it of items) {
    porModalidad[it.modalidadLabel] = (porModalidad[it.modalidadLabel] ?? 0) + 1;
    if (it.esCampeon) campeonatos += 1;
    if (it.esSubcampeon) subcampeonatos += 1;
  }

  return { campeonatos, subcampeonatos, porModalidad };
}

export interface RankingEvolutionPoint {
  fecha: string;
  eventoNombre: string;
  delta: number;
  puntosAcumulados: number;
}

/** Serie temporal de puntos Riviera a partir del historial de participaciones. */
export function computeRankingEvolution(
  participaciones: JugadorParticipacion[]
): RankingEvolutionPoint[] {
  const visible = filterParticipacionesHistorialVisible(participaciones)
    .filter((p) => (p.puntos_obtenidos ?? 0) > 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  let acumulado = 0;
  return visible.map((p) => {
    const delta = p.puntos_obtenidos ?? 0;
    acumulado += delta;
    return {
      fecha: p.fecha,
      eventoNombre: p.evento_nombre,
      delta,
      puntosAcumulados: acumulado,
    };
  });
}
