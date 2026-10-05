import type {
  StandingRowExpress,
  StandingTie,
  TorneoExpressClasificacionModo,
  TorneoExpressGrupo,
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "./types";
import { DEFAULT_CLASIFICACION_MODO } from "./types";
import {
  calcularEstadisticas,
  type MatchResult,
  type PairStanding,
} from "../../utils/standings";
import { computeStandingDif } from "../../utils/standingsDisplay";
import { partidoToMatchResult } from "./partidoSets";
import { rankGroupStandings, type GroupStandingStats } from "./groupRanking";
import { remapPartidoToSlot, slotsFromParejas } from "./groupRoster";

type ExpressPairStanding = PairStanding & {
  setsFavor: number;
  setsContra: number;
};

function standingToExpressRow(
  s: PairStanding & { setsFavor?: number; setsContra?: number },
  grupo: TorneoExpressGrupo,
  label: string,
  posicion: number,
  tie: StandingTie
): StandingRowExpress {
  return {
    parejaId: s.pairId,
    parejaLabel: label,
    grupoId: grupo.id,
    grupoNombre: grupo.nombre,
    grupoOrden: grupo.orden,
    posicion,
    tie,
    pj: s.PJ,
    pg: s.PG,
    pp: s.PP,
    ptsFav: s.juegosFavor,
    ptsCon: s.juegosContra,
    dif: computeStandingDif(s.juegosFavor, s.juegosContra),
    puntos: s.puntos,
    setsFav: s.setsFavor ?? 0,
    setsCon: s.setsContra ?? 0,
  };
}

/** Standings: games desde sets_resultado (o puntos_* legacy). */
function partidosToMatches(partidos: TorneoExpressPartido[]): MatchResult[] {
  const matches: MatchResult[] = [];
  for (const p of partidos) {
    const m = partidoToMatchResult(p);
    if (m) matches.push(m);
  }
  return matches;
}

function enrichWithSetStats(
  stats: PairStanding[],
  matches: MatchResult[]
): ExpressPairStanding[] {
  const setsByPair = new Map<string, { favor: number; contra: number }>();
  for (const s of stats) {
    setsByPair.set(s.pairId, { favor: 0, contra: 0 });
  }
  for (const m of matches) {
    const a = setsByPair.get(m.pairAId);
    const b = setsByPair.get(m.pairBId);
    const setsA = m.setsA ?? 0;
    const setsB = m.setsB ?? 0;
    if (a) {
      a.favor += setsA;
      a.contra += setsB;
    }
    if (b) {
      b.favor += setsB;
      b.contra += setsA;
    }
  }
  return stats.map((s) => {
    const sets = setsByPair.get(s.pairId) ?? { favor: 0, contra: 0 };
    return {
      ...s,
      setsFavor: sets.favor,
      setsContra: sets.contra,
    };
  });
}

function toGroupStats(row: ExpressPairStanding): GroupStandingStats {
  return {
    pairId: row.pairId,
    pairName: row.pairName,
    pj: row.PJ,
    pg: row.PG,
    pp: row.PP,
    pe: row.PE,
    juegosFavor: row.juegosFavor,
    juegosContra: row.juegosContra,
    diferencia: row.diferencia,
    puntos: row.puntos,
    setsFavor: row.setsFavor,
    setsContra: row.setsContra,
  };
}

function calculateExpressStandings(
  pairs: Array<{ id: string; name: string; seed?: number }>,
  matches: MatchResult[],
  modo: TorneoExpressClasificacionModo = DEFAULT_CLASIFICACION_MODO
): Array<ExpressPairStanding & { posicion: number; tie: StandingTie }> {
  const stats = enrichWithSetStats(calcularEstadisticas(pairs, matches), matches);
  const ranked = rankGroupStandings(stats.map(toGroupStats), matches, modo);
  const byId = new Map(stats.map((row) => [row.pairId, row]));
  return ranked.flatMap((row) => {
    const full = byId.get(row.pairId);
    if (!full) return [];
    return [{ ...full, posicion: row.posicion, tie: row.tie }];
  });
}

export function buildStandingsForGrupo(
  grupo: TorneoExpressGrupo,
  parejas: TorneoExpressGrupoPareja[],
  partidos: TorneoExpressPartido[],
  modo: TorneoExpressClasificacionModo = DEFAULT_CLASIFICACION_MODO
): StandingRowExpress[] {
  const labels = new Map<string, string>();
  parejas.forEach((p) => {
    labels.set(p.pareja_id, p.pareja_display || p.pareja_id);
  });

  const pairInputs = parejas.map((p) => ({
    id: p.pareja_id,
    name: labels.get(p.pareja_id) ?? p.pareja_id,
  }));

  const slots = slotsFromParejas(parejas);
  const matches = partidosToMatches(
    partidos.map((partido) => remapPartidoToSlot(partido, slots))
  );
  const standings = calculateExpressStandings(pairInputs, matches, modo);

  return standings.map((s) =>
    standingToExpressRow(
      s,
      grupo,
      labels.get(s.pairId) ?? s.pairName,
      s.posicion,
      s.tie
    )
  );
}

export function buildStandingsGeneral(
  grupos: TorneoExpressGrupo[],
  parejasPorGrupo: Record<string, TorneoExpressGrupoPareja[]>,
  partidosPorGrupo: Record<string, TorneoExpressPartido[]>,
  modo: TorneoExpressClasificacionModo = DEFAULT_CLASIFICACION_MODO
): StandingRowExpress[] {
  const pairInputs: Array<{ id: string; name: string }> = [];
  const labels = new Map<string, string>();
  const metaByPair = new Map<
    string,
    { grupo: TorneoExpressGrupo; label: string }
  >();
  const allMatches: MatchResult[] = [];

  grupos.forEach((grupo) => {
    const parejas = parejasPorGrupo[grupo.id] ?? [];
    const partidos = partidosPorGrupo[grupo.id] ?? [];
    allMatches.push(...partidosToMatches(partidos));
    parejas.forEach((p) => {
      const label = p.pareja_display || p.pareja_id;
      labels.set(p.pareja_id, label);
      metaByPair.set(p.pareja_id, { grupo, label });
      pairInputs.push({ id: p.pareja_id, name: label });
    });
  });

  const standings = calculateExpressStandings(pairInputs, allMatches, modo);

  return standings.map((s) => {
    const meta = metaByPair.get(s.pairId);
    const grupo = meta?.grupo ?? grupos[0];
    return standingToExpressRow(
      s,
      grupo,
      meta?.label ?? labels.get(s.pairId) ?? s.pairName,
      s.posicion,
      s.tie
    );
  });
}

/** Un puesto solo existe si una pareja lo ocupa sola y el desempate está resuelto. */
export function puestoResuelto(
  tabla: StandingRowExpress[],
  posicion: number
): StandingRowExpress | null {
  const rows = tabla.filter(
    (row) => row.posicion === posicion && row.tie.status === "resolved"
  );
  return rows.length === 1 ? rows[0] : null;
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
