import type { DueloCourtSide } from "./dueloCourtLayout";

const KEY = "reta_abierta_preferred_side:";

type SideMap = Record<string, DueloCourtSide>;

function readMap(slug: string): SideMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(`${KEY}${slug}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: SideMap = {};
    for (const [id, side] of Object.entries(parsed)) {
      if (side === "A" || side === "B") out[id] = side;
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(slug: string, map: SideMap): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${KEY}${slug}`, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function storePreferredSide(
  slug: string,
  entryId: string,
  side: DueloCourtSide
): void {
  const map = readMap(slug);
  map[entryId] = side;
  writeMap(slug, map);
}

export function loadPreferredSides(slug: string): SideMap {
  return readMap(slug);
}

export function clearPreferredSide(slug: string, entryId: string): void {
  const map = readMap(slug);
  if (!(entryId in map)) return;
  delete map[entryId];
  writeMap(slug, map);
}
