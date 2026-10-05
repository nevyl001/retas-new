import React, { useEffect, useId, useRef, useState } from "react";
import { Button } from "../ui";

type TeProgramacionMenuProps = {
  onProgramarFaltantes: () => void;
  onReorganizar: () => void;
  onEditarCalendario: () => void;
};

export const TeProgramacionMenu: React.FC<TeProgramacionMenuProps> = ({
  onProgramarFaltantes,
  onReorganizar,
  onEditarCalendario,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div className="te-programacion-menu" ref={rootRef}>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="te-gestion-edit-schedule-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        Editar programación
        <span className="te-programacion-menu__caret" aria-hidden>
          ▾
        </span>
      </Button>
      {open ? (
        <ul className="te-programacion-menu__panel" id={menuId} role="menu">
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="te-programacion-menu__item"
              onClick={() => choose(onProgramarFaltantes)}
            >
              Programar faltantes
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="te-programacion-menu__item"
              onClick={() => choose(onReorganizar)}
            >
              Reorganizar pendientes
            </button>
          </li>
          <li role="separator" className="te-programacion-menu__sep" />
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className="te-programacion-menu__item"
              onClick={() => choose(onEditarCalendario)}
            >
              Editar calendario
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
};
