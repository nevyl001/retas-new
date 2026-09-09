import type {
  LigaEquipo,
  LigaJornada,
  LigaJornadaPareja,
  LigaPartido,
} from "./types";
import {
  resolveParejasFijasPartidoTotals,
} from "./parejasFijasMatchScore";
import {
  computePlayoffsMatchPoints,
  parsePlayoffsSetScoresJson,
  playoffsMatchDisplay,
} from "./parejasFijasPlayoffsMatchScore";
import { packPlayoffsJornadaMatches } from "./parejasFijasPlayoffsSchedule";
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
  /** 1 = local, 2 = visitante; solo partidos completados. */
  winnerSide: 1 | 2 | null;
  /** Ronda horaria dentro de la jornada (1, 2, …). */
  ronda: number;
  cancha: number | null;
};

/** Marcador para tarjeta pública (sets legacy o games playoffs). */
export function formatPartidoPublicScore(
  partido: Pick<
    LigaPartido,
    "estado" | "score_pareja1" | "score_pareja2" | "set_scores"
  >,
  esParejasFijas: boolean
): string | null {
  if (partido.estado !== "completed") return null;

  const playoffs = parsePlayoffsSetScoresJson(partido.set_scores);
  if (
    playoffs &&
    partido.score_pareja1 != null &&
    partido.score_pareja2 != null
  ) {
    return playoffsMatchDisplay(
      partido.score_pareja1,
      partido.score_pareja2,
      playoffs
    );
  }

  if (esParejasFijas) {
    const legacySets = parseLegacySetsOnly(partido.set_scores);
    const totals = resolveParejasFijasPartidoTotals({
      score_pareja1: partido.score_pareja1,
      score_pareja2: partido.score_pareja2,
      set_scores: legacySets,
    });
    if (legacySets?.sets?.length && totals) return totals.display;
    if (totals) {
      return `${partido.score_pareja1 ?? 0} – ${partido.score_pareja2 ?? 0}`;
    }
  }

  return `${partido.score_pareja1 ?? 0} – ${partido.score_pareja2 ?? 0}`;
}

export type PartidoPublicScoreColumn = {
  label: string;
  p1: number;
  p2: number;
};

/** Estructura visual elegante para el marcador del duelo público. */
export type PartidoPublicScoreboard =
  | { kind: "pending" }
  | { kind: "wo"; winner: 1 | 2 }
  | { kind: "board"; columns: PartidoPublicScoreColumn[] }
  | { kind: "simple"; s1: number; s2: number };

export function getPartidoPublicScoreboard(
  partido: Pick<
    LigaPartido,
    "estado" | "score_pareja1" | "score_pareja2" | "set_scores"
  >,
  esParejasFijas: boolean
): PartidoPublicScoreboard {
  if (partido.estado !== "completed") return { kind: "pending" };

  const playoffs = parsePlayoffsSetScoresJson(partido.set_scores);
  if (playoffs) {
    if (playoffs.wo) {
      const s1 = Number(partido.score_pareja1 ?? 0);
      const s2 = Number(partido.score_pareja2 ?? 0);
      return { kind: "wo", winner: s1 > s2 ? 1 : 2 };
    }
    const columns: PartidoPublicScoreColumn[] = [];
    if (playoffs.sets?.length === 2) {
      columns.push(
        { label: "S1", p1: playoffs.sets[0].p1, p2: playoffs.sets[0].p2 },
        { label: "S2", p1: playoffs.sets[1].p1, p2: playoffs.sets[1].p2 }
      );
    }
    if (playoffs.stb) {
      columns.push({
        label: "STB",
        p1: playoffs.stb.p1,
        p2: playoffs.stb.p2,
      });
    }
    if (columns.length > 0) return { kind: "board", columns };
    if (partido.score_pareja1 != null && partido.score_pareja2 != null) {
      return {
        kind: "simple",
        s1: Number(partido.score_pareja1),
        s2: Number(partido.score_pareja2),
      };
    }
  }

  if (esParejasFijas) {
    const legacySets = parseLegacySetsOnly(partido.set_scores);
    if (legacySets?.sets?.length) {
      const columns: PartidoPublicScoreColumn[] = legacySets.sets.map(
        (set, idx) => ({
          label:
            set.kind === "super_tiebreak" || idx === 2
              ? "STB"
              : `S${idx + 1}`,
          p1: Number(set.p1),
          p2: Number(set.p2),
        })
      );
      return { kind: "board", columns };
    }
  }

  if (partido.score_pareja1 != null && partido.score_pareja2 != null) {
    return {
      kind: "simple",
      s1: Number(partido.score_pareja1),
      s2: Number(partido.score_pareja2),
    };
  }

  return { kind: "pending" };
}

