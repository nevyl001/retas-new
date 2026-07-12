import React from "react";

export type ModeSectionTabItem = {
  id: string;
  label: string;
};

export const ModeSectionTabs: React.FC<{
  tabs: ModeSectionTabItem[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel: string;
  className?: string;
}> = ({ tabs, activeId, onChange, ariaLabel, className = "" }) => (
  <div
    className={["mode-section-tabs", className].filter(Boolean).join(" ")}
    role="tablist"
    aria-label={ariaLabel}
  >
    {tabs.map((tab) => {
      const selected = activeId === tab.id;
      return (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`mode-tab-${tab.id}`}
          className={[
            "mode-section-tabs__btn",
            selected ? "mode-section-tabs__btn--active" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-selected={selected}
          aria-controls={`mode-panel-${tab.id}`}
          tabIndex={selected ? 0 : -1}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      );
    })}
  </div>
);
