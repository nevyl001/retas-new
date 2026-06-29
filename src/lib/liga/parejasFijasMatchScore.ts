/** Marcador por sets en liga parejas fijas (2 de 3, set 3 super tie-break a 10). */

export type LigaPartidoSetKind = "regular" | "super_tiebreak";

export type LigaPartidoSetScore = {
  p1: number;
  p2: number;
  kind: LigaPartidoSetKind;
};

export type LigaPartidoSetScores = {
  sets: LigaPartidoSetScore[];
};

export type ParejasFijasMatchTotals = {
  gamesP1: number;
  gamesP2: number;
  setsP1: number;
  setsP2: number;
  p1WonMatch: boolean;
  display: string;
};

export type SetScoreDraft = {
  p1: string;
  p2: string;
};

export type ParejasFijasSetsDraft = {
  set1: SetScoreDraft;
  set2: SetScoreDraft;
  set3: SetScoreDraft;
};

const EMPTY_DRAFT: SetScoreDraft = { p1: "", p2: "" };

export function emptyParejasFijasSetsDraft(): ParejasFijasSetsDraft {
  return { set1: { ...EMPTY_DRAFT }, set2: { ...EMPTY_DRAFT }, set3: { ...EMPTY_DRAFT } };
}

export function parseSetScoresJson(raw: unknown): LigaPartidoSetScores | null {
  if (!raw || typeof raw !== "object") return null;
  const sets = (raw as { sets?: unknown }).sets;
  if (!Array.isArray(sets) || !sets.length) return null;

  const parsed: LigaPartidoSetScore[] = [];
  for (const row of sets) {
    if (!row || typeof row !== "object") return null;
    const r = row as Record<string, unknown>;
    const p1 = Number(r.p1);
    const p2 = Number(r.p2);
    const kind = r.kind === "super_tiebreak" ? "super_tiebreak" : "regular";
    if (!Number.isFinite(p1) || !Number.isFinite(p2)) return null;
    parsed.push({ p1, p2, kind });
  }
  return { sets: parsed };
}

export function validateRegularSet(a: number, b: number): string | null {
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    return "Los games del set deben ser números enteros.";
  }
  if (a < 0 || b < 0) return "Los games no pueden ser negativos.";
  if (a === b) return "No puede haber empate en un set.";

  const w = Math.max(a, b);
  const l = Math.min(a, b);

  if (w < 6) return "Para ganar un set se necesitan al menos 6 games.";
  if (w === 6 && l === 5) {
    return "Set incompleto: con 6-5 se requiere diferencia de 2 games (p. ej. 7-5).";
  }
  if (w - l < 2 && !(w === 7 && l === 6)) {
    return "El set se gana con 2 games de diferencia (p. ej. 6-4, 7-5).";
  }
  if (w > 7 && w - l < 2) return "Marcador de set inválido.";

  return null;
}

export function validateSuperTiebreakSet(a: number, b: number): string | null {
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    return "Los puntos del super tie-break deben ser enteros.";
  }
  if (a < 0 || b < 0) return "Los puntos no pueden ser negativos.";
  if (a === b) return "El super tie-break siempre tiene ganador (sin empate).";

  const w = Math.max(a, b);
  const l = Math.min(a, b);

  if (w < 10) return "El tercer set es super tie-break: el ganador llega a 10 puntos.";
  if (w - l < 2) return "Se gana por 2 puntos de diferencia (p. ej. 10-8, 11-9).";

  return null;
}

function setWinner(set: LigaPartidoSetScore): 1 | 2 {
  return set.p1 > set.p2 ? 1 : 2;
}

export function formatSetScoresDisplay(sets: LigaPartidoSetScore[]): string {
  return sets
    .map((s) => {
      const label = s.kind === "super_tiebreak" ? `${s.p1}-${s.p2} (STB)` : `${s.p1}-${s.p2}`;
      return label;
    })
    .join(", ");
}

export function computeParejasFijasMatchTotals(
  sets: LigaPartidoSetScore[]
): ParejasFijasMatchTotals {
  const validated = validateParejasFijasMatchSets(sets);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  let gamesP1 = 0;
  let gamesP2 = 0;
  let setsP1 = 0;
  let setsP2 = 0;

  for (const s of sets) {
    gamesP1 += s.p1;
    gamesP2 += s.p2;
    const w = setWinner(s);
    if (w === 1) setsP1 += 1;
    else setsP2 += 1;
  }

  return {
    gamesP1,
    gamesP2,
    setsP1,
    setsP2,
    p1WonMatch: setsP1 > setsP2,
    display: formatSetScoresDisplay(sets),
  };
}

export function validateParejasFijasMatchSets(
  sets: LigaPartidoSetScore[]
): { ok: true } | { ok: false; error: string } {
  if (sets.length < 2 || sets.length > 3) {
    return {
      ok: false,
      error: "El partido es al mejor de 3 sets: registra 2 sets (2-0) o 3 (2-1).",
    };
  }

  for (let i = 0; i < Math.min(2, sets.length); i += 1) {
    const s = sets[i]!;
    if (s.kind !== "regular") {
      return { ok: false, error: `El set ${i + 1} debe ser un set normal (games).` };
    }
    const err = validateRegularSet(s.p1, s.p2);
    if (err) return { ok: false, error: `Set ${i + 1}: ${err}` };
  }

  const w1 = setWinner(sets[0]!);
  const w2 = setWinner(sets[1]!);

  if (sets.length === 2) {
    if (w1 !== w2) {
      return {
        ok: false,
        error: "Van 1-1 en sets: registra el super tie-break (set 3 a 10 puntos).",
      };
    }
    return { ok: true };
  }

  if (w1 === w2) {
    return {
      ok: false,
      error: "Con 2-0 en sets no hace falta tercer set.",
    };
  }

  const s3 = sets[2]!;
  if (s3.kind !== "super_tiebreak") {
    return { ok: false, error: "El set 3 debe ser super tie-break a 10 puntos." };
  }
  const err3 = validateSuperTiebreakSet(s3.p1, s3.p2);
  if (err3) return { ok: false, error: `Set 3: ${err3}` };

  return { ok: true };
}

