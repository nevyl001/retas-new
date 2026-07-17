import React from "react";

export type QuickModeHeroStat = {
  label: string;
  value: React.ReactNode;
};

export type QuickModeHeroProps = {
  eyebrow?: string | null;
  title: string;
  subtitle?: string | null;
  statusLabel?: string | null;
  stats?: QuickModeHeroStat[];
  className?: string;
};

/**
 * Hero limpio para preparación de modos rápidos (RR / Americano / Equipos / Duelo).
 * Sin cajas pesadas: tipografía + métricas en línea.
 */
export function QuickModeHero({
  eyebrow,
  title,
  subtitle,
  statusLabel,
  stats = [],
  className = "",
}: QuickModeHeroProps) {
  return (
    <header className={`qm-hero ${className}`.trim()}>
      {eyebrow ? <p className="qm-hero__eyebrow">{eyebrow}</p> : null}
      <div className="qm-hero__title-row">
        <h1 className="qm-hero__title">{title}</h1>
        {statusLabel ? (
          <span className="qm-hero__status">{statusLabel}</span>
        ) : null}
      </div>
      {subtitle ? <p className="qm-hero__subtitle">{subtitle}</p> : null}
      {stats.length > 0 ? (
        <ul className="qm-hero__stats" aria-label="Resumen del evento">
          {stats.map((s) => (
            <li key={s.label} className="qm-hero__stat">
              <span className="qm-hero__stat-label">{s.label}</span>
              <span className="qm-hero__stat-value">{s.value}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </header>
  );
}