function parseLegacySetsOnly(raw: LigaPartido["set_scores"]) {
  if (!raw || typeof raw !== "object") return null;
  if (!("sets" in raw)) return null;
  return raw as import("./parejasFijasMatchScore").LigaPartidoSetScores;
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

  const playoffs = parsePlayoffsSetScoresJson(partido.set_scores);
  if (
    playoffs &&
    partido.score_pareja1 != null &&
    partido.score_pareja2 != null
  ) {
    const pts = computePlayoffsMatchPoints(
      partido.score_pareja1,
      partido.score_pareja2,
      playoffs
    );
    if (!pts.ok) return null;
    return pts.result.p1Won ? 1 : 2;
  }

  if (esParejasFijas) {
    const totals = resolveParejasFijasPartidoTotals({
      score_pareja1: partido.score_pareja1,
      score_pareja2: partido.score_pareja2,
      set_scores: parseLegacySetsOnly(partido.set_scores),
    });
    if (!totals) return null;
    return totals.p1WonMatch ? 1 : 2;
  }

  const s1 = Number(partido.score_pareja1 ?? 0);
  const s2 = Number(partido.score_pareja2 ?? 0);
  if (s1 === s2) return null;
  return s1 > s2 ? 1 : 2;
}

/**
 * Agrupa partidos del programa público por ronda de pantalla.
 * Producto: 2 rondas por jornada. Si en BD todos quedaron en una sola ronda,
 * re-empaqueta en dos olas (p.ej. 4→2+2, 8→4+4) para la TV.
 */
