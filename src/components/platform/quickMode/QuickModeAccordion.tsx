import React, {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
} from "react";

type AccordionCtx = {
  openId: string | null;
  setOpenId: (id: string | null) => void;
};

const QuickModeAccordionContext = createContext<AccordionCtx | null>(null);

export type QuickModeAccordionProps = {
  children: React.ReactNode;
  /** Sección abierta por defecto (id de item). */
  defaultOpenId?: string | null;
  className?: string;
};

/** Acordeón exclusivo: una sección abierta a la vez. */
export function QuickModeAccordion({
  children,
  defaultOpenId = null,
  className = "",
}: QuickModeAccordionProps) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId);
  const value = useMemo(() => ({ openId, setOpenId }), [openId]);
  return (
    <QuickModeAccordionContext.Provider value={value}>
      <div className={`qm-accordion ${className}`.trim()} role="list">
        {children}
      </div>
    </QuickModeAccordionContext.Provider>
  );
}

export type QuickModeAccordionItemProps = {
  id: string;
  title: string;
  subtitle?: string | null;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function QuickModeAccordionItem({
  id,
  title,
  subtitle,
  meta,
  children,
  className = "",
}: QuickModeAccordionItemProps) {
  const ctx = useContext(QuickModeAccordionContext);
  if (!ctx) {
    throw new Error("QuickModeAccordionItem must be inside QuickModeAccordion");
  }
  const panelId = useId();
  const open = ctx.openId === id;
  const toggle = useCallback(() => {
    ctx.setOpenId(open ? null : id);
  }, [ctx, id, open]);

  return (
    <section
      className={`qm-accordion__item ${open ? "is-open" : ""} ${className}`.trim()}
      role="listitem"
    >
      <button
        type="button"
        className="qm-accordion__trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
      >
        <span className="qm-accordion__chevron" aria-hidden />
        <span className="qm-accordion__titles">
          <span className="qm-accordion__title">{title}</span>
          {subtitle ? (
            <span className="qm-accordion__subtitle">{subtitle}</span>
          ) : null}
        </span>
        {meta ? <span className="qm-accordion__meta">{meta}</span> : null}
      </button>
      {open ? (
        <div id={panelId} className="qm-accordion__panel" role="region">
          {children}
        </div>
      ) : null}
    </section>
  );
}
