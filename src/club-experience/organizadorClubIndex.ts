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
 * Hack Padel (cuenta de prueba, upgrade premium):
 *   Nombre visible: Hackpadel
 *   Email (referencia humana): aaronduran2020@gmail.com
 *
 * Padel Court Series (upgrade premium):
 *   Nombre visible: Padel Court Series
 *   Email (referencia humana): padelcourtseries@gmail.com
 *   Binding SOLO por UUID — nunca por email en componentes.
 *
 * Valvidub Sports (upgrade premium):
 *   Nombre visible: Valvidub Sports
 *   Email (referencia humana): valvidubsportspadel@outlook.com
 *
 * Padelito Warehouse (upgrade premium):
 *   Nombre visible: Padelito Warehouse
 *   UUID (Club Test / cuenta demo): cd45cea7-a8ac-4596-b0ee-24959b4cbb5d
 */

const HACK_PADEL_ORGANIZADOR_ID = (
  process.env.REACT_APP_HACK_PADEL_ORGANIZADOR_ID?.trim() ||
  "e724de97-3552-4a01-a269-f621e6f1ed26"
).toLowerCase();

export const PADEL_COURT_SERIES_ORGANIZADOR_ID = (
  process.env.REACT_APP_PADEL_COURT_SERIES_ORGANIZADOR_ID?.trim() ||
  "35e31ab8-2a2f-4526-9e84-e130c85f8ca9"
).toLowerCase();

export const VALVIDUB_SPORTS_ORGANIZADOR_ID = (
  process.env.REACT_APP_VALVIDUB_SPORTS_ORGANIZADOR_ID?.trim() ||
  "cbc93677-0450-4622-a2fa-2f40947e385b"
).toLowerCase();

export const PADELITO_WAREHOUSE_ORGANIZADOR_ID = (
  process.env.REACT_APP_PADELITO_WAREHOUSE_ORGANIZADOR_ID?.trim() ||
  "cd45cea7-a8ac-4596-b0ee-24959b4cbb5d"
).toLowerCase();

export const ORGANIZADOR_CLUB_BINDINGS: readonly ClubOrganizerBinding[] = [
  {
    organizadorId: HACK_PADEL_ORGANIZADOR_ID,
    brandingKey: "hack-padel",
    active: true,
    premiumBrandingEnabled: true,
  },
  {
    organizadorId: PADEL_COURT_SERIES_ORGANIZADOR_ID,
    brandingKey: "padel-court-series",
    active: true,
    premiumBrandingEnabled: true,
  },
  {
    organizadorId: VALVIDUB_SPORTS_ORGANIZADOR_ID,
    brandingKey: "valvidub-sports",
    active: true,
    premiumBrandingEnabled: true,
  },
  {
    organizadorId: PADELITO_WAREHOUSE_ORGANIZADOR_ID,
    brandingKey: "padelito-warehouse",
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
