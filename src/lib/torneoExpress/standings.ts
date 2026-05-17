import type {
  StandingRowExpress,
  TorneoExpressGrupo,
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "./types";

interface ParejaMeta {
  parejaId: string;
  parejaLabel: string;
  grupoId: string;
  grupoNombre: string;
  grupoOrden: number;
}

interface MutableStats {
  parejaId: string;
  parejaLabel: string;
  grupoId: string;
  grupoNombre: string;
  grupoOrden: number;
  pj: number;
  pg: number;
  pp: number;
  ptsFav: number;
  ptsCon: number;
  puntos: number;
}

function pairLabel(
  parejaId: string,
  meta: Map<string, ParejaMeta>
): string {
  return meta.get(parejaId)?.parejaLabel ?? parejaId.slice(0, 8);
}

function initStats(meta: ParejaMeta): MutableStats {
  return {
    parejaId: meta.parejaId,
    parejaLabel: meta.parejaLabel,
    grupoId: meta.grupoId,
    grupoNombre: meta.grupoNombre,
    grupoOrden: meta.grupoOrden,
    pj: 0,
    pg: 0,
    pp: 0,
    ptsFav: 0,
    ptsCon: 0,
    puntos: 0,
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

  local.pj += 1;
  visit.pj += 1;
  local.ptsFav += pl;
  local.ptsCon += pv;
  visit.ptsFav += pv;
  visit.ptsCon += pl;

  if (pl > pv) {
    local.pg += 1;
    visit.pp += 1;
    local.puntos += 2;
    visit.puntos += 1;
  } else if (pv > pl) {
    visit.pg += 1;
    local.pp += 1;
    visit.puntos += 2;
    local.puntos += 1;
  } else {
    local.puntos += 1;
    visit.puntos += 1;
  }
}

function headToHeadPoints(
  tiedIds: string[],
  partidos: TorneoExpressPartido[]
): Map<string, number> {
  const set = new Set(tiedIds);
  const h2h = new Map<string, number>();
  tiedIds.forEach((id) => h2h.set(id, 0));

  partidos.forEach((p) => {
    if (p.estado !== "jugado") return;
    if (!set.has(p.pareja_local_id) || !set.has(p.pareja_visitante_id)) return;
    const pl = p.puntos_local ?? 0;
    const pv = p.puntos_visitante ?? 0;
    if (pl > pv) {
      h2h.set(p.pareja_local_id, (h2h.get(p.pareja_local_id) ?? 0) + 2);
      h2h.set(p.pareja_visitante_id, (h2h.get(p.pareja_visitante_id) ?? 0) + 1);
    } else if (pv > pl) {
      h2h.set(p.pareja_visitante_id, (h2h.get(p.pareja_visitante_id) ?? 0) + 2);
      h2h.set(p.pareja_local_id, (h2h.get(p.pareja_local_id) ?? 0) + 1);
    } else {
      h2h.set(p.pareja_local_id, (h2h.get(p.pareja_local_id) ?? 0) + 1);
      h2h.set(p.pareja_visitante_id, (h2h.get(p.pareja_visitante_id) ?? 0) + 1);
    }
  });
  return h2h;
}

/**
 * Clasificación (de mejor a peor):
 * 1) Diferencia de anotación (Pts a favor − Pts en contra): más anotó y menos recibió = arriba
 * 2) Partidos ganados (PG)
 * 3) Partidos perdidos (PP): menos perdidos = mejor
 * 4) Puntos a favor, puntos en contra, puntos de torneo, H2H, alfabético
 */
function compareStats(
  a: MutableStats,
  b: MutableStats,
  partidos: TorneoExpressPartido[],
  allRows: MutableStats[]
): number {
  const difA = a.ptsFav - a.ptsCon;
  const difB = b.ptsFav - b.ptsCon;
  if (difB !== difA) return difB - difA;

  if (b.pg !== a.pg) return b.pg - a.pg;

  if (a.pp !== b.pp) return a.pp - b.pp;

  if (b.ptsFav !== a.ptsFav) return b.ptsFav - a.ptsFav;

  if (a.ptsCon !== b.ptsCon) return a.ptsCon - b.ptsCon;

  if (b.puntos !== a.puntos) return b.puntos - a.puntos;

  const tiedOnDif = allRows.filter((s) => s.ptsFav - s.ptsCon === difA);
  const tiedIds = tiedOnDif.map((s) => s.parejaId);
  if (
    tiedIds.length >= 2 &&
    tiedIds.includes(a.parejaId) &&
    tiedIds.includes(b.parejaId)
  ) {
    const h2h = headToHeadPoints(tiedIds, partidos);
    const diffH2h = (h2h.get(b.parejaId) ?? 0) - (h2h.get(a.parejaId) ?? 0);
    if (diffH2h !== 0) return diffH2h;
  }

  return a.parejaLabel.localeCompare(b.parejaLabel, "es");
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
    dif: s.ptsFav - s.ptsCon,
    puntos: s.puntos,
  };
}

function sortStandings(
  rows: MutableStats[],
  partidos: TorneoExpressPartido[]
): StandingRowExpress[] {
  const snapshot = [...rows];
  snapshot.sort((a, b) => compareStats(a, b, partidos, snapshot));
  return snapshot.map(toRow);
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

export { pairLabel };
