import React from "react";

export type QuickModeConvocatoriaGateProps = {
  open: boolean;
  onToggle: () => void;
  /** Cuando ya hay convocatoria live, no se muestra el interruptor. */
  live?: boolean;
  panelId?: string;
  titleOn?: string;
  titleOff?: string;
  hintOn?: string;
  hintOff?: string;
  children?: React.ReactNode;
};

/**
 * Interruptor compartido (prep Quick Mode): datos primero;
 * al activar, revela el panel de convocatoria.
 */
export function QuickModeConvocatoriaGate({
  open,
  onToggle,
  live = false,
  panelId = "qm-convocatoria-panel",
  titleOn = "Lanzar convocatoria",
  titleOff = "Lanzar convocatoria",
  hintOn = "Configura cupo y comparte por WhatsApp",
  hintOff = "Opcional · Inscripciones con enlace público",
  children,
}: QuickModeConvocatoriaGateProps) {
  const showPanel = open || live;

  return (
    <div
      className={`qm-ws__details-conv${showPanel ? " is-open" : " is-closed"}`}
    >
      {!live ? (
        <button
          type="button"
          className={`qm-ws__conv-gate${open ? " is-on" : ""}`}
          aria-pressed={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className="qm-ws__conv-gate-switch" aria-hidden>
            <span className="qm-ws__conv-gate-knob" />
          </span>
          <span className="qm-ws__conv-gate-copy">
            <span className="qm-ws__conv-gate-title">
              {open ? titleOn : titleOff}
            </span>
            <span className="qm-ws__conv-gate-hint">
              {open ? hintOn : hintOff}
            </span>
          </span>
        </button>
      ) : null}

      {showPanel ? <div id={panelId}>{children}</div> : null}
    </div>
  );
}
