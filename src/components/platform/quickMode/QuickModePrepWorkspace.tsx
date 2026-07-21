import React from "react";

export type QuickModePrepWorkspaceProps = {
  header: React.ReactNode;
  stepper: React.ReactNode;
  workbench: React.ReactNode;
  sidebar: React.ReactNode;
  stickyCta?: React.ReactNode;
  className?: string;
};

/**
 * Shell de preparación: main (~66%) + sidebar sticky (~34%) en desktop;
 * stack + CTA sticky en mobile.
 */
export function QuickModePrepWorkspace({
  header,
  stepper,
  workbench,
  sidebar,
  stickyCta,
  className = "",
}: QuickModePrepWorkspaceProps) {
  return (
    <div className={`qm-ws ${className}`.trim()}>
      {header}
      <div className="qm-ws__body">
        {/* Contenedores oscuros sobre pagina clara: los tokens de fondo y texto
            se re-resuelven a la escala chrome dentro de .ro-surface-dark, asi que
            stepper, workbench y sidebar salen negros con letra blanca sin tocar
            cada componente. El header y la pagina quedan claros. */}
        <div className="qm-ws__main ro-surface-dark">
          {stepper}
          <section className="qm-ws__workbench">{workbench}</section>
        </div>
        <aside className="qm-ws__sidebar ro-surface-dark">{sidebar}</aside>
      </div>
      {stickyCta ? (
        <div className="qm-ws__sticky-cta">{stickyCta}</div>
      ) : null}
    </div>
  );
}
