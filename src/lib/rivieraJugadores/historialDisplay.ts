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

function isTorneoRoundRobin(meta: Record<string, unknown>): boolean {
  const explicit = metaStr(meta, "modalidad");
  if (explicit === "torneo" || explicit === "round_robin") return true;
  const label = (metaStr(meta, "modalidad_label") ?? "").toLowerCase();
  if (label === "torneo" || label.includes("round robin")) return true;
  const fmt = metaStr(meta, "formato");
  return fmt === "round_robin";
}

export function resolveModalidadFromParticipacion(
  row: JugadorParticipacion
): { id: HistorialModalidadId; label: string } {
  const meta = row.metadata ?? {};
  const explicit = metaStr(meta, "modalidad");
  if (explicit === "torneo" || explicit === "round_robin") {
    return { id: "torneo", label: "Torneo" };
  }
  if (explicit === "reta_equipos" || explicit === "teams") {
    return { id: "reta_equipos", label: "Reta por equipos" };
  }
  if (explicit === "dual_meet") {
    return { id: "dual_meet", label: "Dual Meet" };
  }
  const label = metaStr(meta, "modalidad_label");
  if (label) {
    const normalized = label.toLowerCase();
    if (normalized === "torneo" || normalized.includes("round robin")) {
      return { id: "torneo", label: "Torneo" };
    }
    const id = (explicit as HistorialModalidadId) || inferIdFromLabel(label);
    return { id, label };
  }

  if (row.tipo_evento === "americano") {
    return { id: "americano", label: "Pádel Americano" };
  }
  if (row.tipo_evento === "liga") {
    return { id: "liga", label: "Liga" };
  }
  if (row.tipo_evento === "torneo_express") {
    return { id: "torneo_express", label: "Torneo Express" };
  }
  if (row.tipo_evento === "reta") {
    const fmt = metaStr(meta, "formato");
    if (fmt === "teams" || fmt === "reta_equipos") {
      return { id: "reta_equipos", label: "Reta por equipos" };
    }
    if (isTorneoRoundRobin(meta)) {
      return { id: "torneo", label: "Torneo" };
    }
    return { id: "reta", label: TIPO_EVENTO_LABELS.reta };
  }

  return { id: "reta", label: TIPO_EVENTO_LABELS.reta };
}

function inferIdFromLabel(label: string): HistorialModalidadId {
  const l = label.toLowerCase();
  if (l.includes("americano")) return "americano";
  if (l.includes("liga")) return "liga";
  if (l.includes("express")) return "torneo_express";
  if (l.includes("round")) return "torneo";
  if (l === "torneo") return "torneo";
  if (l.includes("dual")) return "dual_meet";
  if (l.includes("equipo")) return "reta_equipos";
  return "reta";
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
  const wins = metaNum(meta, "partidos_ganados");
  const losses = metaNum(meta, "partidos_perdidos");
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
      lugarLabel === "Campeón" ||
      meta.placement === "campeon" ||
      meta.campeon_torneo === true ||
      metaStr(meta, "placement") === "campeon",
    esSubcampeon:
      lugarLabel === "Subcampeón" ||
      meta.placement === "subcampeon" ||
      meta.subcampeon_torneo === true ||
      metaStr(meta, "placement") === "subcampeon",
    tipoEvento: row.tipo_evento,
  };
}

export function computePublicProfileStats(
  participaciones: JugadorParticipacion[]
): {
  torneos: number;
  victorias: number;
  winRate: number | null;
} {
  let victorias = 0;
  let derrotas = 0;
  for (const p of participaciones) {
    if (p.resultado === "victoria") victorias += 1;
    else if (p.resultado === "derrota") derrotas += 1;
  }
  const decided = victorias + derrotas;
  const winRate =
    decided > 0 ? Math.round((victorias / decided) * 100) : null;
  return {
    torneos: participaciones.length,
    victorias,
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
