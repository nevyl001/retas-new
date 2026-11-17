import "@tabler/icons-webfont/dist/tabler-icons.min.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { bootstrapAppBranding } from "./branding/bootstrapAppBranding";
import "./index.css";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installPopStateGate } from "./lib/appRouting";
import { installHistoryIndexTracking } from "./lib/historyIndex";
import { shouldBootPagos } from "./pagos/shouldBootPagos";

const pagosSurface = shouldBootPagos({
  hostname: window.location.hostname,
  pathname: window.location.pathname,
});

if (pagosSurface) {
  document.documentElement.classList.add("pagos-surface");
  document.documentElement.classList.remove("branding-bootstrapping");
  document.documentElement.style.backgroundColor = "#0D0F12";
  if (document.body) {
    document.body.style.backgroundColor = "#0D0F12";
    document.body.style.color = "#FFFFFF";
  }
} else {
  // Numera las entradas del historial antes de que cualquier módulo use pushState/replaceState.
  installHistoryIndexTracking();
  // Puerta única de `popstate`: debe registrarse ANTES que cualquier listener de navegación
  // de la app (se ejecutan en orden de registro) para que las guardas lleguen primero.
  installPopStateGate();
}

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

function renderApp(): void {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}

function logUnexpectedBootstrapFailure(error: unknown): void {
  console.error(
    "[bootstrap] fallo inesperado no capturado internamente:",
    error instanceof Error ? error.message : error
  );
}

if (pagosSurface) {
  void import("./pagos/bootPagos")
    .then((module) => {
      module.bootPagos(root);
    })
    .catch(logUnexpectedBootstrapFailure);
} else {
  // bootstrapAppBranding() ya no rechaza (aplica branding por defecto y marca
  // isBrandingBootstrapDegraded() internamente ante cualquier fallo). El
  // try/catch + .catch() de abajo son defensa adicional: si algo imprevisto se
  // escapara (incluso de forma sincrónica, antes de devolver una promesa),
  // renderApp() se ejecuta de todas formas — nunca pantalla blanca.
  try {
    Promise.resolve(bootstrapAppBranding())
      .catch(logUnexpectedBootstrapFailure)
      .finally(renderApp);
  } catch (error) {
    logUnexpectedBootstrapFailure(error);
    renderApp();
  }
}