function parseDraftSet(
  draft: SetScoreDraft,
  label: string
): { p1: number; p2: number } | null {
  const p1s = draft.p1.trim();
  const p2s = draft.p2.trim();
  if (!p1s && !p2s) return null;
  if (!p1s || !p2s) {
    throw new Error(`${label}: completa ambos marcadores.`);
  }
  const p1 = Number(p1s);
  const p2 = Number(p2s);
  if (!Number.isFinite(p1) || !Number.isFinite(p2)) {
    throw new Error(`${label}: marcador inválido.`);
  }
  return { p1, p2 };
}

/** Convierte el formulario de sets en filas validadas listas para guardar. */
export function buildSetsFromDraft(draft: ParejasFijasSetsDraft): LigaPartidoSetScore[] {
  const normalized = normalizeParejasFijasDraft(draft);
  const raw1 = parseDraftSet(normalized.set1, "Set 1");
  const raw2 = parseDraftSet(normalized.set2, "Set 2");
  if (!raw1 || !raw2) {
    throw new Error("Registra al menos el set 1 y el set 2.");
  }

  const set1: LigaPartidoSetScore = { ...raw1, kind: "regular" };
  const set2: LigaPartidoSetScore = { ...raw2, kind: "regular" };

  const err1 = validateRegularSet(set1.p1, set1.p2);
  if (err1) throw new Error(`Set 1: ${err1}`);
  const err2 = validateRegularSet(set2.p1, set2.p2);
  if (err2) throw new Error(`Set 2: ${err2}`);

  const w1 = setWinner(set1);
  const w2 = setWinner(set2);

  if (w1 !== w2) {
    const raw3 = parseDraftSet(normalized.set3, "Set 3 (super tie-break)");
    if (!raw3) {
      throw new Error(
        "Van 1-1 en sets: registra el super tie-break (set 3, muerte súbita a 10)."
      );
    }
    const set3: LigaPartidoSetScore = { ...raw3, kind: "super_tiebreak" };
    const err3 = validateSuperTiebreakSet(set3.p1, set3.p2);
    if (err3) throw new Error(`Set 3: ${err3}`);
    return [set1, set2, set3];
  }

  return [set1, set2];
}

/** Limpia set 3 si ya no aplica (p. ej. corrección de 2-1 a 2-0). */
export function normalizeParejasFijasDraft(
  draft: ParejasFijasSetsDraft
): ParejasFijasSetsDraft {
  if (needsSuperTiebreakDraft(draft)) return draft;
  return { ...draft, set3: { p1: "", p2: "" } };
}

/** Validación previa al guardar; devuelve mensaje de error o null si está listo. */
export function validateParejasFijasDraft(
  draft: ParejasFijasSetsDraft
): string | null {
  try {
    buildSetsFromDraft(draft);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Marcador inválido.";
  }
}

export function draftFromSetScores(
  stored: LigaPartidoSetScores | null | undefined
): ParejasFijasSetsDraft {
  const draft = emptyParejasFijasSetsDraft();
  if (!stored?.sets?.length) return draft;

  const regular = stored.sets.filter((s) => s.kind === "regular");
  const stb = stored.sets.find((s) => s.kind === "super_tiebreak");

  if (regular[0]) {
    draft.set1 = { p1: String(regular[0].p1), p2: String(regular[0].p2) };
  }
  if (regular[1]) {
    draft.set2 = { p1: String(regular[1].p1), p2: String(regular[1].p2) };
  }
  if (stb) {
    draft.set3 = { p1: String(stb.p1), p2: String(stb.p2) };
  }

  return draft;
}

export function needsSuperTiebreakDraft(draft: ParejasFijasSetsDraft): boolean {
  try {
    const raw1 = parseDraftSet(draft.set1, "Set 1");
    const raw2 = parseDraftSet(draft.set2, "Set 2");
    if (!raw1 || !raw2) return false;
    if (validateRegularSet(raw1.p1, raw1.p2)) return false;
    if (validateRegularSet(raw2.p1, raw2.p2)) return false;
    const w1 = raw1.p1 > raw1.p2 ? 1 : 2;
    const w2 = raw2.p1 > raw2.p2 ? 1 : 2;
    return w1 !== w2;
  } catch {
    return false;
  }
}

export function resolveParejasFijasPartidoTotals(partido: {
  score_pareja1: number | null;
  score_pareja2: number | null;
  set_scores?: LigaPartidoSetScores | null;
}): ParejasFijasMatchTotals | null {
  if (partido.set_scores?.sets?.length) {
    try {
      return computeParejasFijasMatchTotals(partido.set_scores.sets);
    } catch {
      return null;
    }
  }

  const g1 = partido.score_pareja1;
  const g2 = partido.score_pareja2;
  if (g1 == null || g2 == null) return null;
  if (g1 === g2) return null;

  return {
    gamesP1: g1,
    gamesP2: g2,
    setsP1: g1 > g2 ? 1 : 0,
    setsP2: g2 > g1 ? 1 : 0,
    p1WonMatch: g1 > g2,
    display: `${g1}-${g2}`,
  };
}
