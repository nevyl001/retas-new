/**
 * Marcador / puntos EXCLUSIVOS de modalidad `parejas_fijas_playoffs`.
 * NO usar desde parejas_fijas legacy (sets 3/2/0).
 *
 * UI: Set 1 + Set 2 (a 6). Totales de games → puntos.
 * Empate en games → Súper Tie-Break a 5.
 */

export const PLAYOFFS_SCORE_FORMAT = "parejas_fijas_playoffs" as const;
export const PLAYOFFS_STB_TARGET = 5;
export const PLAYOFFS_WO_SCORE_WIN = 6;
export const PLAYOFFS_WO_SCORE_LOSS = 0;

export type PlayoffsStbScore = { p1: number; p2: number };
export type PlayoffsSetPair = { p1: number; p2: number };

export type PlayoffsSetScoresPayload = {
  format: typeof PLAYOFFS_SCORE_FORMAT;
  wo: boolean;
  stb: PlayoffsStbScore | null;
  /** Desglose opcional Set 1 / Set 2 (games totales = suma). */
  sets?: [PlayoffsSetPair, PlayoffsSetPair];
};

export type PlayoffsMatchPoints = {
  pointsP1: number;
  pointsP2: number;
  p1Won: boolean;
  viaWo: boolean;
  viaStb: boolean;
};

export type PlayoffsSetDraft = { p1: string; p2: string };

export type PlayoffsScoreDraft = {
  set1: PlayoffsSetDraft;
  set2: PlayoffsSetDraft;
  stb1: string;
  stb2: string;
  woWinner: null | 1 | 2;
};

const EMPTY_SET: PlayoffsSetDraft = { p1: "", p2: "" };

export function emptyPlayoffsScoreDraft(): PlayoffsScoreDraft {
  return {
    set1: { ...EMPTY_SET },
    set2: { ...EMPTY_SET },
    stb1: "",
    stb2: "",
    woWinner: null,
  };
}

function parseSetPair(raw: unknown): PlayoffsSetPair | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const p1 = Number(o.p1);
  const p2 = Number(o.p2);
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) return null;
  return { p1, p2 };
}

export function parsePlayoffsSetScoresJson(
  raw: unknown
): PlayoffsSetScoresPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.format !== PLAYOFFS_SCORE_FORMAT) return null;
  const wo = o.wo === true;
  let stb: PlayoffsStbScore | null = null;
  if (o.stb && typeof o.stb === "object") {
    const s = o.stb as Record<string, unknown>;
    const p1 = Number(s.p1);
    const p2 = Number(s.p2);
    if (!Number.isFinite(p1) || !Number.isFinite(p2)) return null;
    stb = { p1, p2 };
  }

  let sets: [PlayoffsSetPair, PlayoffsSetPair] | undefined;
  if (Array.isArray(o.sets) && o.sets.length === 2) {
    const a = parseSetPair(o.sets[0]);
    const b = parseSetPair(o.sets[1]);
    // Ignorar payload legacy tipo { kind: "regular" } sin format playoffs
    // (ya filtrado arriba). Aquí format es playoffs → aceptar desglose.
    if (a && b) sets = [a, b];
  }

  return { format: PLAYOFFS_SCORE_FORMAT, wo, stb, sets };
}

export function validatePlayoffsMainScores(
  a: number,
  b: number
): string | null {
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    return "Los games deben ser números enteros.";
  }
  if (a < 0 || b < 0) return "Los games no pueden ser negativos.";
  return null;
}

export function validatePlayoffsSetPair(
  a: number,
  b: number,
  label: string
): string | null {
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    return `${label}: usa números enteros.`;
  }
  if (a < 0 || b < 0) return `${label}: no puede ser negativo.`;
  if (a === b) return `${label}: debe tener ganador (sin empate).`;
  return null;
}

/** Súper Tie-Break a 5 (ganador ≥5 y diferencia ≥1; sin empate). */
export function validatePlayoffsStb(a: number, b: number): string | null {
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    return "Los puntos del súper tie-break deben ser enteros.";
  }
  if (a < 0 || b < 0) return "Los puntos no pueden ser negativos.";
  if (a === b) return "El súper tie-break siempre tiene ganador (sin empate).";
  const w = Math.max(a, b);
  if (w < PLAYOFFS_STB_TARGET) {
    return `El súper tie-break se gana llegando a ${PLAYOFFS_STB_TARGET} puntos.`;
  }
  return null;
}

/**
 * Calcula puntos ranking playoffs.
 * WO → 3 / -1; diff≥2 → 3/0; diff===1 → 2/1; empate+STB → 2/1.
 */
