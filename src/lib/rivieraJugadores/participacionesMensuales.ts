/**
 * Ranking -> Participaciones (2026-08-08): clasificación pública mensual de
 * actividad deportiva real. Solo lectura -- consume las 2 RPC públicas de
 * supabase/migrations/0023_participaciones_mensual_public.sql. No duplica
 * ninguna lógica de negocio del backend: la allowlist de modalidades, la
 * deduplicación canónica y el cálculo de RANK() viven exclusivamente en SQL.
 */
import { supabasePublicRead } from "../supabaseClient";
import { mexicoDateParts } from "../matchDate";
import type { RivieraJugadorGenero } from "./genero";
import type { RivieraJugadorCategoria } from "./types";
import type { JugadorTipoEvento } from "./types";

export interface YearMonth {
  year: number;
  month: number; // 1-12
}

export interface ParticipacionRankingRow {
  jugador_id: string;
  nombre: string;
  slug: string | null;
  foto_url: string | null;
  riviera_id: string | null;
  categoria: string | null;
  genero: string | null;
  total_participaciones: number;
  puntos_mes: number;
  ultima_participacion: string | null;
  posicion_competitiva: number;
}

export interface ParticipacionDetalleRow {
  participacion_id: string;
  fecha: string;
  evento_nombre: string | null;
  tipo_evento: string;
  resultado: string | null;
  puntos_obtenidos: number;
  club_name: string | null;
  lugar: string | null;
}

/** Nombres amigables de modalidad para UI -- fail-open solo para mostrar texto (la allowlist real de qué cuenta vive en SQL). */
export const PARTICIPACION_TIPO_EVENTO_LABELS: Record<string, string> = {
  reta: "Reta",
  duelo_2v2: "Duelo 2v2",
  americano: "Americano",
  torneo_express: "Torneo Express",
  liga: "Liga",
};

export function participacionTipoEventoLabel(
  tipoEvento: JugadorTipoEvento | string
): string {
  return PARTICIPACION_TIPO_EVENTO_LABELS[tipoEvento] ?? tipoEvento;
}

const MESES_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const MESES_ES_CORTO = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/** Mes/año calendario actual en zona horaria de México (nunca UTC del navegador). */
export function currentYearMonthMexico(): YearMonth {
  const { year, month } = mexicoDateParts(new Date());
  return { year, month };
}

function toOrdinal(ym: YearMonth): number {
  return ym.year * 12 + (ym.month - 1);
}

export function isSameYearMonth(a: YearMonth, b: YearMonth): boolean {
  return a.year === b.year && a.month === b.month;
}

/** true si ym es posterior al mes actual en México -- bloquea navegación a futuro. */
export function isFutureYearMonth(ym: YearMonth, now: YearMonth = currentYearMonthMexico()): boolean {
  return toOrdinal(ym) > toOrdinal(now);
}

export function shiftYearMonth(ym: YearMonth, deltaMonths: number): YearMonth {
  const ordinal = toOrdinal(ym) + deltaMonths;
  const year = Math.floor(ordinal / 12);
  const month = ((ordinal % 12) + 12) % 12 + 1;
  return { year, month };
}

/** "Agosto 2026" */
export function formatYearMonthLong(ym: YearMonth): string {
  return `${monthNameLongEs(ym.month)} ${ym.year}`;
}

/** "Agosto" (sin año) -- para encabezados de calendario/detalle día por día. */
export function monthNameLongEs(month: number): string {
  const label = MESES_ES[month - 1] ?? String(month);
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

/** "08 AGO" para filas de detalle cronológico. */
export function formatDetalleFechaShort(fechaYyyyMmDd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaYyyyMmDd);
  if (!m) return fechaYyyyMmDd;
  const day = m[3];
  const monthLabel = (MESES_ES_CORTO[Number(m[2]) - 1] ?? m[2]).toUpperCase();
  return `${day} ${monthLabel}`;
}

/** Día del mes (1-31) en calendario, sin conversión de zona horaria (fecha ya es YYYY-MM-DD). */
export function dayOfMonthFromFecha(fechaYyyyMmDd: string): number | null {
  const m = /^\d{4}-\d{2}-(\d{2})/.exec(fechaYyyyMmDd);
  return m ? Number(m[1]) : null;
}

export async function listRankingParticipacionesMensual(
  organizadorId: string,
  ym: YearMonth,
  categoria?: RivieraJugadorCategoria | null,
  genero?: RivieraJugadorGenero | null
): Promise<ParticipacionRankingRow[] | null> {
  const orgId = organizadorId.trim();
  if (!orgId) return [];

  const { data, error } = await supabasePublicRead.rpc(
    "riviera_ranking_participaciones_mensual_public",
    {
      p_organizador_id: orgId,
      p_year: ym.year,
      p_month: ym.month,
      p_categoria: categoria ?? null,
      p_genero: genero ?? null,
    }
  );

  if (error) {
    console.warn("[riviera-jugadores] listRankingParticipacionesMensual:", error);
    return null;
  }

  return (data ?? []) as ParticipacionRankingRow[];
}

export async function listParticipacionesMensualDetalle(
  organizadorId: string,
  jugadorId: string,
  ym: YearMonth
): Promise<ParticipacionDetalleRow[] | null> {
  const orgId = organizadorId.trim();
  const jid = jugadorId.trim();
  if (!orgId || !jid) return [];

  const { data, error } = await supabasePublicRead.rpc(
    "riviera_participaciones_mensual_detalle_public",
    {
      p_organizador_id: orgId,
      p_jugador_id: jid,
      p_year: ym.year,
      p_month: ym.month,
    }
  );

  if (error) {
    console.warn("[riviera-jugadores] listParticipacionesMensualDetalle:", error);
    return null;
  }

  return (data ?? []) as ParticipacionDetalleRow[];
}
