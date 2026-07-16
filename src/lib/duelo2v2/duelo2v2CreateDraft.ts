import type { RivieraJugador } from "../rivieraJugadores/types";

export const DUELO_2V2_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export type Duelo2v2PairDraftIds = {
  j1Id: string;
  j2Id: string;
};

export type Duelo2v2CreateDraft = {
  savedAt: string;
  nombre: string;
  cancha: string;
  draftDate: string;
  draftTimeStart: string;
  draftTimeEnd: string;
  pairA: Duelo2v2PairDraftIds | null;
  pairB: Duelo2v2PairDraftIds | null;
  /** Duelo shell creado al lanzar convocatoria (idempotente). */
  openDueloId?: string | null;
};

export function duelo2v2DraftStorageKey(organizadorId: string): string {
  return `duelo-2v2-draft:${organizadorId.trim()}`;
}

function isValidPairIds(
  value: unknown
): value is Duelo2v2PairDraftIds {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.j1Id === "string" &&
    o.j1Id.trim().length > 0 &&
    typeof o.j2Id === "string" &&
    o.j2Id.trim().length > 0
  );
}

function parseDraft(raw: string): Duelo2v2CreateDraft | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.savedAt !== "string" || !parsed.savedAt.trim()) return null;
    if (typeof parsed.nombre !== "string") return null;
    if (typeof parsed.cancha !== "string") return null;
    if (typeof parsed.draftDate !== "string") return null;
    if (typeof parsed.draftTimeStart !== "string") return null;
    if (typeof parsed.draftTimeEnd !== "string") return null;

    const pairA =
      parsed.pairA === null
        ? null
        : isValidPairIds(parsed.pairA)
          ? { j1Id: parsed.pairA.j1Id.trim(), j2Id: parsed.pairA.j2Id.trim() }
          : null;
    const pairB =
      parsed.pairB === null
        ? null
        : isValidPairIds(parsed.pairB)
          ? { j1Id: parsed.pairB.j1Id.trim(), j2Id: parsed.pairB.j2Id.trim() }
          : null;

    return {
      savedAt: parsed.savedAt,
      nombre: parsed.nombre,
      cancha: parsed.cancha,
      draftDate: parsed.draftDate,
      draftTimeStart: parsed.draftTimeStart,
      draftTimeEnd: parsed.draftTimeEnd,
      pairA,
      pairB,
      openDueloId:
        typeof parsed.openDueloId === "string" && parsed.openDueloId.trim()
          ? parsed.openDueloId.trim()
          : null,
    };
  } catch {
    return null;
  }
}

export function isDuelo2v2CreateDraftExpired(
  draft: Duelo2v2CreateDraft,
  nowMs = Date.now()
): boolean {
  const savedMs = Date.parse(draft.savedAt);
  if (!Number.isFinite(savedMs)) return true;
  return nowMs - savedMs > DUELO_2V2_DRAFT_TTL_MS;
}

export function readDuelo2v2CreateDraft(
  organizadorId: string,
  storage: Storage = sessionStorage
): Duelo2v2CreateDraft | null {
  const org = organizadorId.trim();
  if (!org) return null;

  const raw = storage.getItem(duelo2v2DraftStorageKey(org));
  if (!raw) return null;

  const draft = parseDraft(raw);
  if (!draft) {
    storage.removeItem(duelo2v2DraftStorageKey(org));
    return null;
  }

  if (isDuelo2v2CreateDraftExpired(draft)) {
    storage.removeItem(duelo2v2DraftStorageKey(org));
    return null;
  }

  return draft;
}

export function writeDuelo2v2CreateDraft(
  organizadorId: string,
  draft: Omit<Duelo2v2CreateDraft, "savedAt">,
  storage: Storage = sessionStorage,
  savedAt = new Date().toISOString()
): void {
  const org = organizadorId.trim();
  if (!org) return;

  const payload: Duelo2v2CreateDraft = {
    ...draft,
    savedAt,
  };

  storage.setItem(duelo2v2DraftStorageKey(org), JSON.stringify(payload));
}

export function clearDuelo2v2CreateDraft(
  organizadorId: string,
  storage: Storage = sessionStorage
): void {
  const org = organizadorId.trim();
  if (!org) return;
  storage.removeItem(duelo2v2DraftStorageKey(org));
}

export function pairToDraftIds(
  pair: { j1: RivieraJugador; j2: RivieraJugador } | null
): Duelo2v2PairDraftIds | null {
  if (!pair) return null;
  return { j1Id: pair.j1.id, j2Id: pair.j2.id };
}

export function rehydrateDueloPairFromDraft(
  jugadores: RivieraJugador[],
  ids: Duelo2v2PairDraftIds | null | undefined
): { j1: RivieraJugador; j2: RivieraJugador } | null {
  if (!ids) return null;
  const j1 = jugadores.find((j) => j.id === ids.j1Id);
  const j2 = jugadores.find((j) => j.id === ids.j2Id);
  if (!j1 || !j2) return null;
  return { j1, j2 };
}
