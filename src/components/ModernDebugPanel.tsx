import React, { useState } from "react";

interface ModernDebugPanelProps {
  status: string;
  pairsCount: number;
  matchesCount: number;
  onTestConnection: () => void;
  onReloadData: () => void;
  onVerifyStatus: () => void;
}

export const ModernDebugPanel: React.FC<ModernDebugPanelProps> = ({
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
    <div className="debug-panel-content">
      {/* Indicadores de Estado */}
      <div className="status-indicators">
        <div className="status-card">
          <div className="status-icon">
            <span className="status-dot active"></span>
          </div>
          <div className="status-info">
            <span className="status-label">Estado</span>
            <span className="status-value">{status}</span>
          </div>
        </div>

        <div className="status-card">
          <div className="status-icon">
            <span className="status-dot pairs"></span>
          </div>
          <div className="status-info">
            <span className="status-label">Parejas</span>
            <span className="status-value">{pairsCount}</span>
          </div>
        </div>

        <div className="status-card">
          <div className="status-icon">
            <span className="status-dot matches"></span>
          </div>
          <div className="status-info">
            <span className="status-label">Partidos</span>
            <span className="status-value">{matchesCount}</span>
          </div>
        </div>
      </div>

      {/* Botones de Acción */}
      <div className="action-buttons">
        <button
          className="action-btn connection-btn"
          onClick={() => handleAction(onTestConnection)}
          disabled={isLoading}
        >
          <div className="btn-content">
            <span className="btn-icon">⚡</span>
            <span className="btn-text">Probar Conexión</span>
          </div>
          <div className="btn-background"></div>
        </button>

        <button
          className="action-btn reload-btn"
          onClick={() => handleAction(onReloadData)}
          disabled={isLoading}
        >
          <div className="btn-content">
            <span className="btn-icon">🔄</span>
            <span className="btn-text">Recargar Datos</span>
          </div>
          <div className="btn-background"></div>
        </button>

        <button
          className="action-btn verify-btn"
          onClick={() => handleAction(onVerifyStatus)}
          disabled={isLoading}
        >
          <div className="btn-content">
            <span className="btn-icon">🔍</span>
            <span className="btn-text">Verificar Estado</span>
          </div>
          <div className="btn-background"></div>
        </button>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <span>Procesando...</span>
        </div>
      )}

      {/* Efectos de Partículas */}
      <div className="debug-particles">
        <div className="particle"></div>
        <div className="particle"></div>
        <div className="particle"></div>
      </div>
    </div>
  );
};
