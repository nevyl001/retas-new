/**
 * Sprint 2.0.2A — Riviera ID Engine integration.
 * Opt-in: sin REACT_APP_RIVIERA_CAREER_IDENTITY=true la app no invoca ensure al crear jugador.
 */
export const RIVIERA_IDENTITY_ENSURE_ENABLED =
  process.env.REACT_APP_RIVIERA_CAREER_IDENTITY === "true";
