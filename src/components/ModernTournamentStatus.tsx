import React from "react";

interface ModernTournamentStatusProps {
  tournament: {
    is_finished: boolean;
    is_started: boolean;
  };
  pairsCount: number;
  loading: boolean;
  onReset: () => void;
}

export const ModernTournamentStatus: React.FC<ModernTournamentStatusProps> = ({
  tournament,
  pairsCount,
  loading,
  onReset,
}) => {
  return (
    <div className="tournament-status-content">
      {/* Indicadores de Estado */}
      <div className="tournament-indicators">
        <div className="tournament-card">
          <div className="tournament-card-icon">
            <span className="status-dot tournament-status"></span>
          </div>
          <div className="tournament-card-info">
            <span className="tournament-label">Estado</span>
            <span className="tournament-value">
              {tournament.is_finished ? "Finalizada" : "En Progreso"}
            </span>
          </div>
        </div>

        <div className="tournament-card">
          <div className="tournament-card-icon">
            <span className="status-dot pairs-status"></span>
          </div>
          <div className="tournament-card-info">
            <span className="tournament-label">Parejas</span>
            <span className="tournament-value">{pairsCount}</span>
          </div>
        </div>

        <div className="tournament-card">
          <div className="tournament-card-icon">
            <span className="status-dot info-status"></span>
          </div>
          <div className="tournament-card-info">
            <span className="tournament-label">Info</span>
            <span className="tournament-value">
              {tournament.is_finished ? "Exitosa" : "Activa"}
            </span>
          </div>
        </div>
      </div>

      {/* Información Detallada */}
      <div className="tournament-details">
        <div className="detail-item">
          <span className="detail-icon">✅</span>
          <span className="detail-text">
            {tournament.is_finished
              ? "La reta ha sido finalizada exitosamente"
              : "La reta ya está iniciada y en progreso"}
          </span>
        </div>
        <div className="detail-item">
          <span className="detail-icon">👥</span>
          <span className="detail-text">
            Tienes {pairsCount} parejas registradas
          </span>
        </div>
        <div className="detail-item">
          <span className="detail-icon">📊</span>
          <span className="detail-text">
            Estado de la reta:{" "}
            {tournament.is_finished ? "Finalizada" : "Iniciada"}
          </span>
        </div>
      </div>

      {/* Botón de Reset */}
      <button className="modern-reset-btn" onClick={onReset} disabled={loading}>
        <div className="reset-btn-content">
          <span className="reset-btn-icon">{loading ? "⏳" : "🔄"}</span>
          <span className="reset-btn-text">
            {loading ? "Reseteando..." : "Resetear Reta"}
          </span>
        </div>
        <div className="reset-btn-background"></div>
      </button>

      {/* Efectos de Partículas */}
      <div className="tournament-particles">
        <div className="tournament-particle"></div>
        <div className="tournament-particle"></div>
        <div className="tournament-particle"></div>
      </div>
    </div>
  );
};
