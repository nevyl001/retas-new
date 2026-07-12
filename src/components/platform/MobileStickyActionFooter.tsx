import React from "react";

export const MobileStickyActionFooter: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = "" }) => (
  <footer
    className={["mobile-sticky-action-footer", className].filter(Boolean).join(" ")}
    aria-label="Acción principal"
  >
    <div className="mobile-sticky-action-footer__inner">{children}</div>
  </footer>
);
