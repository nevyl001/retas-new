import type { BracketQualifier, BracketSlotEntry } from "./bracketTypes";

export function serializeBracketSlots(slots: BracketSlotEntry[]): unknown {
  return slots.map((s) => {
    if (s.type === "bye") return { type: "bye" };
    const q = s.qualifier;
    return {
      type: "team",
      qualifier: {
        seed: q.seed,
        parejaId: q.parejaId,
        parejaLabel: q.parejaLabel,
        grupoId: q.grupoId,
        grupoNombre: q.grupoNombre,
        grupoOrden: q.grupoOrden,
        posEnGrupo: q.posEnGrupo,
        isMejorTercero: q.isMejorTercero,
        pj: q.pj,
        pg: q.pg,
        pp: q.pp,
        ptsFav: q.ptsFav,
        ptsCon: q.ptsCon,
        dif: q.dif,
        puntos: q.puntos,
      },
    };
  });
}

function parseQualifier(raw: Record<string, unknown>): BracketQualifier {
  return {
    seed: Number(raw.seed) || 0,
    parejaId: String(raw.parejaId ?? ""),
    parejaLabel: String(raw.parejaLabel ?? ""),
    grupoId: String(raw.grupoId ?? ""),
    grupoNombre: String(raw.grupoNombre ?? ""),
    grupoOrden: Number(raw.grupoOrden) || 0,
    posEnGrupo: (Number(raw.posEnGrupo) || 3) as 1 | 2 | 3,
    isMejorTercero: Boolean(raw.isMejorTercero),
    pj: Number(raw.pj) || 0,
    pg: Number(raw.pg) || 0,
    pp: Number(raw.pp) || 0,
    ptsFav: Number(raw.ptsFav) || 0,
    ptsCon: Number(raw.ptsCon) || 0,
    dif: Number(raw.dif) || 0,
    puntos: Number(raw.puntos) || 0,
  };
}

export function deserializeBracketSlots(json: unknown): BracketSlotEntry[] {
  if (!Array.isArray(json)) return [];
  return json.map((item): BracketSlotEntry => {
    if (!item || typeof item !== "object") return { type: "bye" };
    const row = item as Record<string, unknown>;
    if (row.type === "bye") return { type: "bye" };
    if (row.type === "team" && row.qualifier && typeof row.qualifier === "object") {
      return {
        type: "team",
        qualifier: parseQualifier(row.qualifier as Record<string, unknown>),
      };
    }
    return { type: "bye" };
  });
}
