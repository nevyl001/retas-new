import type { ClubOrganizerBinding } from "./types";

/**
 * ═══════════════════════════════════════════════════════════════════
 * Bindings organizador ↔ club (config frontend; futuro: panel admin).
 *
 * Para añadir un club con upgrade premium:
 *   1. Crear manifiesto en src/club-experience/manifests/<branding-key>.ts
 *   2. Registrar en manifestRegistry.ts
 *   3. Añadir binding aquí con premiumBrandingEnabled: true
 *
 * Solo UUID — nunca email en componentes.
 * ═══════════════════════════════════════════════════════════════════
 *
 * Hack Pádel (cuenta de prueba, upgrade premium):
 *   Nombre visible: Hackpadel
 *   Email (referencia humana): aaronduran2020@gmail.com
 */

const HACK_PADEL_ORGANIZADOR_ID = (
  process.env.REACT_APP_HACK_PADEL_ORGANIZADOR_ID?.trim() ||
  "e724de97-3552-4a01-a269-f621e6f1ed26"
).toLowerCase();

export const ORGANIZADOR_CLUB_BINDINGS: readonly ClubOrganizerBinding[] = [
  {
    organizadorId: HACK_PADEL_ORGANIZADOR_ID,
    brandingKey: "hack-padel",
    active: true,
    premiumBrandingEnabled: true,
  },
];

/** @deprecated Usar ORGANIZADOR_CLUB_BINDINGS */
export const ORGANIZADOR_CLUB_INDEX: Readonly<
  Record<string, ClubOrganizerBinding["brandingKey"]>
> = Object.fromEntries(
  ORGANIZADOR_CLUB_BINDINGS.map((binding) => [
    binding.organizadorId.trim().toLowerCase(),
    binding.brandingKey,
  ])
);

/** @deprecated Usar ORGANIZADOR_CLUB_BINDINGS */
export const ORGANIZADOR_BRAND_INDEX = ORGANIZADOR_CLUB_INDEX;
