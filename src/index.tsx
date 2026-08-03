import "@tabler/icons-webfont/dist/tabler-icons.min.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { bootstrapAppBranding } from "./branding/bootstrapAppBranding";
import "./index.css";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

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
