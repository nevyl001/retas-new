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
  titleOn = "Ocultar panel",
  titleOff = "Ver panel",
  hintOn = "Cierra sin cambiar el estado",
  hintOff = "Enlace público y WhatsApp",
  hintLive = "Panel abierto",
  hintLiveClosed = "Activa · enlace y WhatsApp",
  children,
}: QuickModeConvocatoriaGateProps) {
  const title = open ? titleOn : titleOff;
  const hint = open
    ? live
      ? hintLive
      : hintOn
    : live
      ? hintLiveClosed
      : hintOff;

  return (
    <div
      className={`qm-ws__details-conv${open ? " is-open" : " is-closed"}${
        live ? " is-live" : ""
      }`}
    >
      <button
        type="button"
        className={`qm-ws__conv-gate${open ? " is-on" : ""}${
          live ? " is-live" : ""
        }`}
        aria-pressed={open}
        aria-controls={panelId}
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="qm-ws__conv-gate-switch" aria-hidden>
          <span className="qm-ws__conv-gate-knob" />
        </span>
        <span className="qm-ws__conv-gate-copy">
          <span className="qm-ws__conv-gate-title">{title}</span>
          {hint ? (
            <span className="qm-ws__conv-gate-hint">{hint}</span>
          ) : null}
        </span>
        <span className="qm-ws__conv-gate-chevron" aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>

      {open ? <div id={panelId}>{children}</div> : null}
    </div>
  );
}
