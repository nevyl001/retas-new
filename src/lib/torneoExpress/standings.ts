import type {
  StandingRowExpress,
  TorneoExpressGrupo,
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "./types";
import {
  calcularEstadisticas,
  getHeadToHead,
  type MatchResult,
  type PairStanding,
} from "../../utils/standings";
import { computeStandingDif } from "../../utils/standingsDisplay";

function standingToExpressRow(
  s: PairStanding,
  grupo: TorneoExpressGrupo,
  label: string
): StandingRowExpress {
  return {
    parejaId: s.pairId,
    parejaLabel: label,
    grupoId: grupo.id,
    grupoNombre: grupo.nombre,
    grupoOrden: grupo.orden,
    pj: s.PJ,
    pg: s.PG,
    pp: s.PP,
    ptsFav: s.juegosFavor,
    ptsCon: s.juegosContra,
    dif: computeStandingDif(s.juegosFavor, s.juegosContra),
    puntos: s.puntos,
  };
}

function partidosToMatches(partidos: TorneoExpressPartido[]): MatchResult[] {
  return partidos
    .filter((p) => p.estado === "jugado")
    .map((p) => ({
      pairAId: p.pareja_local_id,
      pairBId: p.pareja_visitante_id,
      gamesA: p.puntos_local ?? 0,
      gamesB: p.puntos_visitante ?? 0,
      winnerId: p.ganador_id,
    }));
}

/** Torneo Express: PG → DIF → enfrentamiento directo. */
function createExpressStandingsComparator(matches: MatchResult[]) {
  return (a: PairStanding, b: PairStanding): number => {
    if (b.PG !== a.PG) return b.PG - a.PG;
    if (b.diferencia !== a.diferencia) return b.diferencia - a.diferencia;
    const h2h = getHeadToHead(a.pairId, b.pairId, matches);
    if (h2h !== 0) return h2h;
    return a.seed - b.seed;
  };
}

function calculateExpressStandings(
  pairs: Array<{ id: string; name: string; seed?: number }>,
  matches: MatchResult[]
): PairStanding[] {
  const stats = calcularEstadisticas(pairs, matches);
  const cmp = createExpressStandingsComparator(matches);
  return [...stats]
    .sort(cmp)
    .map((pair, index) => ({ ...pair, posicion: index + 1 }));
}

export function buildStandingsForGrupo(
  grupo: TorneoExpressGrupo,
  parejas: TorneoExpressGrupoPareja[],
  partidos: TorneoExpressPartido[]
): StandingRowExpress[] {
  const labels = new Map<string, string>();
  parejas.forEach((p) => {
    labels.set(p.pareja_id, p.pareja_display || p.pareja_id);
  });

  const pairInputs = parejas.map((p, i) => ({
    id: p.pareja_id,
    name: labels.get(p.pareja_id) ?? p.pareja_id,
    seed: i,
  }));

  const matches = partidosToMatches(partidos);
  const standings = calculateExpressStandings(pairInputs, matches);

  return standings.map((s) =>
    standingToExpressRow(s, grupo, labels.get(s.pairId) ?? s.pairName)
  );
}

export function buildStandingsGeneral(
  grupos: TorneoExpressGrupo[],
  parejasPorGrupo: Record<string, TorneoExpressGrupoPareja[]>,
  partidosPorGrupo: Record<string, TorneoExpressPartido[]>
): StandingRowExpress[] {
  const pairInputs: Array<{ id: string; name: string; seed?: number }> = [];
  const labels = new Map<string, string>();
  const metaByPair = new Map<
    string,
    { grupo: TorneoExpressGrupo; label: string }
  >();
  const allMatches: MatchResult[] = [];
  let seed = 0;

  grupos.forEach((grupo) => {
    const parejas = parejasPorGrupo[grupo.id] ?? [];
    const partidos = partidosPorGrupo[grupo.id] ?? [];
    allMatches.push(...partidosToMatches(partidos));
    parejas.forEach((p) => {
      const label = p.pareja_display || p.pareja_id;
      labels.set(p.pareja_id, label);
      metaByPair.set(p.pareja_id, { grupo, label });
      pairInputs.push({ id: p.pareja_id, name: label, seed: seed++ });
    });
  });

  const standings = calculateExpressStandings(pairInputs, allMatches);

  return standings.map((s) => {
    const meta = metaByPair.get(s.pairId);
    const grupo = meta?.grupo ?? grupos[0];
    return standingToExpressRow(
      s,
      grupo,
      meta?.label ?? labels.get(s.pairId) ?? s.pairName
    );
  });
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
  meta: Map<string, { parejaLabel: string }>
): string {
  return meta.get(parejaId)?.parejaLabel ?? parejaId.slice(0, 8);
}
