/**
 * Marcador / puntos EXCLUSIVOS de modalidad `parejas_fijas_playoffs`.
 * NO usar desde parejas_fijas legacy.
 *
 * El resultado de Liga se calcula por games totales de ambos sets,
 * no por sets ganados.
 *
 * Captura: Set 1 + Set 2 (estructura de marcador; no hace falta llegar a 6).
 * gamesTotalP1 = set1P1 + set2P1
 * gamesTotalP2 = set1P2 + set2P2
 *
 * Diff ≥ 2 → 3/0 · Diff === 1 → 2/1 · Empate totales → STB a 5 → 2/1 · WO → 3/−1
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
  /** Desglose Set 1 / Set 2. Totales de Liga = suma de games (nunca sets ganados). */
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

export type PlayoffsPointsPreview =
  | { kind: "incomplete" }
  | { kind: "wo"; title: string; line: string }
  | { kind: "holgada"; title: string; line: string; gamesP1: number; gamesP2: number }
  | { kind: "ajustada"; title: string; line: string; gamesP1: number; gamesP2: number }
  | { kind: "needs_stb"; title: string; line: string; gamesP1: number; gamesP2: number }
  | { kind: "stb"; title: string; line: string; gamesP1: number; gamesP2: number };

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
    if (a && b) sets = [a, b];
  }

  return { format: PLAYOFFS_SCORE_FORMAT, wo, stb, sets };
}

/** Games no negativos enteros (totales o por set). Empate dentro de un set es válido. */
export function validatePlayoffsGamesValue(
  a: number,
  b: number,
  label?: string
): string | null {
  const prefix = label ? `${label}: ` : "";
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    return `${prefix}usa números enteros.`;
  }
  if (a < 0 || b < 0) return `${prefix}no puede ser negativo.`;
  return null;
}

/** @deprecated alias — no exige ganador de set (la Liga usa games totales). */
export function validatePlayoffsSetPair(
  a: number,
  b: number,
  label: string
): string | null {
  return validatePlayoffsGamesValue(a, b, label);
}

export function validatePlayoffsMainScores(
  a: number,
  b: number
): string | null {
  return validatePlayoffsGamesValue(a, b);
}

/** Súper Tie-Break a 5 (ganador ≥5 y sin empate). Diff del STB no afecta puntos de Liga. */
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
 * Deriva games totales desde sets almacenados.
 * No confiar en totales enviados manualmente cuando hay `sets`.
 */
export function derivePlayoffsGamesTotals(
  payload: PlayoffsSetScoresPayload,
  fallbackScore1?: number,
  fallbackScore2?: number
): { gamesTotalP1: number; gamesTotalP2: number } | { error: string } {
  if (payload.wo) {
    if (
      fallbackScore1 == null ||
      fallbackScore2 == null ||
      !Number.isFinite(fallbackScore1) ||
      !Number.isFinite(fallbackScore2)
    ) {
      return { error: "WO requiere marcador administrativo 6-0." };
    }
    return { gamesTotalP1: fallbackScore1, gamesTotalP2: fallbackScore2 };
  }

  if (payload.sets && payload.sets.length === 2) {
    const [set1, set2] = payload.sets;
    const err1 = validatePlayoffsGamesValue(set1.p1, set1.p2, "Set 1");
    if (err1) return { error: err1 };
    const err2 = validatePlayoffsGamesValue(set2.p1, set2.p2, "Set 2");
    if (err2) return { error: err2 };
    return {
      gamesTotalP1: set1.p1 + set2.p1,
      gamesTotalP2: set1.p2 + set2.p2,
    };
  }

  if (
    fallbackScore1 == null ||
    fallbackScore2 == null ||
    !Number.isFinite(fallbackScore1) ||
    !Number.isFinite(fallbackScore2)
  ) {
    return { error: "Falta el desglose de sets o los games totales." };
  }
  const mainErr = validatePlayoffsGamesValue(fallbackScore1, fallbackScore2);
  if (mainErr) return { error: mainErr };
  return { gamesTotalP1: fallbackScore1, gamesTotalP2: fallbackScore2 };
}

