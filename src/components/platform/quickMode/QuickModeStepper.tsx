import React from "react";

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

/** Navegación de flujo de preparación (no tabs genéricas). */
export function QuickModeStepper({
  steps,
  activeId,
  onChange,
  className = "",
}: QuickModeStepperProps) {
  return (
    <nav
      className={`qm-stepper ${className}`.trim()}
      aria-label="Progreso de preparación"
    >
      <ol className="qm-stepper__list">
        {steps.map((step, index) => {
          const active = step.id === activeId;
          return (
            <li key={step.id} className="qm-stepper__item">
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
                  {index + 1}
                </span>
                <span className="qm-stepper__copy">
                  <span className="qm-stepper__label">{step.label}</span>
                  {step.count != null ? (
                    <span className="qm-stepper__count">{step.count}</span>
                  ) : null}
                </span>
                <span className="qm-stepper__state">
                  {step.status === "complete"
                    ? "Listo"
                    : active
                      ? "Activo"
                      : "Pendiente"}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
