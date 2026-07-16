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

/**
 * Entradas confirmadas en orden de inscripción → lados de cancha.
 * Misma regla que `_open_reg_sync_duelo_slots`: 1-2 Pareja A, 3-4 Pareja B.
 */
export function buildDueloCourtLayout(
  confirmed: OpenRegistrationPublicEntry[]
): DueloCourtLayout {
  const slots: DueloCourtSlot[] = [null, null, null, null];
  confirmed.slice(0, 4).forEach((entry, i) => {
    slots[i] = entry;
  });
  return {
    parejaA: [slots[0], slots[1]],
    parejaB: [slots[2], slots[3]],
  };
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
    sideLabel: side === "A" ? "Pareja 1 · Lado A" : "Pareja 2 · Lado B",
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
    { slot: layout.parejaA[0], label: "Pareja 1 · Lado A" },
    { slot: layout.parejaA[1], label: "Pareja 1 · Lado A" },
    { slot: layout.parejaB[0], label: "Pareja 2 · Lado B" },
    { slot: layout.parejaB[1], label: "Pareja 2 · Lado B" },
  ];
  for (const c of checks) {
    if (c.slot?.id === entryId) {
      return `${c.slot.nombre} · ${c.label}`;
    }
  }
  return null;
}
