/**
 * Marcador / puntos EXCLUSIVOS de modalidad `parejas_fijas_playoffs`.
 * NO usar desde parejas_fijas legacy.
 *
 * REGLA OFICIAL:
 * “Cada set se registra como terminó por tiempo y puede ser ganado, perdido o
 * empatado. La pareja con más sets ganados gana directamente; si ambas tienen
 * la misma cantidad de sets ganados, el partido se resuelve por Súper Tie-Break.
 * En una victoria directa, los games acumulados determinan el margen: diferencia
 * >2 = holgada (3/0), diferencia de 1–2 = cerrada (2/1).”
 *
 * Tabla General: 1. Puntos · 2. DIF GF−GC · 3. Enfrentamiento directo.
 *
 * Algoritmo del partido (orden fijo):
 * 1. WO → +3 / −1
 * 2–3. Evaluar Set 1 / Set 2: A gana / B gana / empate (empate no suma set)
 * 4. setsWonA / setsWonB
 * 5. Si setsWonA === setsWonB → STB (+2 / +1); sin STB → pendiente
 * 6–7. Si una pareja tiene más sets → victoria directa; gameDiff > 2 → holgada;
 *      gameDiff 1–2 → cerrada. Games de sets empatados sí cuentan en GF/GC.
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
  /** Desglose Set 1 / Set 2. Obligatorios salvo WO. */
  sets?: [PlayoffsSetPair, PlayoffsSetPair];
};

export type PlayoffsResultType =
  | "HOLGADA"
  | "CERRADA"
  | "SUPER_TIE_BREAK"
  | "WO"
  | "PENDING_TIEBREAK";

export type PlayoffsMatchPoints = {
  pointsP1: number;
  pointsP2: number;
  p1Won: boolean;
  viaWo: boolean;
  viaStb: boolean;
  resultType: PlayoffsResultType;
  setsWonP1: number;
  setsWonP2: number;
  gamesTotalP1: number;
  gamesTotalP2: number;
  gameDiff: number;
  requiresSuperTieBreak: boolean;
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
  | {
      kind: "holgada";
      title: string;
      line: string;
      setsP1: number;
      setsP2: number;
      gamesP1: number;
      gamesP2: number;
    }
  | {
      kind: "cerrada";
      title: string;
      line: string;
      setsP1: number;
      setsP2: number;
      gamesP1: number;
      gamesP2: number;
    }
  | {
      kind: "needs_stb";
      title: string;
      line: string;
      setsP1: number;
      setsP2: number;
      gamesP1: number;
      gamesP2: number;
    }
  | {
      kind: "stb";
      title: string;
      line: string;
      setsP1: number;
      setsP2: number;
      gamesP1: number;
      gamesP2: number;
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
    if (a && b) sets = [a, b];
  }

  return { format: PLAYOFFS_SCORE_FORMAT, wo, stb, sets };
}

/** Games no negativos enteros. */
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

/**
 * Set válido: enteros ≥0. Empate permitido (tiempo); no hace falta llegar a 6.
 */
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

/** Súper Tie-Break a 5 (ganador ≥5 y sin empate). Diff del STB no afecta puntos. */
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

export function setWinnerSide(set: PlayoffsSetPair): 1 | 2 | null {
  if (set.p1 === set.p2) return null;
  return set.p1 > set.p2 ? 1 : 2;
}

/** Empate en un set = nadie suma ese set. */
export function countSetsWon(
  set1: PlayoffsSetPair,
  set2: PlayoffsSetPair
): { setsWonP1: number; setsWonP2: number } {
  const w1 = setWinnerSide(set1);
  const w2 = setWinnerSide(set2);
  return {
    setsWonP1: (w1 === 1 ? 1 : 0) + (w2 === 1 ? 1 : 0),
    setsWonP2: (w1 === 2 ? 1 : 0) + (w2 === 2 ? 1 : 0),
  };
}

/**
 * STB cuando setsWonA === setsWonB (cubre 1-1 y 0-0 con ambos sets empatados).
 */
export function requiresPlayoffsSuperTieBreak(
  setsWonP1: number,
  setsWonP2: number
): boolean {
  return setsWonP1 === setsWonP2;
}

