import React from "react";

interface MatchCardProps {
  children: React.ReactNode;
  className?: string;
  soft?: boolean;
}

/** Shell visual para partidos. No altera lógica de marcadores. */
export const MatchCard: React.FC<MatchCardProps> = ({
  children,
  className = "",
  soft = true,
}) => (
  <article
    className={`rv-card${soft ? " rv-card-soft" : ""} rv-match-card ${className}`.trim()}
  >
    {children}
  </article>
);
