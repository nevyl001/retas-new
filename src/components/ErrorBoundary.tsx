import React, { Component, ErrorInfo, ReactNode } from "react";
import "./ErrorBoundary.css";

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (process.env.NODE_ENV !== "production") {
      console.error("[ErrorBoundary]", error, errorInfo);
    }

    // TODO: enviar a Sentry/servicio de monitoreo aquí

    this.props.onError?.(error, errorInfo);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  private handleGoHome = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/";
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary__card">
            <span className="error-boundary__icon" aria-hidden>
              ⚠️
            </span>
            <h1 className="error-boundary__title">Algo salió mal</h1>
            <p className="error-boundary__message">
              Ocurrió un error inesperado al mostrar esta sección. Puedes
              reintentar o volver al inicio de la aplicación.
            </p>
            {process.env.NODE_ENV !== "production" && this.state.error ? (
              <pre className="error-boundary__details">
                {this.state.error.message}
              </pre>
            ) : null}
            <div className="error-boundary__actions">
              <button
                type="button"
                className="error-boundary__btn error-boundary__btn--primary"
                onClick={this.handleRetry}
              >
                Reintentar
              </button>
              <button
                type="button"
                className="error-boundary__btn error-boundary__btn--secondary"
                onClick={this.handleGoHome}
              >
                Volver al inicio
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
