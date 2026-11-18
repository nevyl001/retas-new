import React from "react";
import { TablerIcon } from "../../ui/TablerIcon";

interface DashboardActionCardProps {
  title: string;
  description?: string;
  icon: string;
  disabled?: boolean;
  badge?: string;
  onClick: () => void;
  className?: string;
}

export const DashboardActionCard: React.FC<DashboardActionCardProps> = ({
  title,
  description,
  icon,
  disabled = false,
  badge,
  onClick,
  className = "",
}) => (
  <button
    type="button"
    className={`ops-card${description ? "" : " ops-card--compact"} ${className}`.trim()}
    onClick={onClick}
    aria-disabled={disabled || undefined}
  >
    <span className="ops-card__icon" aria-hidden>
      <TablerIcon name={icon} size={22} />
    </span>
    <span className="ops-card__copy">
      <span className="ops-card__title">{title}</span>
      {description ? <span className="ops-card__desc">{description}</span> : null}
    </span>
    {badge ? <span className="ops-card__badge">{badge}</span> : null}
    <TablerIcon name="chevron-right" size={18} className="ops-card__go" />
  </button>
);