export function groupJornadaPublicMatchesByRonda(
  matches: JornadaPublicMatch[],
  jornada: LigaJornada,
  canchasDisponibles: number
): Array<{ ronda: number; matches: JornadaPublicMatch[] }> {
  if (matches.length === 0) return [];

  const byDbRonda = new Map<number, JornadaPublicMatch[]>();
  for (const m of matches) {
    const r = m.ronda || 1;
    const list = byDbRonda.get(r) ?? [];
    list.push(m);
    byDbRonda.set(r, list);
  }

  if (byDbRonda.size > 1) {
    return Array.from(byDbRonda.entries())
      .sort(([a], [b]) => a - b)
      .map(([ronda, roundMatches]) => ({ ronda, matches: roundMatches }));
  }

  if (matches.length < 4) {
    return [{ ronda: 1, matches }];
  }

  const parejaById = new Map((jornada.parejas ?? []).map((p) => [p.id, p]));
  const partidoById = new Map((jornada.partidos ?? []).map((p) => [p.id, p]));
  const schedulable: Array<{
    id: string;
    equipo1_id: string;
    equipo2_id: string;
  }> = [];

  for (const m of matches) {
    const partido = partidoById.get(m.id);
    if (!partido) continue;
    const e1 =
      parejaById.get(partido.pareja1_id)?.equipo_id?.trim() ||
      partido.pareja1_id;
    const e2 =
      parejaById.get(partido.pareja2_id)?.equipo_id?.trim() ||
      partido.pareja2_id;
    schedulable.push({ id: m.id, equipo1_id: e1, equipo2_id: e2 });
  }

  if (schedulable.length < 4) {
    return [{ ronda: 1, matches }];
  }

  const courtsCap = Math.max(1, Math.floor(canchasDisponibles) || 1);
  // Una sola ronda en BD → partir en 2 olas (mitad de partidos por ola).
  const courts = Math.min(courtsCap, Math.floor(schedulable.length / 2));
  const packed = packPlayoffsJornadaMatches(schedulable, Math.max(1, courts));
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const byPacked = new Map<number, JornadaPublicMatch[]>();

  for (const row of packed) {
    const base = matchById.get(row.id);
    if (!base) continue;
    const display: JornadaPublicMatch = {
      ...base,
      ronda: row.ronda,
      cancha: row.cancha,
    };
    const list = byPacked.get(row.ronda) ?? [];
    list.push(display);
    byPacked.set(row.ronda, list);
  }

  if (byPacked.size <= 1) {
    return [{ ronda: 1, matches }];
  }

  return Array.from(byPacked.entries())
    .sort(([a], [b]) => a - b)
    .map(([ronda, roundMatches]) => ({ ronda, matches: roundMatches }));
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
    return [...partidos]
      .sort((a, b) => {
        const byRonda = (a.ronda ?? 1) - (b.ronda ?? 1);
        if (byRonda !== 0) return byRonda;
        return (a.cancha ?? 0) - (b.cancha ?? 0);
      })
      .map((m) => ({
        id: m.id,
        local: nameForPareja(m.pareja1_id),
        visitante: nameForPareja(m.pareja2_id),
        score: formatPartidoPublicScore(m, esParejasFijas),
        programacion: formatPartidoCanchaHorarioLabel(
          m.cancha,
          m.hora_inicio,
          jornada.fecha
        ) || null,
        winnerSide: partidoMatchWinnerSide(m, esParejasFijas),
        ronda: Number(m.ronda ?? 1) || 1,
        cancha: m.cancha != null ? Number(m.cancha) : null,
      }));
  }

  if (esParejasFijas) {
    const seen = new Set<string>();
    const rows: JornadaPublicMatch[] = [];
    for (const p of jornada.parejas ?? []) {
      const label = formatJornadaParejaNombre(p, equiposById);
      if (seen.has(label)) continue;
      seen.add(label);
      rows.push({
        id: p.id,
        local: label,
        visitante: null,
        score: null,
        programacion: null,
        winnerSide: null,
        ronda: 1,
        cancha: null,
      });
    }
    return rows;
  }

  return (jornada.parejas ?? []).map((p) => ({
    id: p.id,
    local: formatJornadaParejaNombre(p, equiposById),
    visitante: null,
    score: null,
    programacion: null,
    winnerSide: null,
    ronda: 1,
    cancha: null,
  }));
}

export type LigaProgramaPartido = {
  jornadaNumero: number;
  jornadaId: string;
  jornadaFecha: string | null;
  jornadaEstado: LigaJornada["estado"];
  partidoId: string;
  local: string;
  visitante: string;
  programacion: string | null;
  score: string | null;
};

/** Calendario completo de la liga (parejas fijas): todas las jornadas y enfrentamientos. */
export function listLigaProgramaCompleto(
  jornadas: LigaJornada[],
  equipos: LigaEquipo[]
): LigaProgramaPartido[] {
  const rows: LigaProgramaPartido[] = [];
  const ordenadas = [...jornadas].sort((a, b) => a.numero - b.numero);

  for (const jornada of ordenadas) {
    const partidos = listJornadaPublicMatches(jornada, equipos, true);
    for (const m of partidos) {
      if (!m.visitante) continue;
      rows.push({
        jornadaNumero: jornada.numero,
        jornadaId: jornada.id,
        jornadaFecha: jornada.fecha,
        jornadaEstado: jornada.estado,
        partidoId: m.id,
        local: m.local,
        visitante: m.visitante,
        programacion: m.programacion,
        score: m.score,
      });
    }
  }

  return rows;
}
