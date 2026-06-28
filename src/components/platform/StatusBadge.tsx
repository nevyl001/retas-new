import React from "react";

export type StatusBadgeVariant = "gold" | "muted" | "live" | "pending";

interface StatusBadgeProps {
  variant?: StatusBadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  variant = "muted",
  children,
  className = "",
}) => (
  <span className={`rv-pill rv-pill--${variant} ${className}`.trim()}>{children}</span>
);
