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

void bootstrapAppBranding().then(() => {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
});
