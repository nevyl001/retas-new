import React from "react";
import { TablerIcon } from "../ui/TablerIcon";

export interface LigaJornadaSectionProps {
  id: string;
  title: string;
  open: boolean;
  onToggle?: () => void;
  collapsible?: boolean;
  variant?: "config" | "results";
  children: React.ReactNode;
}

export const LigaJornadaSection: React.FC<LigaJornadaSectionProps> = ({
  id,
  title,
  open,
  onToggle,
  collapsible = true,
  variant = "config",
  children,
}) => {
  const bodyId = `${id}-body`;

  return (
    <section
      className={`liga-jornada-section liga-jornada-section--${variant}${
        open ? " liga-jornada-section--open" : ""
      }`}
    >
      {collapsible ? (
        <button
          type="button"
          id={`${id}-head`}
          className="liga-jornada-section__head"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <span className="liga-jornada-section__title">{title}</span>
          <TablerIcon
            name={open ? "chevron-up" : "chevron-down"}
            size={20}
            aria-hidden={false}
          />
        </button>
      ) : (
        <div
          id={`${id}-head`}
          className="liga-jornada-section__head liga-jornada-section__head--static"
        >
          <span className="liga-jornada-section__title">{title}</span>
        </div>
      )}
      {(!collapsible || open) && (
        <div id={bodyId} className="liga-jornada-section__body" role="region" aria-labelledby={`${id}-head`}>
          {children}
        </div>
      )}
    </section>
  );
};
