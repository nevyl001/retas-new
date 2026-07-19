import React, { useEffect, useId, useRef, useState } from "react";

export type ConvocatoriaMoreMenuItem = {
  id: string;
  label: string;
  disabled?: boolean;
  onSelect: () => void;
};

type Props = {
  items: ConvocatoriaMoreMenuItem[];
  /** Accesible name for the trigger. */
  label?: string;
};

/**
 * Menú presentacional “⋯” para acciones secundarias del panel Convocatoria.
 * No contiene lógica de negocio.
 */
export const ConvocatoriaMoreMenu: React.FC<Props> = ({
  items,
  label = "Más acciones",
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="ra-org__more" ref={rootRef}>
      <button
        type="button"
        className="ra-org__more-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden>⋯</span>
      </button>
      {open ? (
        <ul className="ra-org__more-menu" id={menuId} role="menu">
          {items.map((item) => (
            <li key={item.id} role="none">
              <button
                type="button"
                role="menuitem"
                className="ra-org__more-item"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

export default ConvocatoriaMoreMenu;
