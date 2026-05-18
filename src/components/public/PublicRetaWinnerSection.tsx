import React from "react";

export const PublicRetaWinnerSection: React.FC<{
  title: string;
  subtitle?: string;
  stats?: { value: string | number; label: string }[];
}> = ({ title, subtitle, stats }) => (
  <section className="te-public-section te-public-winner te-pub-fade-in" aria-label="Ganadores">
    <div className="te-public-winner__hero">
      <span className="te-public-winner__trophy" aria-hidden>
        🏆
      </span>
      <p className="te-public-winner__label">Ganadores</p>
      <p className="te-public-winner__name">{title}</p>
      {subtitle && <p className="te-public-winner__sub">{subtitle}</p>}
    </div>
    {stats && stats.length > 0 && (
      <div className="te-public-winner__stats">
        {stats.map((s) => (
          <div key={s.label} className="te-public-winner__stat">
            <span className="te-public-winner__stat-num">{s.value}</span>
            <span className="te-public-winner__stat-label">{s.label}</span>
          </div>
        ))}
      </div>
    )}
  </section>
);
