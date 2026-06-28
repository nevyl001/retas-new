import React from "react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = "",
}) => (
  <div className={`rv-empty-state ${className}`.trim()}>
    {icon ? <div className="rv-empty-state__icon">{icon}</div> : null}
    <h3 className="rv-empty-state__title">{title}</h3>
    {description ? <p className="rv-empty-state__desc">{description}</p> : null}
    {action}
  </div>
);
