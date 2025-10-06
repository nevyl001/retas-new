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
    <div className="elegant-debug-panel">
      {/* Header Elegante */}
      <div className="elegant-debug-header">
        <div className="elegant-header-content">
          <div className="elegant-header-title">
            <p>Información del Sistema</p>
          </div>
        </div>
      </div>

      {/* Indicadores de Estado Elegantes */}
      <div className="elegant-debug-indicators">
        <div className="elegant-debug-card">
          <div className="elegant-debug-icon">
            <span className="elegant-debug-dot active"></span>
          </div>
          <div className="elegant-debug-info">
            <span className="elegant-debug-label">ESTADO</span>
            <span className="elegant-debug-value">{status}</span>
          </div>
        </div>

        <div className="elegant-debug-card">
          <div className="elegant-debug-icon">
            <span className="elegant-debug-dot pairs"></span>
          </div>
          <div className="elegant-debug-info">
            <span className="elegant-debug-label">PAREJAS</span>
            <span className="elegant-debug-value">{pairsCount}</span>
          </div>
        </div>

        <div className="elegant-debug-card">
          <div className="elegant-debug-icon">
            <span className="elegant-debug-dot matches"></span>
          </div>
          <div className="elegant-debug-info">
            <span className="elegant-debug-label">PARTIDOS</span>
            <span className="elegant-debug-value">{matchesCount}</span>
          </div>
        </div>
      </div>

      {/* Botones de Acción Elegantes */}
      <div className="elegant-debug-actions">
        <button
          className="elegant-action-btn connection-btn"
          onClick={() => handleAction(onTestConnection)}
          disabled={isLoading}
        >
          <div className="elegant-btn-content">
            <span className="elegant-btn-icon">⚡</span>
            <span className="elegant-btn-text">Probar Conexión</span>
          </div>
          <div className="elegant-btn-background"></div>
        </button>

        <button
          className="elegant-action-btn reload-btn"
          onClick={() => handleAction(onReloadData)}
          disabled={isLoading}
        >
          <div className="elegant-btn-content">
            <span className="elegant-btn-icon">🔄</span>
            <span className="elegant-btn-text">Recargar Datos</span>
          </div>
          <div className="elegant-btn-background"></div>
        </button>

        <button
          className="elegant-action-btn verify-btn"
          onClick={() => handleAction(onVerifyStatus)}
          disabled={isLoading}
        >
          <div className="elegant-btn-content">
            <span className="elegant-btn-icon">🔍</span>
            <span className="elegant-btn-text">Verificar Estado</span>
          </div>
          <div className="elegant-btn-background"></div>
        </button>
      </div>

      {/* Loading Overlay Elegante */}
      {isLoading && (
        <div className="elegant-loading-overlay">
          <div className="elegant-loading-spinner"></div>
          <span>Procesando...</span>
        </div>
      )}

      {/* Efectos de Partículas Elegantes */}
      <div className="elegant-debug-particles">
        <div className="elegant-debug-particle"></div>
        <div className="elegant-debug-particle"></div>
        <div className="elegant-debug-particle"></div>
      </div>
    </div>
  );
};
