import React from "react";

interface TournamentStatusContentProps {
  tournament: {
    is_finished: boolean;
    is_started: boolean;
  };
  pairsCount: number;
  loading: boolean;
  onReset: () => void;
}

export const TournamentStatusContent: React.FC<
  TournamentStatusContentProps
> = ({ tournament, pairsCount, loading, onReset }) => {
  console.log("🔄 TournamentStatusContent renderizado:", {
    loading,
    pairsCount,
  });
  return (
    <div className="elegant-reta-status">
      {/* Header Elegante */}
      <div className="elegant-status-header">
        <div className="elegant-header-content">
          <div className="elegant-header-title">
            <p>Estado de la Reta</p>
          </div>
        </div>
      </div>

      {/* Indicadores de Estado Elegantes */}
      <div className="elegant-status-indicators">
        <div className="elegant-status-card">
          <div className="elegant-status-icon">
            <span className="elegant-status-dot reta-status"></span>
          </div>
          <div className="elegant-status-info">
            <span className="elegant-status-label">ESTADO</span>
            <span className="elegant-status-value">
              {tournament.is_finished ? "Finalizada" : "En Progreso"}
            </span>
          </div>
        </div>

        <div className="elegant-status-card">
          <div className="elegant-status-icon">
            <span className="elegant-status-dot pairs-status"></span>
          </div>
          <div className="elegant-status-info">
            <span className="elegant-status-label">PAREJAS</span>
            <span className="elegant-status-value">{pairsCount}</span>
          </div>
        </div>

        <div className="elegant-status-card">
          <div className="elegant-status-icon">
            <span className="elegant-status-dot info-status"></span>
          </div>
          <div className="elegant-status-info">
            <span className="elegant-status-label">INFO</span>
            <span className="elegant-status-value">
              {tournament.is_finished ? "Exitosa" : "Activa"}
            </span>
          </div>
        </div>
      </div>

      {/* Información Detallada Elegante */}
      <div className="elegant-status-details">
        <div className="elegant-detail-item">
          <span className="elegant-detail-icon">✅</span>
          <span className="elegant-detail-text">
            {tournament.is_finished
              ? "La reta ha sido finalizada exitosamente"
              : "La reta ya está iniciada y en progreso"}
          </span>
        </div>
        <div className="elegant-detail-item">
          <span className="elegant-detail-icon">👥</span>
          <span className="elegant-detail-text">
            Tienes {pairsCount} parejas registradas
          </span>
        </div>
        <div className="elegant-detail-item">
          <span className="elegant-detail-icon">📊</span>
          <span className="elegant-detail-text">
            Estado de la reta:{" "}
            {tournament.is_finished ? "Finalizada" : "Iniciada"}
          </span>
        </div>
      </div>

      {/* Botón de Reset Elegante */}
      <button
        className="elegant-reset-btn"
        onClick={(e) => {
          console.log(
            "🔄 Click en botón de reset detectado, loading:",
            loading
          );
          e.preventDefault();
          e.stopPropagation();
          if (!loading) {
            console.log("✅ Ejecutando función onReset");
            onReset();
          } else {
            console.log("❌ Botón deshabilitado por loading");
          }
        }}
        disabled={loading}
        type="button"
        style={{
          pointerEvents: loading ? "none" : "auto",
          position: "relative",
          zIndex: 1000,
        }}
      >
        <div className="elegant-reset-content">
          <span className="elegant-reset-icon">{loading ? "⏳" : "🔄"}</span>
          <span className="elegant-reset-text">
            {loading ? "Reseteando..." : "Resetear Reta"}
          </span>
        </div>
        <div className="elegant-reset-background"></div>
      </button>

      {/* Efectos de Partículas Elegantes */}
      <div className="elegant-status-particles">
        <div className="elegant-status-particle"></div>
        <div className="elegant-status-particle"></div>
        <div className="elegant-status-particle"></div>
      </div>
    </div>
  );
};