/**
 * Calcula puntos ranking playoffs a partir de games totales (+ STB/WO).
 * Si el payload trae `sets`, los totales se recalculan desde ahí
 * (ignorando score1/score2 del cliente salvo WO).
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

  const derived = derivePlayoffsGamesTotals(payload, score1, score2);
  if ("error" in derived) return { ok: false, error: derived.error };

  const gamesTotalP1 = derived.gamesTotalP1;
  const gamesTotalP2 = derived.gamesTotalP2;

  if (gamesTotalP1 === gamesTotalP2) {
    if (!payload.stb) {
      return {
        ok: false,
        error: "Empate en games totales: registra el súper tie-break a 5.",
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
      error: "Súper tie-break solo aplica con empate en games totales.",
    };
  }

  const diff = Math.abs(gamesTotalP1 - gamesTotalP2);
  const p1Won = gamesTotalP1 > gamesTotalP2;
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

  // diff === 1 → victoria ajustada
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

/**
 * Entrada canónica: sets + STB + WO. Deriva games totales internamente.
 */
export function computePlayoffsMatchFromSetInputs(input: {
  set1P1: number;
  set1P2: number;
  set2P1: number;
  set2P2: number;
  stbP1?: number | null;
  stbP2?: number | null;
  wo?: boolean;
  woWinner?: 1 | 2 | null;
}):
  | {
      ok: true;
      gamesTotalP1: number;
      gamesTotalP2: number;
      payload: PlayoffsSetScoresPayload;
      result: PlayoffsMatchPoints;
    }
  | { ok: false; error: string } {
  if (input.wo || input.woWinner === 1 || input.woWinner === 2) {
    const winner = input.woWinner === 2 ? 2 : 1;
    const score1 =
      winner === 1 ? PLAYOFFS_WO_SCORE_WIN : PLAYOFFS_WO_SCORE_LOSS;
    const score2 =
      winner === 2 ? PLAYOFFS_WO_SCORE_WIN : PLAYOFFS_WO_SCORE_LOSS;
    const payload: PlayoffsSetScoresPayload = {
      format: PLAYOFFS_SCORE_FORMAT,
      wo: true,
      stb: null,
    };
    const computed = computePlayoffsMatchPoints(score1, score2, payload);
    if (!computed.ok) return computed;
    return {
      ok: true,
      gamesTotalP1: score1,
      gamesTotalP2: score2,
      payload,
      result: computed.result,
    };
  }

  const err1 = validatePlayoffsGamesValue(input.set1P1, input.set1P2, "Set 1");
  if (err1) return { ok: false, error: err1 };
  const err2 = validatePlayoffsGamesValue(input.set2P1, input.set2P2, "Set 2");
  if (err2) return { ok: false, error: err2 };

  const gamesTotalP1 = input.set1P1 + input.set2P1;
  const gamesTotalP2 = input.set1P2 + input.set2P2;

  let stb: PlayoffsStbScore | null = null;
  if (gamesTotalP1 === gamesTotalP2) {
    if (
      input.stbP1 == null ||
      input.stbP2 == null ||
      !Number.isFinite(input.stbP1) ||
      !Number.isFinite(input.stbP2)
    ) {
      return {
        ok: false,
        error: "Empate en games totales: registra el súper tie-break a 5.",
      };
    }
    stb = { p1: input.stbP1, p2: input.stbP2 };
  }

  const payload: PlayoffsSetScoresPayload = {
    format: PLAYOFFS_SCORE_FORMAT,
    wo: false,
    stb,
    sets: [
      { p1: input.set1P1, p2: input.set1P2 },
      { p1: input.set2P1, p2: input.set2P2 },
    ],
  };

  const computed = computePlayoffsMatchPoints(
    gamesTotalP1,
    gamesTotalP2,
    payload
  );
  if (!computed.ok) return computed;
  return {
    ok: true,
    gamesTotalP1,
    gamesTotalP2,
    payload,
    result: computed.result,
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
  const err = validatePlayoffsGamesValue(p1, p2, label);
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
  if (![s1p1, s1p2, s2p1, s2p2].every((n) => Number.isFinite(n))) {
    return null;
  }
  return { score1: s1p1 + s2p1, score2: s1p2 + s2p2 };
}

export function needsPlayoffsStbDraft(draft: PlayoffsScoreDraft): boolean {
  if (draft.woWinner != null) return false;
  const totals = playoffsTotalsFromDraft(draft);
  return Boolean(totals && totals.score1 === totals.score2);
}

export function previewPlayoffsPointsFromDraft(
  draft: PlayoffsScoreDraft
): PlayoffsPointsPreview {
  if (draft.woWinner === 1 || draft.woWinner === 2) {
    return {
      kind: "wo",
      title: "Walkover",
      line: "+3 / −1",
    };
  }

  const totals = playoffsTotalsFromDraft(draft);
  if (!totals) return { kind: "incomplete" };

  const { score1: gamesP1, score2: gamesP2 } = totals;
  if (gamesP1 === gamesP2) {
    const stb1 = Number(draft.stb1);
    const stb2 = Number(draft.stb2);
    if (
      draft.stb1 !== "" &&
      draft.stb2 !== "" &&
      Number.isFinite(stb1) &&
      Number.isFinite(stb2) &&
      stb1 !== stb2 &&
      Math.max(stb1, stb2) >= PLAYOFFS_STB_TARGET
    ) {
      return {
        kind: "stb",
        title: "Súper Tie-Break",
        line: "+2 / +1",
        gamesP1,
        gamesP2,
      };
    }
    return {
      kind: "needs_stb",
      title: "Empate — requiere Súper Tie-Break",
      line: "Registra STB a 5",
      gamesP1,
      gamesP2,
    };
  }

  const diff = Math.abs(gamesP1 - gamesP2);
  if (diff >= 2) {
    return {
      kind: "holgada",
      title: "Victoria holgada",
      line: "+3 / 0",
      gamesP1,
      gamesP2,
    };
  }
  return {
    kind: "ajustada",
    title: "Victoria ajustada",
    line: "+2 / +1",
    gamesP1,
    gamesP2,
  };
}

export function buildPlayoffsPayloadFromDraft(
  draft: PlayoffsScoreDraft
): {
  score1: number;
  score2: number;
  payload: PlayoffsSetScoresPayload;
} {
  if (draft.woWinner === 1 || draft.woWinner === 2) {
    const computed = computePlayoffsMatchFromSetInputs({
      set1P1: 0,
      set1P2: 0,
      set2P1: 0,
      set2P2: 0,
      wo: true,
      woWinner: draft.woWinner,
    });
    if (!computed.ok) throw new Error(computed.error);
    return {
      score1: computed.gamesTotalP1,
      score2: computed.gamesTotalP2,
      payload: computed.payload,
    };
  }

  const set1 = parseDraftSetField(draft.set1, "Set 1");
  const set2 = parseDraftSetField(draft.set2, "Set 2");
  const stb1 =
    draft.stb1 === "" ? null : Number(draft.stb1);
  const stb2 =
    draft.stb2 === "" ? null : Number(draft.stb2);

  const computed = computePlayoffsMatchFromSetInputs({
    set1P1: set1.p1,
    set1P2: set1.p2,
    set2P1: set2.p1,
    set2P2: set2.p2,
    stbP1: Number.isFinite(stb1 as number) ? (stb1 as number) : null,
    stbP2: Number.isFinite(stb2 as number) ? (stb2 as number) : null,
  });
  if (!computed.ok) throw new Error(computed.error);

  return {
    score1: computed.gamesTotalP1,
    score2: computed.gamesTotalP2,
    payload: computed.payload,
  };
}

export function playoffsMatchDisplay(
  score1: number,
  score2: number,
  payload: PlayoffsSetScoresPayload | null
): string {
  if (payload?.wo) return `WO ${score1}-${score2}`;
  const parts: string[] = [];
  if (payload?.sets && payload.sets.length === 2) {
    parts.push(
      `${payload.sets[0].p1}-${payload.sets[0].p2}`,
      `${payload.sets[1].p1}-${payload.sets[1].p2}`
    );
  } else {
    parts.push(`${score1}-${score2}`);
  }
  if (payload?.stb) {
    parts.push(`STB ${payload.stb.p1}-${payload.stb.p2}`);
  }
  return parts.join(" · ");
}
