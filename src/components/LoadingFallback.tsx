import React from "react";
import "./LoadingFallback.css";

interface LoadingFallbackProps {
  message?: string;
}

export const LoadingFallback: React.FC<LoadingFallbackProps> = ({
  message = "⏳ Cargando…",
}) => (
  <div className="loading-container">
    <div className="loading-spinner">
      <div className="spinner" />
      <p>{message}</p>
    </div>
  </div>
);
