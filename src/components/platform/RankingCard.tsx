import React from "react";

interface RankingCardProps {
  title: string;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const RankingCard: React.FC<RankingCardProps> = ({
  title,
  headerExtra,
  children,
  className = "",
}) => (
  <section className={`rv-card rv-ranking-card ${className}`.trim()}>
    <div className="rv-ranking-card__header">
      <h2 className="rv-ranking-card__title">{title}</h2>
      {headerExtra}
    </div>
    {children}
  </section>
);
