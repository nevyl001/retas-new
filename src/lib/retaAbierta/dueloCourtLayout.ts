import type { OpenRegistrationPublicEntry } from "./types";

export type DueloCourtSlot = OpenRegistrationPublicEntry | null;

export type DueloCourtSide = "A" | "B";

export type DueloCourtLayout = {
  parejaA: [DueloCourtSlot, DueloCourtSlot];
  parejaB: [DueloCourtSlot, DueloCourtSlot];
};

export type DueloSlotMeta = {
  side: DueloCourtSide;
  sideLabel: string;
  positionLabel: string;
  partnerName: string | null;
};

function sideLabel(side: DueloCourtSide): string {
  return side === "A" ? "Pareja 1 · Lado A" : "Pareja 2 · Lado B";
}

function placeInSlots(
  slots: DueloCourtSlot[],
  entry: OpenRegistrationPublicEntry,
  prefer: DueloCourtSide | null
): boolean {
  const order: number[] =
    prefer === "A"
      ? [0, 1, 2, 3]
      : prefer === "B"
        ? [2, 3, 0, 1]
        : [0, 1, 2, 3];
  for (const i of order) {
    if (!slots[i]) {
      slots[i] = entry;
      return true;
    }
  }
  return false;
}

/**
 * Entradas confirmadas → lados de cancha.
 * Respeta preferred_side (A→Pareja 1, B→Pareja 2); sin preferencia, primer hueco.
 * Misma idea que `_open_reg_sync_duelo_slots`.
 */
export function buildDueloCourtLayout(
  confirmed: OpenRegistrationPublicEntry[]
): DueloCourtLayout {
  const slots: DueloCourtSlot[] = [null, null, null, null];
  const list = confirmed.slice(0, 4);
  const placed = new Set<string>();

  for (const entry of list) {
    const pref =
      entry.preferred_side === "A" || entry.preferred_side === "B"
        ? entry.preferred_side
        : null;
    if (!pref) continue;
    if (placeInSlots(slots, entry, pref)) placed.add(entry.id);
  }
  for (const entry of list) {
    if (placed.has(entry.id)) continue;
    placeInSlots(slots, entry, null);
  }

  return {
    parejaA: [slots[0], slots[1]],
    parejaB: [slots[2], slots[3]],
  };
}

export function dueloSideHasOpenSlot(
  layout: DueloCourtLayout,
  side: DueloCourtSide
): boolean {
  const pair = side === "A" ? layout.parejaA : layout.parejaB;
  return pair.some((s) => !s);
}

export function dueloSlotMeta(
  layout: DueloCourtLayout,
  side: DueloCourtSide,
  index: 0 | 1
): DueloSlotMeta {
  const pair = side === "A" ? layout.parejaA : layout.parejaB;
  const partner = pair[index === 0 ? 1 : 0];
  return {
    side,
    sideLabel: sideLabel(side),
    positionLabel: index === 0 ? "Jugador 1" : "Jugador 2",
    partnerName: partner?.nombre?.trim() || null,
  };
}

export function formatPublicCategoriaLabel(
  raw: string | null | undefined
): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const key = t.toLowerCase().replace(/\s+/g, "_");
  const map: Record<string, string> = {
    open: "Open",
    "1ra_fuerza": "1ra Fuerza",
    "2da_fuerza": "2da Fuerza",
    "3ra_fuerza": "3ra Fuerza",
    "4ta_fuerza": "4ta Fuerza",
    "5ta_fuerza": "5ta Fuerza",
    "6ta_fuerza": "6ta Fuerza",
  };
  return map[key] ?? t.replace(/_/g, " ");
}

/** Etiqueta para cancelar: nombre + lado. */
export function dueloCancelContextLabel(
  entryId: string,
  layout: DueloCourtLayout
): string | null {
  const checks: Array<{ slot: DueloCourtSlot; label: string }> = [
    { slot: layout.parejaA[0], label: sideLabel("A") },
    { slot: layout.parejaA[1], label: sideLabel("A") },
    { slot: layout.parejaB[0], label: sideLabel("B") },
    { slot: layout.parejaB[1], label: sideLabel("B") },
  ];
  for (const c of checks) {
    if (c.slot?.id === entryId) {
      return `${c.slot.nombre} · ${c.label}`;
    }
  }
  return null;
}
