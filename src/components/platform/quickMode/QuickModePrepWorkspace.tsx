import React from "react";

export type QuickModePrepWorkspaceProps = {
  header: React.ReactNode;
  /** Panel opcional entre cabecera y body (p. ej. editar detalles inline). */
  details?: React.ReactNode;
  stepper?: React.ReactNode | null;
  workbench?: React.ReactNode | null;
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
  details,
  stepper = null,
  workbench = null,
  sidebar,
  stickyCta,
  className = "",
}: QuickModePrepWorkspaceProps) {
  const hasMain = Boolean(stepper) || Boolean(workbench);
  return (
    <div className={`qm-ws ${className}`.trim()}>
      {header}
      {details ? (
        <div className="qm-ws__details">{details}</div>
      ) : null}
      <div className="qm-ws__body">
        {hasMain ? (
          <div className="qm-ws__main">
            {stepper}
            {workbench ? (
              <section className="qm-ws__workbench">{workbench}</section>
            ) : null}
          </div>
        ) : null}
        <aside className="qm-ws__sidebar">{sidebar}</aside>
      </div>
      {stickyCta ? (
        <div className="qm-ws__sticky-cta">{stickyCta}</div>
      ) : null}
    </div>
  );
}