export function computePlayoffsMatchPoints(
  score1: number,
  score2: number,
  payload: PlayoffsSetScoresPayload
): { ok: true; result: PlayoffsMatchPoints } | { ok: false; error: string } {
  if (payload.format !== PLAYOFFS_SCORE_FORMAT) {
    return { ok: false, error: "Formato de marcador inválido." };
  }

  if (payload.wo) {
    if (
      !(
        (score1 === PLAYOFFS_WO_SCORE_WIN &&
          score2 === PLAYOFFS_WO_SCORE_LOSS) ||
        (score2 === PLAYOFFS_WO_SCORE_WIN && score1 === PLAYOFFS_WO_SCORE_LOSS)
      )
    ) {
      return {
        ok: false,
        error: "WO administrativo debe registrarse como 6-0.",
      };
    }
    if (payload.stb) {
      return { ok: false, error: "WO no admite súper tie-break." };
    }
    const p1Won = score1 > score2;
    return {
      ok: true,
      result: {
        pointsP1: p1Won ? 3 : -1,
        pointsP2: p1Won ? -1 : 3,
        p1Won,
        viaWo: true,
        viaStb: false,
      },
    };
  }

  const mainErr = validatePlayoffsMainScores(score1, score2);
  if (mainErr) return { ok: false, error: mainErr };

  if (score1 === score2) {
    if (!payload.stb) {
      return {
        ok: false,
        error: "Empate: registra el súper tie-break a 5.",
      };
    }
    const stbErr = validatePlayoffsStb(payload.stb.p1, payload.stb.p2);
    if (stbErr) return { ok: false, error: stbErr };
    const p1Won = payload.stb.p1 > payload.stb.p2;
    return {
      ok: true,
      result: {
        pointsP1: p1Won ? 2 : 1,
        pointsP2: p1Won ? 1 : 2,
        p1Won,
        viaWo: false,
        viaStb: true,
      },
    };
  }

  if (payload.stb) {
    return {
      ok: false,
      error: "Súper tie-break solo aplica con empate en el marcador.",
    };
  }

  const diff = Math.abs(score1 - score2);
  const p1Won = score1 > score2;
  if (diff >= 2) {
    return {
      ok: true,
      result: {
        pointsP1: p1Won ? 3 : 0,
        pointsP2: p1Won ? 0 : 3,
        p1Won,
        viaWo: false,
        viaStb: false,
      },
    };
  }

  // diff === 1
  return {
    ok: true,
    result: {
      pointsP1: p1Won ? 2 : 1,
      pointsP2: p1Won ? 1 : 2,
      p1Won,
      viaWo: false,
      viaStb: false,
    },
  };
}

function parseDraftSetField(
  draft: PlayoffsSetDraft,
  label: string
): PlayoffsSetPair {
  const p1 = Number(draft.p1);
  const p2 = Number(draft.p2);
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) {
    throw new Error(`Completa ${label}.`);
  }
  const err = validatePlayoffsSetPair(p1, p2, label);
  if (err) throw new Error(err);
  return { p1, p2 };
}

/** Totales de games a partir de Set 1 + Set 2 (null si incompleto). */
export function playoffsTotalsFromDraft(
  draft: PlayoffsScoreDraft
): { score1: number; score2: number } | null {
  if (
    draft.set1.p1 === "" ||
    draft.set1.p2 === "" ||
    draft.set2.p1 === "" ||
    draft.set2.p2 === ""
  ) {
    return null;
  }
  const s1p1 = Number(draft.set1.p1);
  const s1p2 = Number(draft.set1.p2);
  const s2p1 = Number(draft.set2.p1);
  const s2p2 = Number(draft.set2.p2);
  if (
    ![s1p1, s1p2, s2p1, s2p2].every((n) => Number.isFinite(n))
  ) {
    return null;
  }
  return { score1: s1p1 + s2p1, score2: s1p2 + s2p2 };
}

export function needsPlayoffsStbDraft(draft: PlayoffsScoreDraft): boolean {
  if (draft.woWinner != null) return false;
  const totals = playoffsTotalsFromDraft(draft);
  return Boolean(totals && totals.score1 === totals.score2);
}

export function buildPlayoffsPayloadFromDraft(
  draft: PlayoffsScoreDraft
): {
  score1: number;
  score2: number;
  payload: PlayoffsSetScoresPayload;
} {
  if (draft.woWinner === 1 || draft.woWinner === 2) {
    const score1 =
      draft.woWinner === 1 ? PLAYOFFS_WO_SCORE_WIN : PLAYOFFS_WO_SCORE_LOSS;
    const score2 =
      draft.woWinner === 2 ? PLAYOFFS_WO_SCORE_WIN : PLAYOFFS_WO_SCORE_LOSS;
    return {
      score1,
      score2,
      payload: { format: PLAYOFFS_SCORE_FORMAT, wo: true, stb: null },
    };
  }

  const set1 = parseDraftSetField(draft.set1, "Set 1");
  const set2 = parseDraftSetField(draft.set2, "Set 2");
  const score1 = set1.p1 + set2.p1;
  const score2 = set1.p2 + set2.p2;

  let stb: PlayoffsStbScore | null = null;
  if (score1 === score2) {
    const stb1 = Number(draft.stb1);
    const stb2 = Number(draft.stb2);
    if (!Number.isFinite(stb1) || !Number.isFinite(stb2)) {
      throw new Error("Empate en games: completa el súper tie-break a 5.");
    }
    stb = { p1: stb1, p2: stb2 };
  }

  const payload: PlayoffsSetScoresPayload = {
    format: PLAYOFFS_SCORE_FORMAT,
    wo: false,
    stb,
    sets: [set1, set2],
  };

  const computed = computePlayoffsMatchPoints(score1, score2, payload);
  if (!computed.ok) throw new Error(computed.error);

  return { score1, score2, payload };
}

export function playoffsMatchDisplay(
  score1: number,
  score2: number,
  payload: PlayoffsSetScoresPayload | null
): string {
  if (payload?.wo) return `WO ${score1}-${score2}`;
  const setsLabel =
    payload?.sets && payload.sets.length === 2
      ? ` · sets ${payload.sets[0].p1}-${payload.sets[0].p2}, ${payload.sets[1].p1}-${payload.sets[1].p2}`
      : "";
  if (payload?.stb) {
    return `${score1}-${score2}${setsLabel} (STB ${payload.stb.p1}-${payload.stb.p2})`;
  }
  return `${score1}-${score2}${setsLabel}`;
}
