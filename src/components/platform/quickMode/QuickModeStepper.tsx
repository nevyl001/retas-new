import React, { useEffect, useRef } from "react";

export type QuickModeStepStatus = "complete" | "active" | "pending";

export type QuickModeStep = {
  id: string;
  label: string;
  count?: React.ReactNode;
  status: QuickModeStepStatus;
};

export type QuickModeStepperProps = {
  steps: QuickModeStep[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
};

/** Navegación de flujo de preparación (no tabs genéricas). Mobile-first. */
export function QuickModeStepper({
  steps,
  activeId,
  onChange,
  className = "",
}: QuickModeStepperProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const el = activeRef.current;
    if (!el) return;
    el.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [activeId]);

  return (
    <nav
      className={`qm-stepper ${className}`.trim()}
      aria-label="Progreso de preparación"
    >
      <ol ref={listRef} className="qm-stepper__list">
        {steps.map((step, index) => {
          const active = step.id === activeId;
          const statusLabel =
            step.status === "complete"
              ? "Listo"
              : active
                ? "Activo"
                : "Pendiente";
          // Una sola línea secundaria: count (contenido) o status (navegación).
          // Mostrar ambos repetía «Pendiente / Activo» y confundía.
          const detail =
            step.count != null && step.count !== "" ? step.count : statusLabel;

          return (
            <li
              key={step.id}
              ref={active ? activeRef : undefined}
              className="qm-stepper__item"
            >
              <button
                type="button"
                className={[
                  "qm-stepper__btn",
                  active ? "is-active" : "",
                  step.status === "complete" ? "is-complete" : "",
                  step.status === "pending" ? "is-pending" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-current={active ? "step" : undefined}
                onClick={() => onChange(step.id)}
              >
                <span className="qm-stepper__index" aria-hidden>
                  {step.status === "complete" ? "✓" : index + 1}
                </span>
                <span className="qm-stepper__copy">
                  <span className="qm-stepper__label">{step.label}</span>
                  <span className="qm-stepper__count">{detail}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
