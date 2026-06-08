import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";

export type ModalSize = "sm" | "md" | "lg" | "full";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: ModalSize;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  overlayClassName?: string;
  bodyClassName?: string;
  /** Si true, overlay alineado abajo (sheet móvil) */
  sheet?: boolean;
  /** Ocultar botón cerrar del header */
  hideClose?: boolean;
  ariaLabelledBy?: string;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  size = "md",
  children,
  footer,
  className = "",
  overlayClassName = "",
  bodyClassName = "",
  sheet = false,
  hideClose = false,
  ariaLabelledBy,
}) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const labelledBy = ariaLabelledBy ?? (title ? titleId : undefined);

  return createPortal(
    <div
      className={[
        "riviera-modal-overlay",
        sheet && "riviera-modal-overlay--sheet",
        overlayClassName,
      ]
        .filter(Boolean)
        .join(" ")}
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={[
          "riviera-modal",
          `riviera-modal--${size}`,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={(e) => e.stopPropagation()}
      >
        {title ? (
          <header className="riviera-modal__header">
            <h2 id={titleId} className="riviera-modal__title">
              {title}
            </h2>
            {!hideClose ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="riviera-modal__close"
                onClick={onClose}
                aria-label="Cerrar"
              >
                ✕
              </Button>
            ) : null}
          </header>
        ) : null}

        <div className={["riviera-modal__body", bodyClassName].filter(Boolean).join(" ")}>
          {children}
        </div>

        {footer ? <footer className="riviera-modal__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body
  );
};
