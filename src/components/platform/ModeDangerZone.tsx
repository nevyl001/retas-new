import React from "react";

/**
 * Contenedor genérico de "zona de peligro" (acciones destructivas
 * separadas del flujo normal). Generaliza el patrón visual de
 * `.reta-danger-zone` (src/components/TournamentStatusContent.tsx,
 * único consumidor real hoy) para que futuras migraciones de Liga,
 * Americano y Duelo 2v2 puedan reutilizarlo sin reimplementarlo.
 *
 * Ver docs/GAME-MODES-UI-ARCHITECTURE.md, secciones 6.4 y 7.10.
 *
 * Fase 1: solo se define aquí. No se usa todavía en ninguna pantalla
 * — cero cambio visual hasta que un modo lo adopte explícitamente.
 */
export const ModeDangerZone: React.FC<{
  title?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ title = "Zona de peligro", hint, children, className = "" }) => (
  <div className={["mode-danger-zone", className].filter(Boolean).join(" ")}>
    <h3 className="mode-danger-zone__title">{title}</h3>
    {hint ? <p className="mode-danger-zone__hint">{hint}</p> : null}
    <div className="mode-danger-zone__actions">{children}</div>
  </div>
);