function directWinByGameDiff(
  p1Won: boolean,
  setsWonP1: number,
  setsWonP2: number,
  gamesTotalP1: number,
  gamesTotalP2: number
): PlayoffsMatchPoints {
  const winnerGames = p1Won ? gamesTotalP1 : gamesTotalP2;
  const loserGames = p1Won ? gamesTotalP2 : gamesTotalP1;
  const gameDiff = winnerGames - loserGames;

  if (gameDiff > 2) {
    return {
      pointsP1: p1Won ? 3 : 0,
      pointsP2: p1Won ? 0 : 3,
      p1Won,
      viaWo: false,
      viaStb: false,
      resultType: "HOLGADA",
      setsWonP1,
      setsWonP2,
      gamesTotalP1,
      gamesTotalP2,
      gameDiff,
      requiresSuperTieBreak: false,
    };
  }

  return {
    pointsP1: p1Won ? 2 : 1,
    pointsP2: p1Won ? 1 : 2,
    p1Won,
    viaWo: false,
    viaStb: false,
    resultType: "CERRADA",
    setsWonP1,
    setsWonP2,
    gamesTotalP1,
    gamesTotalP2,
    gameDiff,
    requiresSuperTieBreak: false,
  };
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
    const err1 = validatePlayoffsSetPair(set1.p1, set1.p2, "Set 1");
    if (err1) return { error: err1 };
    const err2 = validatePlayoffsSetPair(set2.p1, set2.p2, "Set 2");
    if (err2) return { error: err2 };
    return {
      gamesTotalP1: set1.p1 + set2.p1,
      gamesTotalP2: set1.p2 + set2.p2,
    };
  }

  return {
    error: "Falta el desglose de sets (Set 1 y Set 2 son obligatorios).",
  };
}

function woMatchPoints(
  score1: number,
  score2: number
): { ok: true; result: PlayoffsMatchPoints } | { ok: false; error: string } {
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
  const p1Won = score1 > score2;
  return {
    ok: true,
    result: {
      pointsP1: p1Won ? 3 : -1,
      pointsP2: p1Won ? -1 : 3,
      p1Won,
      viaWo: true,
      viaStb: false,
      resultType: "WO",
      setsWonP1: 0,
      setsWonP2: 0,
      gamesTotalP1: score1,
      gamesTotalP2: score2,
      gameDiff: Math.abs(score1 - score2),
      requiresSuperTieBreak: false,
    },
  };
}

/**
 * Calcula puntos ranking playoffs: PRIMERO mandan los sets.
 * Set empatado válido (no suma). Games clasifican victoria directa (holgada/cerrada).
 * Empate de sets (1-1 o 0-0) → STB.
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
    if (payload.stb) {
      return { ok: false, error: "WO no admite súper tie-break." };
    }
    return woMatchPoints(score1, score2);
  }

  if (!payload.sets || payload.sets.length !== 2) {
    return {
      ok: false,
      error: "Falta el desglose de sets (Set 1 y Set 2 son obligatorios).",
    };
  }

  const [set1, set2] = payload.sets;
  const err1 = validatePlayoffsSetPair(set1.p1, set1.p2, "Set 1");
  if (err1) return { ok: false, error: err1 };
  const err2 = validatePlayoffsSetPair(set2.p1, set2.p2, "Set 2");
  if (err2) return { ok: false, error: err2 };

  const { setsWonP1, setsWonP2 } = countSetsWon(set1, set2);
  const gamesTotalP1 = set1.p1 + set2.p1;
  const gamesTotalP2 = set1.p2 + set2.p2;

  if (requiresPlayoffsSuperTieBreak(setsWonP1, setsWonP2)) {
    if (!payload.stb) {
      return {
        ok: false,
        error:
          setsWonP1 === 1 && setsWonP2 === 1
            ? "Empate 1-1 en sets: registra el súper tie-break a 5."
            : "Empate en sets: registra el súper tie-break a 5.",
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
        resultType: "SUPER_TIE_BREAK",
        setsWonP1,
        setsWonP2,
        gamesTotalP1,
        gamesTotalP2,
        gameDiff: Math.abs(gamesTotalP1 - gamesTotalP2),
        requiresSuperTieBreak: true,
      },
    };
  }

  if (payload.stb) {
    return {
      ok: false,
      error: "Súper tie-break solo aplica con empate en sets (1-1 o 0-0).",
    };
  }

  // Victoria directa: más sets ganados (2-0 o 1-0 con un set empatado).
  if (setsWonP1 > setsWonP2) {
    return {
      ok: true,
      result: directWinByGameDiff(
        true,
        setsWonP1,
        setsWonP2,
        gamesTotalP1,
        gamesTotalP2
      ),
    };
  }
  if (setsWonP2 > setsWonP1) {
    return {
      ok: true,
      result: directWinByGameDiff(
        false,
        setsWonP1,
        setsWonP2,
        gamesTotalP1,
        gamesTotalP2
      ),
    };
  }

  return { ok: false, error: "Marcador de sets inválido." };
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

  const err1 = validatePlayoffsSetPair(input.set1P1, input.set1P2, "Set 1");
  if (err1) return { ok: false, error: err1 };
  const err2 = validatePlayoffsSetPair(input.set2P1, input.set2P2, "Set 2");
  if (err2) return { ok: false, error: err2 };

  const gamesTotalP1 = input.set1P1 + input.set2P1;
  const gamesTotalP2 = input.set1P2 + input.set2P2;

  const sets = countSetsWon(
    { p1: input.set1P1, p2: input.set1P2 },
    { p1: input.set2P1, p2: input.set2P2 }
  );

  let stb: PlayoffsStbScore | null = null;
  if (requiresPlayoffsSuperTieBreak(sets.setsWonP1, sets.setsWonP2)) {
    if (
      input.stbP1 == null ||
      input.stbP2 == null ||
      !Number.isFinite(input.stbP1) ||
      !Number.isFinite(input.stbP2)
    ) {
      return {
        ok: false,
        error:
          sets.setsWonP1 === 1 && sets.setsWonP2 === 1
            ? "Empate 1-1 en sets: registra el súper tie-break a 5."
            : "Empate en sets: registra el súper tie-break a 5.",
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
  if (![s1p1, s1p2, s2p1, s2p2].every((n) => Number.isFinite(n))) {
    return null;
  }
  return { score1: s1p1 + s2p1, score2: s1p2 + s2p2 };
}

/** Sets ganados desde draft (null si incompleto). Empate de set = 0 para ambos. */
export function playoffsSetsFromDraft(
  draft: PlayoffsScoreDraft
): { setsP1: number; setsP2: number } | null {
  if (
    draft.set1.p1 === "" ||
    draft.set1.p2 === "" ||
    draft.set2.p1 === "" ||
    draft.set2.p2 === ""
  ) {
    return null;
  }
  const set1 = {
    p1: Number(draft.set1.p1),
    p2: Number(draft.set1.p2),
  };
  const set2 = {
    p1: Number(draft.set2.p1),
    p2: Number(draft.set2.p2),
  };
  if (
    ![set1.p1, set1.p2, set2.p1, set2.p2].every((n) => Number.isFinite(n))
  ) {
    return null;
  }
  const counted = countSetsWon(set1, set2);
  return { setsP1: counted.setsWonP1, setsP2: counted.setsWonP2 };
}

