import React, { useState } from "react";

interface DebugPanelContentProps {
  status: string;
  pairsCount: number;
  matchesCount: number;
  onTestConnection: () => void;
  onReloadData: () => void;
  onVerifyStatus: () => void;
}

export const DebugPanelContent: React.FC<DebugPanelContentProps> = ({
  status,
  pairsCount,
  matchesCount,
  onTestConnection,
  onReloadData,
  onVerifyStatus,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleAction = async (action: () => void) => {
    setIsLoading(true);
    try {
      await action();
    } finally {
      setTimeout(() => setIsLoading(false), 1000);
    }
  };

  return (
    <div className="debug-container">
      {/* Indicadores de Estado */}
      <div className="debug-indicators">
        <div className="debug-card">
          <div className="debug-card-icon">
            <span className="debug-dot debug-active"></span>
          </div>
          <div className="debug-card-info">
            <span className="debug-label">Estado</span>
            <span className="debug-value">{status}</span>
          </div>
        </div>

        <div className="debug-card">
          <div className="debug-card-icon">
            <span className="debug-dot debug-pairs"></span>
          </div>
          <div className="debug-card-info">
            <span className="debug-label">Parejas</span>
            <span className="debug-value">{pairsCount}</span>
          </div>
        </div>

        <div className="debug-card">
          <div className="debug-card-icon">
            <span className="debug-dot debug-matches"></span>
          </div>
          <div className="debug-card-info">
            <span className="debug-label">Partidos</span>
            <span className="debug-value">{matchesCount}</span>
          </div>
        </div>
      </div>

      {/* Botones de Acción */}
      <div className="debug-actions">
        <button
          className="debug-action-btn debug-connection-btn"
          onClick={() => handleAction(onTestConnection)}
          disabled={isLoading}
        >
          <div className="debug-btn-content">
            <span className="debug-btn-icon">⚡</span>
            <span className="debug-btn-text">Probar Conexión</span>
          </div>
          <div className="debug-btn-bg"></div>
        </button>

        <button
          className="debug-action-btn debug-reload-btn"
          onClick={() => handleAction(onReloadData)}
          disabled={isLoading}
        >
          <div className="debug-btn-content">
            <span className="debug-btn-icon">🔄</span>
            <span className="debug-btn-text">Recargar Datos</span>
          </div>
          <div className="debug-btn-bg"></div>
        </button>

        <button
          className="debug-action-btn debug-verify-btn"
          onClick={() => handleAction(onVerifyStatus)}
          disabled={isLoading}
        >
          <div className="debug-btn-content">
            <span className="debug-btn-icon">🔍</span>
            <span className="debug-btn-text">Verificar Estado</span>
          </div>
          <div className="debug-btn-bg"></div>
        </button>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="debug-loading">
          <div className="debug-spinner"></div>
          <span className="debug-loading-text">Procesando...</span>
        </div>
      )}

      {/* Efectos de Partículas */}
      <div className="debug-particles">
        <div className="debug-particle"></div>
        <div className="debug-particle"></div>
        <div className="debug-particle"></div>
      </div>
    </div>
  );
};
