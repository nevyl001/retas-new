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
  return (
    <div className="tstatus-container">
      {/* Indicadores de Estado */}
      <div className="tstatus-indicators">
        <div className="tstatus-card">
          <div className="tstatus-card-icon">
            <span className="tstatus-dot tstatus-primary"></span>
          </div>
          <div className="tstatus-card-info">
            <span className="tstatus-label">Estado</span>
            <span className="tstatus-value">
              {tournament.is_finished ? "Finalizada" : "En Progreso"}
            </span>
          </div>
        </div>

        <div className="tstatus-card">
          <div className="tstatus-card-icon">
            <span className="tstatus-dot tstatus-secondary"></span>
          </div>
          <div className="tstatus-card-info">
            <span className="tstatus-label">Parejas</span>
            <span className="tstatus-value">{pairsCount}</span>
          </div>
        </div>

        <div className="tstatus-card">
          <div className="tstatus-card-icon">
            <span className="tstatus-dot tstatus-tertiary"></span>
          </div>
          <div className="tstatus-card-info">
            <span className="tstatus-label">Info</span>
            <span className="tstatus-value">
              {tournament.is_finished ? "Exitosa" : "Activa"}
            </span>
          </div>
        </div>
      </div>

      {/* Información Detallada */}
      <div className="tstatus-details">
        <div className="tstatus-detail-item">
          <span className="tstatus-detail-icon">✅</span>
          <span className="tstatus-detail-text">
            {tournament.is_finished
              ? "La reta ha sido finalizada exitosamente"
              : "La reta ya está iniciada y en progreso"}
          </span>
        </div>
        <div className="tstatus-detail-item">
          <span className="tstatus-detail-icon">👥</span>
          <span className="tstatus-detail-text">
            Tienes {pairsCount} parejas registradas
          </span>
        </div>
        <div className="tstatus-detail-item">
          <span className="tstatus-detail-icon">📊</span>
          <span className="tstatus-detail-text">
            Estado de la reta:{" "}
            {tournament.is_finished ? "Finalizada" : "Iniciada"}
          </span>
        </div>
      </div>

      {/* Botón de Reset */}
      <button
        className="tstatus-reset-btn"
        onClick={onReset}
        disabled={loading}
      >
        <div className="tstatus-reset-content">
          <span className="tstatus-reset-icon">{loading ? "⏳" : "🔄"}</span>
          <span className="tstatus-reset-text">
            {loading ? "Reseteando..." : "Resetear Reta"}
          </span>
        </div>
        <div className="tstatus-reset-bg"></div>
      </button>

      {/* Efectos de Partículas */}
      <div className="tstatus-particles">
        <div className="tstatus-particle"></div>
        <div className="tstatus-particle"></div>
        <div className="tstatus-particle"></div>
      </div>
    </div>
  );
};