export function needsPlayoffsStbDraft(draft: PlayoffsScoreDraft): boolean {
  if (draft.woWinner != null) return false;
  const sets = playoffsSetsFromDraft(draft);
  if (!sets) return false;
  return requiresPlayoffsSuperTieBreak(sets.setsP1, sets.setsP2);
}

export function previewPlayoffsPointsFromDraft(
  draft: PlayoffsScoreDraft
): PlayoffsPointsPreview {
  if (draft.woWinner === 1 || draft.woWinner === 2) {
    return {
      kind: "wo",
      title: "Walkover",
      line: "Ganador +3 · Perdedor −1",
    };
  }

  const sets = playoffsSetsFromDraft(draft);
  const totals = playoffsTotalsFromDraft(draft);
  if (!sets || !totals) return { kind: "incomplete" };

  const { setsP1, setsP2 } = sets;
  const { score1: gamesP1, score2: gamesP2 } = totals;

  if (requiresPlayoffsSuperTieBreak(setsP1, setsP2)) {
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
        line: "Ganador STB +2 · Perdedor +1",
        setsP1,
        setsP2,
        gamesP1,
        gamesP2,
      };
    }
    return {
      kind: "needs_stb",
      title: "Empate en sets",
      line: "Requiere Súper Tie-Break a 5",
      setsP1,
      setsP2,
      gamesP1,
      gamesP2,
    };
  }

  // Victoria directa (más sets: 2-0 o 1-0 con un set empatado)
  if (setsP1 > setsP2 || setsP2 > setsP1) {
    const p1Won = setsP1 > setsP2;
    const winnerGames = p1Won ? gamesP1 : gamesP2;
    const loserGames = p1Won ? gamesP2 : gamesP1;
    const gameDiff = winnerGames - loserGames;
    if (gameDiff > 2) {
      return {
        kind: "holgada",
        title: "Victoria holgada",
        line: "Ganador +3 · Perdedor 0",
        setsP1,
        setsP2,
        gamesP1,
        gamesP2,
      };
    }
    return {
      kind: "cerrada",
      title: "Victoria cerrada",
      line: "Ganador +2 · Perdedor +1",
      setsP1,
      setsP2,
      gamesP1,
      gamesP2,
    };
  }

  return { kind: "incomplete" };
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
  const sets = countSetsWon(set1, set2);
  const needsStb = requiresPlayoffsSuperTieBreak(
    sets.setsWonP1,
    sets.setsWonP2
  );
  const stb1 = draft.stb1 === "" ? null : Number(draft.stb1);
  const stb2 = draft.stb2 === "" ? null : Number(draft.stb2);

  const computed = computePlayoffsMatchFromSetInputs({
    set1P1: set1.p1,
    set1P2: set1.p2,
    set2P1: set2.p1,
    set2P2: set2.p2,
    stbP1: needsStb && Number.isFinite(stb1 as number) ? (stb1 as number) : null,
    stbP2: needsStb && Number.isFinite(stb2 as number) ? (stb2 as number) : null,
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
