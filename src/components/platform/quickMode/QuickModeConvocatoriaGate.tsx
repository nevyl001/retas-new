import React from "react";

export type QuickModeConvocatoriaGateProps = {
  open: boolean;
  onToggle: () => void;
  /**
   * Convocatoria ya publicada en servidor.
   * No oculta el interruptor: el usuario puede cerrar el panel y volver a abrirlo.
   */
  live?: boolean;
  panelId?: string;
  titleOn?: string;
  titleOff?: string;
  hintOn?: string;
  hintOff?: string;
  hintLive?: string;
  /** Cuando la convocatoria está live pero el panel está cerrado. */
  hintLiveClosed?: string;
  children?: React.ReactNode;
};

/**
 * Interruptor compartido (prep Quick Mode): datos primero;
 * al activar, revela el panel de convocatoria. Siempre se puede desactivar
 * para ocultar el panel otra vez.
 */
export function QuickModeConvocatoriaGate({
  open,
  onToggle,
  live = false,
  panelId = "qm-convocatoria-panel",
  titleOn = "Ocultar convocatoria",
  titleOff = "Lanzar convocatoria",
  hintOn = "Pulsa para cerrar este panel",
  hintOff = "Opcional · Inscripciones con enlace público",
  hintLive = "Convocatoria activa · pulsa para ocultar el panel",
  hintLiveClosed = "Convocatoria activa · pulsa para ver el panel",
  children,
}: QuickModeConvocatoriaGateProps) {
  return (
    <div
      className={`qm-ws__details-conv${open ? " is-open" : " is-closed"}${
        live ? " is-live" : ""
      }`}
    >
      <button
        type="button"
        className={`qm-ws__conv-gate${open ? " is-on" : ""}`}
        aria-pressed={open}
        aria-controls={panelId}
        aria-expanded={open}
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
            {open
              ? live
                ? hintLive
                : hintOn
              : live
                ? hintLiveClosed
                : hintOff}
          </span>
        </span>
      </button>

      {open ? <div id={panelId}>{children}</div> : null}
    </div>
  );
}
