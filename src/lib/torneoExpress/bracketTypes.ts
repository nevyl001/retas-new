import type { StandingRowExpress } from "./types";

export type BracketFase = "semifinal" | "cuartos" | "octavos";

export const BRACKET_FASE_SLOTS: Record<BracketFase, number> = {
  semifinal: 4,
  cuartos: 8,
  octavos: 16,
};

export interface BracketQualifier {
  seed: number;
  parejaId: string;
  parejaLabel: string;
  grupoId: string;
  grupoNombre: string;
  grupoOrden: number;
  posEnGrupo: 1 | 2 | 3;
  isMejorTercero: boolean;
  pj: number;
  pg: number;
  pp: number;
  ptsFav: number;
  ptsCon: number;
  dif: number;
  puntos: number;
}

export type BracketSlotEntry =
  | { type: "team"; qualifier: BracketQualifier }
  | { type: "bye" };

export interface BracketClashWarning {
  cruceIndex: number;
  slotA: number;
  slotB: number;
  mensaje: string;
}

export interface BracketBuildResult {
  slots: BracketSlotEntry[];
  qualifiers: BracketQualifier[];
  byeCount: number;
  fase: BracketFase;
  advertencias: BracketClashWarning[];
}

export interface ClasificadosSummary {
  fijos: BracketQualifier[];
  tercerosCandidatos: BracketQualifier[];
  mejoresTercerosNecesarios: number;
  totalClasificados: number;
}

export function standingToQualifier(
  row: StandingRowExpress,
  posEnGrupo: 1 | 2 | 3,
  isMejorTercero: boolean
): Omit<BracketQualifier, "seed"> {
  return {
    parejaId: row.parejaId,
    parejaLabel: row.parejaLabel,
    grupoId: row.grupoId,
    grupoNombre: row.grupoNombre,
    grupoOrden: row.grupoOrden,
    posEnGrupo,
    isMejorTercero,
    pj: row.pj,
    pg: row.pg,
    pp: row.pp,
    ptsFav: row.ptsFav,
    ptsCon: row.ptsCon,
    dif: row.dif,
    puntos: row.puntos,
  };
}
