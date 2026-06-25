import React from "react";
import {
  buildPrivacidadTerminosPath,
  PRIVACIDAD_TERMINOS_PATH,
} from "../../lib/legalNav";
import { navigateAppTo } from "../../lib/appRouting";
import "./app-site-footer.css";

interface AppSiteFooterProps {
  variant?: "dark" | "light";
  className?: string;
}

export const AppSiteFooter: React.FC<AppSiteFooterProps> = ({
  variant = "dark",
  className,
}) => {
  const onLegalPage =
    typeof window !== "undefined" &&
    window.location.pathname.replace(/\/+$/, "") === PRIVACIDAD_TERMINOS_PATH;

  return (
    <footer
      className={[
        "app-site-foot",
        variant === "light" ? "app-site-foot--light" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {!onLegalPage ? (
        <button
          type="button"
          className="app-site-foot__link"
          onClick={() => navigateAppTo(buildPrivacidadTerminosPath())}
        >
          Aviso de Privacidad y Términos y Condiciones
        </button>
      ) : null}
      <p className="app-site-foot__brand">Riviera Open · Organiza. Juega. Compite.</p>
    </footer>
  );
};
