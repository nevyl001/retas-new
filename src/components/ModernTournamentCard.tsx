import React from "react";
import { Tournament } from "../lib/database";

interface ModernTournamentCardProps {
  tournament: Tournament;
  isSelected: boolean;
  onSelect: (tournament: Tournament) => void;
  onStart: (tournament: Tournament) => void;
  onFinish: (tournament: Tournament) => void;
  onDelete: (tournament: Tournament) => void;
}

export const ModernTournamentCard: React.FC<ModernTournamentCardProps> = ({
  tournament,
  isSelected,
  onSelect,
  onStart,
  onFinish,
  onDelete,
}) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("es-ES", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
    });
  };

  const getStatusInfo = () => {
    if (tournament.is_finished) {
      return {
        text: "Finalizado",
        icon: "🏆",
        color: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
    } else if (tournament.is_started) {
      return {
        text: "En Progreso",
        icon: "⚡",
        color: "bg-blue-50 text-blue-700 border-blue-200",
      };
    } else {
      return {
        text: "Pendiente",
        icon: "⏳",
        color: "bg-gray-50 text-gray-700 border-gray-200",
      };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <div
      className={`modern-tournament-card ${
        isSelected ? "modern-tournament-card-selected" : ""
      }`}
    >
      {/* Header */}
      <div className="modern-tournament-header">
        <div className="modern-tournament-title">
          <h3>
            <span className="modern-title-icon">🏆</span>
            {tournament.name}
          </h3>
          {tournament.description && (
            <p className="modern-tournament-description">
              {tournament.description}
            </p>
          )}
          {/* Status Badge */}
          <div className={`modern-status-badge ${statusInfo.color}`}>
            <span className="modern-status-icon">{statusInfo.icon}</span>
            <span className="modern-status-text">{statusInfo.text}</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="modern-tournament-stats">
        <div className="modern-stat-item">
          <span className="modern-stat-icon">🏟️</span>
          <span className="modern-stat-text">
            {tournament.courts} cancha{tournament.courts > 1 ? "s" : ""}
          </span>
        </div>

        <div className="modern-stat-item">
          <span className="modern-stat-icon">📅</span>
          <span className="modern-stat-text">
            Creado: {formatDate(tournament.created_at)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="modern-tournament-actions">
        <button
          onClick={() => onSelect(tournament)}
          className="modern-action-btn modern-action-btn-primary"
        >
          <span className="modern-btn-icon">📋</span>
          Gestionar
        </button>

        {!tournament.is_started && (
          <button
            onClick={() => onStart(tournament)}
            className="modern-action-btn modern-action-btn-success"
          >
            <span className="modern-btn-icon">▶️</span>
            Iniciar
          </button>
        )}

        {tournament.is_started && !tournament.is_finished && (
          <button
            onClick={() => onFinish(tournament)}
            className="modern-action-btn modern-action-btn-warning"
          >
            <span className="modern-btn-icon">🏁</span>
            Finalizar
          </button>
        )}

        <button
          onClick={() => onDelete(tournament)}
          className="modern-action-btn modern-action-btn-danger"
        >
          <span className="modern-btn-icon">🗑️</span>
        </button>
      </div>
    </div>
  );
};
