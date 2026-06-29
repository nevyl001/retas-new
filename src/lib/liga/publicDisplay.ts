import type {
  LigaEquipo,
  LigaJornada,
  LigaJornadaPareja,
  LigaPartido,
} from "./types";
import {
  resolveParejasFijasPartidoTotals,
} from "./parejasFijasMatchScore";
import { formatPartidoCanchaHorarioLabel } from "./programacion";

export function formatEquipoNombre(
  equipo: Pick<LigaEquipo, "nombre" | "jugador1" | "jugador2">
): string {
  return (
    equipo.nombre?.trim() ||
    `${equipo.jugador1?.nombre ?? "?"} / ${equipo.jugador2?.nombre ?? "?"}`
  );
}

export function formatJornadaParejaNombre(
  pareja: LigaJornadaPareja,
  equiposById?: Map<string, LigaEquipo>
): string {
  const equipoId = pareja.equipo_id?.trim();
  if (equipoId && equiposById?.has(equipoId)) {
    return formatEquipoNombre(equiposById.get(equipoId)!);
  }
  const j1 = pareja.jugador1?.nombre ?? "?";
  const j2 = pareja.jugador2?.nombre ?? "?";
  return `${j1} / ${j2}`;
}

export type JornadaPublicMatch = {
  id: string;
  local: string;
  visitante: string | null;
  score: string | null;
  programacion: string | null;
};

/** Marcador para tarjeta pública (sets si hay detalle en parejas fijas). */
export function formatPartidoPublicScore(
  partido: Pick<
    LigaPartido,
    "estado" | "score_pareja1" | "score_pareja2" | "set_scores"
  >,
  esParejasFijas: boolean
): string | null {
  if (partido.estado !== "completed") return null;

  if (esParejasFijas) {
    const totals = resolveParejasFijasPartidoTotals(partido);
    if (partido.set_scores?.sets?.length && totals) return totals.display;
    if (totals) {
      return `${partido.score_pareja1 ?? 0} – ${partido.score_pareja2 ?? 0}`;
    }
  }

  return `${partido.score_pareja1 ?? 0} – ${partido.score_pareja2 ?? 0}`;
}

/** Ganador del partido: 1 = pareja local, 2 = visitante. */
export function partidoMatchWinnerSide(
  partido: Pick<
    LigaPartido,
    "estado" | "score_pareja1" | "score_pareja2" | "set_scores"
  >,
  esParejasFijas: boolean
): 1 | 2 | null {
  if (partido.estado !== "completed") return null;

  if (esParejasFijas) {
    const totals = resolveParejasFijasPartidoTotals(partido);
    if (!totals) return null;
    return totals.p1WonMatch ? 1 : 2;
  }

  const s1 = Number(partido.score_pareja1 ?? 0);
  const s2 = Number(partido.score_pareja2 ?? 0);
  if (s1 === s2) return null;
  return s1 > s2 ? 1 : 2;
}

/** Partidos de la jornada (parejas fijas) o parejas rotativas para la tarjeta pública. */
export function listJornadaPublicMatches(
  jornada: LigaJornada,
  equipos: LigaEquipo[],
  esParejasFijas: boolean
): JornadaPublicMatch[] {
  const equiposById = new Map(equipos.map((e) => [e.id, e]));
  const parejaById = new Map((jornada.parejas ?? []).map((p) => [p.id, p]));

  const nameForPareja = (parejaId: string): string => {
    const p = parejaById.get(parejaId);
    if (!p) return "—";
    return formatJornadaParejaNombre(p, equiposById);
  };

  const partidos = jornada.partidos ?? [];

  if (esParejasFijas && partidos.length > 0) {
    return partidos.map((m) => ({
      id: m.id,
      local: nameForPareja(m.pareja1_id),
      visitante: nameForPareja(m.pareja2_id),
      score: formatPartidoPublicScore(m, esParejasFijas),
      programacion: formatPartidoCanchaHorarioLabel(
        m.cancha,
        m.hora_inicio,
        jornada.fecha
      ) || null,
    }));
  }

  if (esParejasFijas) {
    const seen = new Set<string>();
    const rows: JornadaPublicMatch[] = [];
    for (const p of jornada.parejas ?? []) {
      const label = formatJornadaParejaNombre(p, equiposById);
      if (seen.has(label)) continue;
      seen.add(label);
      rows.push({ id: p.id, local: label, visitante: null, score: null, programacion: null });
    }
    return rows;
  }

  return (jornada.parejas ?? []).map((p) => ({
    id: p.id,
    local: formatJornadaParejaNombre(p, equiposById),
    visitante: null,
    score: null,
    programacion: null,
  }));
}
