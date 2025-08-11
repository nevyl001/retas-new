import React, { useState, useEffect } from "react";
import {
  createTournament,
  getTournaments,
  deleteTournament,
  updateTournament,
  Tournament,
} from "../lib/database";
import { ModernTournamentCard } from "./ModernTournamentCard";

interface TournamentManagerProps {
  onTournamentSelect: (tournament: Tournament) => void;
  selectedTournament?: Tournament;
}

export const TournamentManager: React.FC<TournamentManagerProps> = ({
  onTournamentSelect,
  selectedTournament,
}) => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTournament, setNewTournament] = useState({
    name: "",
    description: "",
    courts: 1,
  });

  useEffect(() => {
    loadTournaments();
  }, []);

  const loadTournaments = async () => {
    try {
      setLoading(true);
      const data = await getTournaments();
      setTournaments(data);
    } catch (err) {
      setError("Error al cargar los torneos");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError("");
      const tournament = await createTournament(
        newTournament.name,
        newTournament.description || undefined,
        newTournament.courts
      );
      setTournaments([tournament, ...tournaments]);
      setNewTournament({ name: "", description: "", courts: 1 });
      setShowCreateForm(false);
    } catch (err) {
      setError("Error al crear el torneo");
      console.error(err);
    }
  };

  const handleDeleteTournament = async (id: string) => {
    if (
      !window.confirm(
        "¿Estás seguro de que quieres eliminar este torneo? Esta acción no se puede deshacer."
      )
    ) {
      return;
    }

    try {
      setError("");
      await deleteTournament(id);
      setTournaments(tournaments.filter((t) => t.id !== id));
      if (selectedTournament?.id === id) {
        onTournamentSelect(tournaments[0] || null);
      }
    } catch (err) {
      setError("Error al eliminar el torneo");
      console.error(err);
    }
  };

  const handleStartTournament = async (tournament: Tournament) => {
    try {
      setError("");
      await updateTournament(tournament.id, { is_started: true });
      setTournaments(
        tournaments.map((t) =>
          t.id === tournament.id ? { ...t, is_started: true } : t
        )
      );
    } catch (err) {
      setError("Error al iniciar el torneo");
      console.error(err);
    }
  };

  const handleFinishTournament = async (tournament: Tournament) => {
    try {
      setError("");
      await updateTournament(tournament.id, { is_finished: true });
      setTournaments(
        tournaments.map((t) =>
          t.id === tournament.id ? { ...t, is_finished: true } : t
        )
      );
    } catch (err) {
      setError("Error al finalizar el torneo");
      console.error(err);
    }
  };

  if (loading) {
    return <div className="loading">Cargando torneos...</div>;
  }

  return (
    <div className="tournament-manager">
      <div className="tournament-header">
        <h2>🏆 Gestión de Torneos Express y Retas</h2>
      </div>

      <div className="create-tournament-section">
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="create-tournament-btn"
        >
          {showCreateForm ? "❌ Cancelar" : "➕ Crear Nueva Reta"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {showCreateForm && (
        <div className="create-tournament-form">
          <h3>Crear Nuevo Torneo</h3>
          <form onSubmit={handleCreateTournament}>
            <div className="form-group">
              <label htmlFor="tournament-name">Nombre del Torneo:</label>
              <input
                id="tournament-name"
                type="text"
                value={newTournament.name}
                onChange={(e) =>
                  setNewTournament({ ...newTournament, name: e.target.value })
                }
                placeholder="Ej: Torneo de Verano 2024"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="tournament-description">
                Descripción (opcional):
              </label>
              <textarea
                id="tournament-description"
                value={newTournament.description}
                onChange={(e) =>
                  setNewTournament({
                    ...newTournament,
                    description: e.target.value,
                  })
                }
                placeholder="Descripción del torneo..."
                rows={3}
              />
            </div>

            <div className="form-group">
              <label htmlFor="tournament-courts">Número de Canchas:</label>
              <input
                id="tournament-courts"
                type="number"
                min="1"
                max="10"
                value={newTournament.courts}
                onChange={(e) =>
                  setNewTournament({
                    ...newTournament,
                    courts: parseInt(e.target.value),
                  })
                }
                required
              />
            </div>

            <div className="form-actions">
              <button type="submit" className="submit-btn">
                🏆 Crear Torneo
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="cancel-btn"
              >
                ❌ Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="tournaments-list">
        <h3>Torneos ({tournaments.length})</h3>
        {tournaments.length === 0 ? (
          <div className="no-tournaments">
            <p>📝 No hay torneos creados aún</p>
            <p>Crea tu primer torneo para comenzar</p>
          </div>
        ) : (
          <div className="tournaments-grid">
            {tournaments.map((tournament) => (
              <ModernTournamentCard
                key={tournament.id}
                tournament={tournament}
                isSelected={selectedTournament?.id === tournament.id}
                onSelect={onTournamentSelect}
                onStart={handleStartTournament}
                onFinish={handleFinishTournament}
                onDelete={(tournament) => handleDeleteTournament(tournament.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
