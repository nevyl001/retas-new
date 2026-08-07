/**
 * Expectativas del seed LOCAL PCS (solo tests / documentación de fixture).
 *
 * NO es configuración runtime. NO decide permisos en el frontend.
 * La fuente de verdad operativa de modos/branding de cuenta es siempre
 * `public.organizador_game_modes` (vía fetchOrganizadorAccountSettings).
 *
 * Este objeto solo describe qué debe quedar escrito en BD tras
 * `supabase/seeds/pcs-organizador.sql` / `./scripts/seed-pcs-local.sh`.
 */
import type { OrganizadorGameModesInput } from "../lib/admin/organizadorGameModes";

export const PCS_EXPECTED_LOCAL_SEED_ORGANIZADOR_ID =
  "35e31ab8-2a2f-4526-9e84-e130c85f8ca9" as const;

export const PCS_EXPECTED_LOCAL_SEED_EMAIL =
  "padelcourtseries@gmail.com" as const;

/** Flags esperados en OGM tras el seed local (= config prod PCS). */
export const PCS_EXPECTED_LOCAL_SEED_CONFIG: OrganizadorGameModesInput = {
  reta_equipos: false,
  round_robin: false,
  americano: false,
  mini_torneo: true,
  liga: false,
  duelo_2v2: false,
  permite_ajuste_puntos_manuales: true,
  visible_ranking_oficial: false,
  premium_branding_enabled: true,
  branding_key: "padel-court-series",
};
