import React from "react";

export type BadgeVariant =
  | "mode-equipos"
  | "mode-robin"
  | "mode-americano"
  | "mode-torneo"
  | "active"
  | "finished"
  | "pending"
  | "live"
  | "scheduled"
  | "win"
  | "loss"
  | "draw";

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant,
  children,
  className = "",
}) => (
  <span className={`riviera-badge riviera-badge--${variant} ${className}`.trim()}>
    {children}
  </span>
);
