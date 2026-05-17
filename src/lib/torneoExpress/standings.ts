import type {
  StandingRowExpress,
  TorneoExpressGrupo,
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "./types";
import {
  applyMatchToStandingStats,
  createEmptyStandingStats,
  sortStandingsEntities,
  standingDiff,
  type HeadToHeadMatch,
  type UnifiedStandingStats,
} from "../unifiedStandings";

interface ParejaMeta {
  parejaId: string;
  parejaLabel: string;
  grupoId: string;
  grupoNombre: string;
  grupoOrden: number;
}

interface MutableStats extends UnifiedStandingStats {
  parejaId: string;
  parejaLabel: string;
  grupoId: string;
  grupoNombre: string;
  grupoOrden: number;
}

function initStats(meta: ParejaMeta): MutableStats {
  return {
    ...createEmptyStandingStats(),
    parejaId: meta.parejaId,
    parejaLabel: meta.parejaLabel,
    grupoId: meta.grupoId,
    grupoNombre: meta.grupoNombre,
    grupoOrden: meta.grupoOrden,
  };
}

function applyPlayedMatch(
  stats: Map<string, MutableStats>,
  partido: TorneoExpressPartido
) {
  if (partido.estado !== "jugado") return;
  const pl = partido.puntos_local ?? 0;
  const pv = partido.puntos_visitante ?? 0;
  const local = stats.get(partido.pareja_local_id);
  const visit = stats.get(partido.pareja_visitante_id);
  if (!local || !visit) return;
  applyMatchToStandingStats(local, visit, pl, pv);
}

function partidosToH2H(partidos: TorneoExpressPartido[]): HeadToHeadMatch[] {
  return partidos
    .filter((p) => p.estado === "jugado")
    .map((p) => ({
      idA: p.pareja_local_id,
      idB: p.pareja_visitante_id,
      scoreA: p.puntos_local ?? 0,
      scoreB: p.puntos_visitante ?? 0,
    }));
}

function toRow(s: MutableStats): StandingRowExpress {
  return {
    parejaId: s.parejaId,
    parejaLabel: s.parejaLabel,
    grupoId: s.grupoId,
    grupoNombre: s.grupoNombre,
    grupoOrden: s.grupoOrden,
    pj: s.pj,
    pg: s.pg,
    pp: s.pp,
    ptsFav: s.ptsFav,
    ptsCon: s.ptsCon,
    dif: standingDiff(s),
    puntos: s.puntos,
  };
}

function sortStandings(
  rows: MutableStats[],
  partidos: TorneoExpressPartido[]
): StandingRowExpress[] {
  const entities = rows.map((r) => ({
    id: r.parejaId,
    label: r.parejaLabel,
    stats: r as UnifiedStandingStats,
  }));
  const sorted = sortStandingsEntities(entities, partidosToH2H(partidos));
  const byId = new Map(rows.map((r) => [r.parejaId, r]));
  return sorted.map((e) => toRow(byId.get(e.id)!));
}

export function buildStandingsForGrupo(
  grupo: TorneoExpressGrupo,
  parejas: TorneoExpressGrupoPareja[],
  partidos: TorneoExpressPartido[]
): StandingRowExpress[] {
  const meta = new Map<string, ParejaMeta>();
  parejas.forEach((p) => {
    meta.set(p.pareja_id, {
      parejaId: p.pareja_id,
      parejaLabel: p.pareja_display || p.pareja_id,
      grupoId: grupo.id,
      grupoNombre: grupo.nombre,
      grupoOrden: grupo.orden,
    });
  });

  const stats = new Map<string, MutableStats>();
  parejas.forEach((p) => {
    const m = meta.get(p.pareja_id)!;
    stats.set(p.pareja_id, initStats(m));
  });

  partidos.forEach((partido) => applyPlayedMatch(stats, partido));
  return sortStandings(Array.from(stats.values()), partidos);
}

export function buildStandingsGeneral(
  grupos: TorneoExpressGrupo[],
  parejasPorGrupo: Record<string, TorneoExpressGrupoPareja[]>,
  partidosPorGrupo: Record<string, TorneoExpressPartido[]>
): StandingRowExpress[] {
  const allStats: MutableStats[] = [];
  const allPartidos: TorneoExpressPartido[] = [];

  grupos.forEach((grupo) => {
    const parejas = parejasPorGrupo[grupo.id] ?? [];
    const partidos = partidosPorGrupo[grupo.id] ?? [];
    allPartidos.push(...partidos);
    const rows = buildStandingsForGrupo(grupo, parejas, partidos);
    rows.forEach((r) => {
      allStats.push({
        parejaId: r.parejaId,
        parejaLabel: r.parejaLabel,
        grupoId: r.grupoId,
        grupoNombre: r.grupoNombre,
        grupoOrden: r.grupoOrden,
        pj: r.pj,
        pg: r.pg,
        pp: r.pp,
        ptsFav: r.ptsFav,
        ptsCon: r.ptsCon,
        puntos: r.puntos,
      });
    });
  });

  return sortStandings(allStats, allPartidos);
}

export function formatPairDisplay(
  player1Name?: string,
  player2Name?: string
): string {
  const a = (player1Name ?? "").trim();
  const b = (player2Name ?? "").trim();
  if (a && b) return `${a} / ${b}`;
  return a || b || "Pareja";
}

export function pairLabel(
  parejaId: string,
  meta: Map<string, ParejaMeta>
): string {
  return meta.get(parejaId)?.parejaLabel ?? parejaId.slice(0, 8);
}
