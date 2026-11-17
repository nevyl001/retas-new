import React from "react";
import type { Root } from "react-dom/client";
import { PagosApp } from "./PagosApp";

interface BoundaryProps {
  children: React.ReactNode;
}

interface BoundaryState {
  failed: boolean;
}

class PagosBoundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <p role="alert" style={{ color: "#fff", background: "#0D0F12", padding: 24 }}>
          No se pudo cargar la página de pagos.
        </p>
      );
    }
    return this.props.children;
  }
}

export function bootPagos(root: Root): void {
  root.render(
    <React.StrictMode>
      <PagosBoundary>
        <PagosApp />
      </PagosBoundary>
    </React.StrictMode>
  );
}
