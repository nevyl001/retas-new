import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { TablerIcon } from "../ui/TablerIcon";
import "./te-action-menu.css";

export type TeActionMenuItem = {
  id: string;
  label: string;
  /** Acción en botón. Se ignora si hay `href`. */
  onSelect?: () => void;
  /** Enlace (abre en pestaña nueva con `external`). */
  href?: string;
  external?: boolean;
  danger?: boolean;
  disabled?: boolean;
  /** Línea divisoria antes de este ítem. */
  separatorBefore?: boolean;
};

type TeActionMenuProps = {
  /** Nombre accesible del botón disparador. */
  label: string;
  items: ReadonlyArray<TeActionMenuItem>;
  disabled?: boolean;
  className?: string;
  /** Texto visible en el disparador (con flecha). Sin él, solo icono «⋯». */
  triggerLabel?: string;
  /** Lado del disparador con el que se alinea el panel. */
  align?: "start" | "end";
};

/**
 * Menú de acciones «⋯» (patrón WAI-ARIA menu button).
 * Teclado: Enter/Espacio/↓ abre y enfoca el primero, ↑ abre y enfoca el último;
 * dentro: ↑ ↓ Inicio Fin, Esc cierra y devuelve el foco, Tab cierra.
 * Se cierra al tocar fuera. Se abre hacia arriba si no cabe debajo.
 */
export const TeActionMenu: React.FC<TeActionMenuProps> = ({
  label,
  items,
  disabled = false,
  className = "",
  triggerLabel,
  align = "end",
}) => {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"down" | "up">("down");
  const [focusOn, setFocusOn] = useState<"first" | "last">("first");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  const baseId = useId();
  const menuId = `${baseId}-menu`;
  const triggerId = `${baseId}-trigger`;

  const enabledItems = useCallback((): HTMLElement[] => {
    const panel = panelRef.current;
    if (!panel) return [];
    return Array.from(
      panel.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')
    );
  }, []);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Posición (abajo / arriba) y foco inicial al abrir.
  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    if (panel && trigger) {
      const triggerRect = trigger.getBoundingClientRect();
      const needed = panel.offsetHeight + 8;
      const below = window.innerHeight - triggerRect.bottom;
      const above = triggerRect.top;
      setPlacement(below < needed && above > below ? "up" : "down");
    }
    const list = enabledItems();
    (focusOn === "last" ? list[list.length - 1] : list[0])?.focus();
  }, [open, focusOn, enabledItems]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: Event) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setFocusOn(event.key === "ArrowUp" ? "last" : "first");
      setOpen(true);
    }
  };

  const onPanelKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    const list = enabledItems();
    const index = list.indexOf(document.activeElement as HTMLElement);
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        list[(index + 1) % list.length]?.focus();
        break;
      case "ArrowUp":
        event.preventDefault();
        list[(index - 1 + list.length) % list.length]?.focus();
        break;
      case "Home":
        event.preventDefault();
        list[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        list[list.length - 1]?.focus();
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={rootRef}
      className={["te-action-menu", open ? "te-action-menu--open" : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={`te-action-menu__trigger${
          triggerLabel ? " te-action-menu__trigger--labelled" : ""
        }`}
        // Con texto visible, el nombre accesible es ese texto (etiqueta en el nombre).
        aria-label={triggerLabel ? undefined : label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => {
          setFocusOn("first");
          setOpen((value) => !value);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        {triggerLabel ? (
          <>
            <span>{triggerLabel}</span>
            <TablerIcon name="chevron-down" size={16} />
          </>
        ) : (
          <TablerIcon name="dots" size={18} />
        )}
      </button>

      {open ? (
        <ul
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-labelledby={triggerId}
          className={`te-action-menu__panel te-action-menu__panel--${placement} te-action-menu__panel--${align}`}
          onKeyDown={onPanelKeyDown}
        >
          {items.map((item) => {
            const itemClass = [
              "te-action-menu__item",
              item.danger ? "te-action-menu__item--danger" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <React.Fragment key={item.id}>
                {item.separatorBefore ? (
                  <li role="separator" className="te-action-menu__sep" />
                ) : null}
                <li role="none">
                  {item.href && !item.disabled ? (
                    <a
                      role="menuitem"
                      tabIndex={-1}
                      className={itemClass}
                      href={item.href}
                      target={item.external ? "_blank" : undefined}
                      rel={item.external ? "noopener noreferrer" : undefined}
                      onClick={() => setOpen(false)}
                    >
                      {item.label}
                    </a>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      tabIndex={-1}
                      className={itemClass}
                      aria-disabled={item.disabled || undefined}
                      onClick={() => {
                        if (item.disabled) return;
                        setOpen(false);
                        item.onSelect?.();
                      }}
                    >
                      {item.label}
                    </button>
                  )}
                </li>
              </React.Fragment>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
};
