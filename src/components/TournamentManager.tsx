import React, { useState, useEffect } from "react";
import {
  createTournament,
  getTournaments,
  deleteTournament,
  updateTournament,
  Tournament,
} from "../lib/database";

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
      setError("Error al cargar las retas");
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
      setError("Error al crear la reta");
      console.error(err);
    }
  };

  const handleDeleteTournament = async (id: string) => {
    if (
      !window.confirm(
        "¿Estás seguro de que quieres eliminar esta reta? Esta acción no se puede deshacer."
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
      setError("Error al eliminar la reta");
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
      setError("Error al iniciar la reta");
      console.error(err);
    }
  };

  const handleFinishTournament = async (tournament: Tournament) => {
    if (
      !window.confirm(
        "¿Estás seguro de que quieres finalizar la reta? Esta acción no se puede deshacer."
      )
    ) {
      return;
    }

    try {
      setError("");
      setLoading(true);

      console.log("🏁 Finalizando reta:", tournament.name);
      await updateTournament(tournament.id, { is_finished: true });

      // Actualizar el estado local
      setTournaments(
        tournaments.map((t) =>
          t.id === tournament.id ? { ...t, is_finished: true } : t
        )
      );

      // Si esta reta está seleccionada, actualizar también el estado seleccionado
      if (selectedTournament && selectedTournament.id === tournament.id) {
        onTournamentSelect({ ...tournament, is_finished: true });
      }

      console.log("✅ Reta finalizada exitosamente");

      // Mostrar mensaje de éxito
      alert("¡Reta finalizada exitosamente! 🏆");
    } catch (err) {
      console.error("❌ Error finalizando reta:", err);
      setError("Error al finalizar la reta: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Cargando retas...</div>;
  }

  return (
    <div className="tournament-manager">
      <div className="tournament-manager-banner">
        {/* Partículas flotantes */}
        <div className="floating-particle"></div>
        <div className="floating-particle"></div>
        <div className="floating-particle"></div>
        <div className="floating-particle"></div>

        <h2>
          <span className="banner-icon trophy">🏆</span>
          ¡Selecciona o Crea tu Reta de Pádel y ¡Diviértete!
          <span className="banner-icon ball">🎾</span>
        </h2>
      </div>

      <div className="create-tournament-section">
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="create-tournament-btn"
        >
          {showCreateForm ? "❌ Cancelar" : "➕ Crear Nueva Reta"}
        </button>
      </div>

      {showCreateForm && (
        <div className="create-tournament-form">
          <h3>Crear Nueva Reta</h3>
          <form onSubmit={handleCreateTournament}>
            <div className="form-group">
              <label htmlFor="tournament-name">Nombre de la Reta:</label>
              <input
                id="tournament-name"
                type="text"
                value={newTournament.name}
                onChange={(e) =>
                  setNewTournament({ ...newTournament, name: e.target.value })
                }
                placeholder="Ej: Reta de Verano 2024"
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
                placeholder="Descripción de la reta..."
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
                🏆 Crear Reta
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
        <h3>Retas ({tournaments.length})</h3>
        {tournaments.length === 0 ? (
          <div className="no-tournaments">
            <p>📝 No hay retas creadas aún</p>
            <p>Crea tu primera reta para comenzar</p>
          </div>
        ) : (
          <div className="tournaments-grid">
            {tournaments.map((tournament) => (
              <div
                key={tournament.id}
                className={`reta-card ${
                  selectedTournament?.id === tournament.id ? "selected" : ""
                }`}
                onClick={() => onTournamentSelect(tournament)}
                style={{ cursor: "pointer" }}
              >
                <div className="reta-card-header">
                  <h4 className="reta-card-title">{tournament.name}</h4>
                  <div className="reta-card-actions">
                    {tournament.is_started && !tournament.is_finished && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFinishTournament(tournament);
                        }}
                        className="reta-btn reta-btn-finish"
                        disabled={loading}
                      >
                        {loading ? "⏳ Finalizando..." : "🏁 Finalizar"}
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTournament(tournament.id);
                      }}
                      className="reta-btn reta-btn-delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                {tournament.description && (
                  <p className="reta-card-description">
                    {tournament.description}
                  </p>
                )}
                <div className="reta-card-info">
                  <span>🏟️ {tournament.courts} canchas</span>
                  <span>
                    {tournament.is_finished
                      ? "🏆 Finalizada"
                      : tournament.is_started
                      ? "🎾 En curso"
                      : "⏳ Pendiente"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
