import type { BracketQualifier, BracketSlotEntry } from "./bracketTypes";

/** Default for legacy array-shaped `bracket_slots` (pre-toggle). */
export const DEFAULT_THIRD_PLACE_MATCH_ENABLED = true;

export interface BracketSlotsDocument {
  v: 2;
  slots: BracketSlotEntry[];
  thirdPlaceMatchEnabled: boolean;
}

function serializeSlot(s: BracketSlotEntry): unknown {
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
}

/** Legacy: serialize slots as a plain array (kept for callers that only need slots). */
export function serializeBracketSlots(slots: BracketSlotEntry[]): unknown {
  return slots.map(serializeSlot);
}

/**
 * Persist slots + per-category bronze-match flag as a versioned envelope.
 * Confirmed brackets always write this shape so the decision is explicit.
 */
export function serializeBracketSlotsDocument(
  slots: BracketSlotEntry[],
  thirdPlaceMatchEnabled: boolean
): unknown {
  return {
    v: 2,
    thirdPlaceMatchEnabled: Boolean(thirdPlaceMatchEnabled),
    slots: slots.map(serializeSlot),
  };
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

function parseSlotsArray(json: unknown): BracketSlotEntry[] {
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

/**
 * Reads slots from legacy array or v2 envelope.
 * Unknown shapes yield an empty slot list.
 */
export function deserializeBracketSlots(json: unknown): BracketSlotEntry[] {
  if (Array.isArray(json)) return parseSlotsArray(json);
  if (json && typeof json === "object") {
    const row = json as Record<string, unknown>;
    if ("slots" in row) return parseSlotsArray(row.slots);
  }
  return [];
}

/**
 * Parses `bracket_slots` into slots + third-place flag.
 * Missing flag (legacy array) → `DEFAULT_THIRD_PLACE_MATCH_ENABLED`.
 */
export function parseBracketSlotsDocument(json: unknown): {
  slots: BracketSlotEntry[];
  thirdPlaceMatchEnabled: boolean;
} {
  if (Array.isArray(json)) {
    return {
      slots: parseSlotsArray(json),
      thirdPlaceMatchEnabled: DEFAULT_THIRD_PLACE_MATCH_ENABLED,
    };
  }
  if (json && typeof json === "object") {
    const row = json as Record<string, unknown>;
    const slots = parseSlotsArray(row.slots);
    if ("thirdPlaceMatchEnabled" in row) {
      return {
        slots,
        thirdPlaceMatchEnabled: Boolean(row.thirdPlaceMatchEnabled),
      };
    }
    // Envelope without the field (or partial) — keep backward-compatible default.
    if ("slots" in row) {
      return {
        slots,
        thirdPlaceMatchEnabled: DEFAULT_THIRD_PLACE_MATCH_ENABLED,
      };
    }
  }
  return {
    slots: [],
    thirdPlaceMatchEnabled: DEFAULT_THIRD_PLACE_MATCH_ENABLED,
  };
}

/** Per-category bronze match flag; default true when unset (legacy). */
export function readThirdPlaceMatchEnabled(bracketSlots: unknown): boolean {
  return parseBracketSlotsDocument(bracketSlots).thirdPlaceMatchEnabled;
}
