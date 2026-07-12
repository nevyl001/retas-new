import React from "react";

export const ModeSectionPanel: React.FC<{
  id: string;
  activeId: string;
  labelledBy?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ id, activeId, labelledBy, children, className = "" }) => {
  const isActive = activeId === id;
  return (
    <div
      id={`mode-panel-${id}`}
      role="tabpanel"
      aria-labelledby={labelledBy ?? `mode-tab-${id}`}
      className={[
        "mode-section-panel",
        isActive ? "mode-section-panel--active" : "mode-section-panel--inactive",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      hidden={!isActive}
    >
      {children}
    </div>
  );
};
