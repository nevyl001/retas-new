/** Marcador por set (local = pareja_local, visitante = pareja_visitante). */
import type { PartidoSetScore } from "./types";

export type { PartidoSetScore };

export type PartidoSetsSide = "local" | "visitante";

export interface PartidoSetsSource {
  sets_resultado?: unknown;
  puntos_local?: number | null;
  puntos_visitante?: number | null;
  estado?: string;
}

const MAX_SETS = 3;
const SETS_TO_WIN = 2;

function isValidSetScore(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

/** Parsea JSON de BD; null si no hay sets almacenados. */
export function parseSetsResultado(raw: unknown): PartidoSetScore[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const sets: PartidoSetScore[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const local = (item as PartidoSetScore).local;
    const visitante = (item as PartidoSetScore).visitante;
    if (!isValidSetScore(local) || !isValidSetScore(visitante)) return null;
    sets.push({
      local: Math.floor(local),
      visitante: Math.floor(visitante),
    });
  }
  return sets.length > 0 ? sets : null;
}

/** Evita leer puntos_local/puntos_visitante como games cuando guardaron sets ganados (2-1). */
export function looksLikeSetWinTally(
  puntosLocal: number,
  puntosVisitante: number
): boolean {
  const max = Math.max(puntosLocal, puntosVisitante);
  return (
    max <= 2 &&
    puntosLocal >= 0 &&
    puntosVisitante >= 0 &&
    puntosLocal !== puntosVisitante
  );
}

/** Sets del partido: JSON si existe; si no, un set desde puntos_local/puntos_visitante. */
export function getPartidoSets(partido: PartidoSetsSource): PartidoSetScore[] {
  const stored = parseSetsResultado(partido.sets_resultado);
  if (stored && stored.length > 0) return stored;
  if (
    partido.estado === "jugado" &&
    partido.puntos_local != null &&
    partido.puntos_visitante != null
  ) {
    if (
      looksLikeSetWinTally(partido.puntos_local, partido.puntos_visitante)
    ) {
      return [];
    }
    return [
      {
        local: partido.puntos_local,
        visitante: partido.puntos_visitante,
      },
    ];
  }
  return [{ local: 0, visitante: 0 }];
}

export function matchWinnerSideFromPartido(
  partido: PartidoSetsSource & {
    ganador_id?: string | null;
    pareja_local_id?: string | null;
    pareja_visitante_id?: string | null;
  }
): PartidoSetsSide | null {
  if (partido.ganador_id && partido.pareja_local_id) {
    if (partido.ganador_id === partido.pareja_local_id) return "local";
    if (partido.ganador_id === partido.pareja_visitante_id) return "visitante";
  }
  if (partido.estado === "jugado") {
    return detectMatchWinner(getPartidoSets(partido));
  }
  return null;
}

export function setWinnerSide(set: PartidoSetScore): PartidoSetsSide | null {
  if (set.local > set.visitante) return "local";
  if (set.visitante > set.local) return "visitante";
  return null;
}

export function countSetWins(sets: PartidoSetScore[]): {
  local: number;
  visitante: number;
} {
  let local = 0;
  let visitante = 0;
  for (const s of sets) {
    const w = setWinnerSide(s);
    if (w === "local") local += 1;
    else if (w === "visitante") visitante += 1;
  }
  return { local, visitante };
}

/** Ganador del partido; con 1 set basta ganar ese set; con 2+ aplica al mejor de 3. */
export function detectMatchWinner(
  sets: PartidoSetScore[]
): PartidoSetsSide | null {
  if (sets.length === 0) return null;
  if (sets.length === 1) {
    return setWinnerSide(sets[0]);
  }
  const { local, visitante } = countSetWins(sets);
  if (local >= SETS_TO_WIN) return "local";
  if (visitante >= SETS_TO_WIN) return "visitante";
  return null;
}

export function canAddAnotherSet(sets: PartidoSetScore[]): boolean {
  if (sets.length >= MAX_SETS) return false;
  const { local, visitante } = countSetWins(sets);
  if (local >= SETS_TO_WIN || visitante >= SETS_TO_WIN) return false;
  return true;
}

export function isSetComplete(set: PartidoSetScore): boolean {
  return (
    typeof set.local === "number" &&
    typeof set.visitante === "number" &&
    !Number.isNaN(set.local) &&
    !Number.isNaN(set.visitante) &&
    set.local >= 0 &&
    set.visitante >= 0
  );
}

export function allSetsComplete(sets: PartidoSetScore[]): boolean {
  return sets.length > 0 && sets.every(isSetComplete);
}

export function canRemoveLastSet(sets: PartidoSetScore[]): boolean {
  return sets.length > 1;
}

export function emptySetDraft(): PartidoSetScore {
  return { local: 0, visitante: 0 };
}

/** Formato gestión: "6-2 / 3-6 / 7-5" o "6 — 2" si un solo set. */
export function formatSetsInline(sets: PartidoSetScore[]): string {
  if (sets.length === 0) return "—";
  if (sets.length === 1) {
    return `${sets[0].local} — ${sets[0].visitante}`;
  }
  return sets.map((s) => `${s.local}-${s.visitante}`).join(" / ");
}

/** Formato compacto para cuadro: "6–2 / 3–6" */
export function formatSetsCompact(sets: PartidoSetScore[]): string {
  if (sets.length === 0) return "";
  if (sets.length === 1) {
    return `${sets[0].local}–${sets[0].visitante}`;
  }
  return sets.map((s) => `${s.local}–${s.visitante}`).join(" / ");
}

export interface PersistSetsPayload {
  puntos_local: number;
  puntos_visitante: number;
  sets_resultado: PartidoSetScore[] | null;
  ganadorSide: PartidoSetsSide;
}

/** Prepara datos para guardar en BD a partir de sets completos con ganador. */
export function buildPersistPayload(
  sets: PartidoSetScore[]
): PersistSetsPayload | null {
  if (!allSetsComplete(sets)) return null;
  const winner = detectMatchWinner(sets);
  if (!winner) return null;

  if (sets.length === 1) {
    return {
      puntos_local: sets[0].local,
      puntos_visitante: sets[0].visitante,
      sets_resultado: sets,
      ganadorSide: winner,
    };
  }

  const wins = countSetWins(sets);
  return {
    puntos_local: wins.local,
    puntos_visitante: wins.visitante,
    sets_resultado: sets,
    ganadorSide: winner,
  };
}
