import type { BrandKey } from "./types";

/**
 * ═══════════════════════════════════════════════════════════════════
 * ÚNICO archivo para relacionar una cuenta organizador con su marca.
 *
 * Para añadir un club nuevo:
 *   1. Crear su BrandConfig en src/branding/brands/<branding-key>.ts
 *   2. Registrar la key en src/branding/brandRegistry.ts
 *   3. Añadir UNA línea aquí: "<organizador_uuid>": "<branding-key>"
 *
 * No usar email en componentes ni en CSS — solo UUID de organizador.
 * ═══════════════════════════════════════════════════════════════════
 *
 * Hack Pádel (cuenta de prueba):
 *   Nombre visible: Hackpadel
 *   Email (referencia humana): aaronduran2020@gmail.com
 *
 * Si el UUID cambia tras recrear la cuenta, actualiza solo esta línea.
 * Opcional: REACT_APP_HACK_PADEL_ORGANIZADOR_ID en .env sobreescribe el UUID fijo.
 */

const HACK_PADEL_ORGANIZADOR_ID = (
  process.env.REACT_APP_HACK_PADEL_ORGANIZADOR_ID?.trim() ||
  "e724de97-3552-4a01-a269-f621e6f1ed26"
).toLowerCase();

export const ORGANIZADOR_BRAND_INDEX: Readonly<Record<string, BrandKey>> = {
  [HACK_PADEL_ORGANIZADOR_ID]: "hack-padel",
};
