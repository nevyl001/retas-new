import { TIPO_EVENTO_LABELS } from "./constants";
import type { JugadorParticipacion, JugadorTipoEvento } from "./types";

export type HistorialModalidadId =
  | "torneo_express"
  | "liga"
  | "reta"
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
  puntos?: number;
  esCampeon: boolean;
  esSubcampeon: boolean;
  tipoEvento: JugadorTipoEvento;
}

const MODALIDAD_ICONS: Record<HistorialModalidadId, string> = {
  torneo_express: "⚡",
  liga: "🏅",
  reta: "🏆",
  round_robin: "🔄",
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

export function resolveModalidadFromParticipacion(
  row: JugadorParticipacion
): { id: HistorialModalidadId; label: string } {
  const meta = row.metadata ?? {};
  const explicit = metaStr(meta, "modalidad");
  if (explicit === "round_robin") {
    return { id: "round_robin", label: "Round Robin" };
  }
  if (explicit === "reta_equipos" || explicit === "teams") {
    return { id: "reta_equipos", label: "Reta por equipos" };
  }
  if (explicit === "dual_meet") {
    return { id: "dual_meet", label: "Dual Meet" };
  }
  const label = metaStr(meta, "modalidad_label");
  if (label) {
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
    if (fmt === "round_robin") {
      return { id: "round_robin", label: "Round Robin" };
    }
    return { id: "reta", label: TIPO_EVENTO_LABELS.reta };
  }

  return { id: "reta", label: TIPO_EVENTO_LABELS.reta };
}

function inferIdFromLabel(label: string): HistorialModalidadId {
  const l = label.toLowerCase();
  if (l.includes("americano")) return "americano";
  if (l.includes("liga")) return "liga";
  if (l.includes("torneo")) return "torneo_express";
  if (l.includes("round")) return "round_robin";
  if (l.includes("dual")) return "dual_meet";
  if (l.includes("equipo")) return "reta_equipos";
  return "reta";
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
  row: JugadorParticipacion
): HistorialItemView {
  const { id: modalidadId, label: modalidadLabel } =
    resolveModalidadFromParticipacion(row);
  const meta = row.metadata ?? {};
  const lugarLabel = resolveLugarLabel(row);
  const ligaNombre = metaStr(meta, "liga_nombre");
  const jornadaNum = metaNum(meta, "jornada_numero");

  let detalle: string | undefined;
  if (row.pareja_con) {
    detalle = `Pareja: ${row.pareja_con}`;
  }
  if (row.tipo_evento === "liga" && ligaNombre) {
    detalle = jornadaNum
      ? `${ligaNombre} · Jornada ${jornadaNum}`
      : ligaNombre;
  }

  const partidos = metaNum(meta, "partidos_ganados");
  const partidosPerdidos = metaNum(meta, "partidos_perdidos");
  if (
    partidos != null &&
    (row.tipo_evento === "reta" ||
      row.tipo_evento === "torneo_express" ||
      modalidadId === "round_robin")
  ) {
    const extra = `${partidos}V${partidosPerdidos != null ? ` · ${partidosPerdidos}D` : ""}`;
    detalle = detalle ? `${detalle} · ${extra}` : extra;
  }

  return {
    id: row.id,
    modalidadId,
    modalidadLabel,
    modalidadIcon: MODALIDAD_ICONS[modalidadId] ?? "🏆",
    eventoNombre: row.evento_nombre,
    fecha: row.fecha,
    lugarLabel,
    detalle,
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
