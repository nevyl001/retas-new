import React, { useEffect } from "react";
import { PagosFooter } from "./components/PagosFooter";
import { PagosHeader } from "./components/PagosHeader";
import { PagosLandingPage } from "./pages/PagosLandingPage";
import { applyPagosDocumentMeta } from "./seo/applyDocumentMeta";
import { buildPagosMeta } from "./seo/documentMeta";
import { pagosHomePath } from "./utils/routes";
import "./pagos.css";

const FONT_ID = "pagos-fonts";

export const PagosApp: React.FC = () => {
  const homeHref = pagosHomePath(window.location.hostname);

  useEffect(() => {
    document.documentElement.classList.add("pagos-surface");
    ensureFonts();
    return () => {
      document.documentElement.classList.remove("pagos-surface");
    };
  }, []);

  useEffect(() => {
    return applyPagosDocumentMeta(buildPagosMeta());
  }, []);

  return (
    <div className="pagos-root">
      <a className="pagos-skip" href="#pagos-main">
        Saltar al contenido
      </a>
      <PagosHeader homeHref={homeHref} />
      <main id="pagos-main">
        <PagosLandingPage />
      </main>
      <PagosFooter />
    </div>
  );
};

function ensureFonts(): void {
  if (document.getElementById(FONT_ID)) return;
  const link = document.createElement("link");
  link.id = FONT_ID;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Manrope:wght@400;500;600;700&display=swap";
  document.head.appendChild(link);
}
