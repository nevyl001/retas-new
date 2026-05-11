import React, { useState, useEffect } from "react";
import {
  createTournament,
  getTournaments,
  deleteTournament,
  updateTournament,
  Tournament,
} from "../lib/database";
import { useUser } from "../contexts/UserContext";
import AppHeader from "./AppHeader";

interface TournamentManagerProps {
  onTournamentSelect: (tournament: Tournament) => void;
  selectedTournament?: Tournament;
}

export const TournamentManager: React.FC<TournamentManagerProps> = ({
  onTournamentSelect,
  selectedTournament,
}) => {
  const { user } = useUser();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string>("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTournament, setNewTournament] = useState({
    name: "",
    description: "",
    courts: 1,
  });

  // Cargar retas cuando el usuario cambie
  useEffect(() => {
    console.log("🔄 useEffect ejecutado, usuario:", user?.id);

    if (!user?.id) {
      console.log("❌ No hay usuario, no se pueden cargar retas");
      setLoading(false);
      setTournaments([]);
      return;
    }

    let isMounted = true;

    const loadTournaments = async () => {
      console.log("🔄 Cargando retas para usuario:", user.id);
      try {
        setLoading(true);
        const data = await getTournaments(user.id);
        
        if (!isMounted) return;
        
        console.log("✅ Retas cargadas:", data?.length || 0);
        setTournaments(data || []);
      } catch (err) {
        if (!isMounted) return;
        console.error("❌ Error al cargar retas:", err);
        setError("Error al cargar las retas");
        setTournaments([]);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadTournaments();

    return () => {
      isMounted = false;
    };
  }, [user?.id]); // Solo depender del ID del usuario

  // Mantener la tarjeta sincronizada cuando selectedTournament cambia fuera del manager
  // (ej. Americano Dinamico marca la reta como iniciada/finalizada).
  useEffect(() => {
    if (!selectedTournament) return;
    setTournaments((prev) =>
      prev.map((t) =>
        t.id === selectedTournament.id ? { ...t, ...selectedTournament } : t
      )
    );
  }, [selectedTournament]);

  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      setError("");
      const tournament = await createTournament(
        newTournament.name,
        user.id,
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
      <AppHeader
        onCreateClick={() => setShowCreateForm(!showCreateForm)}
        isCreating={showCreateForm}
      />

      {showCreateForm && (
        <div className="create-reta-form">
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

      <div className="retas-list">
        <h2>Mis Retas</h2>
        {loading ? (
          <div className="loading-tournaments">
            <p>⏳ Cargando retas...</p>
          </div>
        ) : tournaments.length === 0 ? (
          <div className="no-tournaments">
            <div className="no-tournaments-content">
              <h3>🏆 ¡No tienes ninguna reta!</h3>
              <p>¡Inicia una ya y comienza a organizar tus torneos de pádel!</p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="create-first-tournament-btn"
              >
                🚀 Crear Mi Primera Reta
              </button>
            </div>
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

                <div className="reta-card-info">
                  <span>
                    <span className="info-icon">🏟️</span>
                    {tournament.courts}{" "}
                    {tournament.courts === 1 ? "cancha" : "canchas"}
                  </span>
                  {tournament.description && (
                    <div className="reta-card-description">
                      <span className="description-icon">📝</span>
                      <span className="description-text">
                        {tournament.description}
                      </span>
                    </div>
                  )}
                  {!tournament.description && (
                    <div className="reta-card-description">
                      <span className="description-icon">📝</span>
                      <span className="description-text">Sin descripción</span>
                    </div>
                  )}
                </div>

                <div className="reta-card-actions">
                  <div
                    className={`status-indicator ${
                      tournament.is_finished
                        ? "finalizada"
                        : tournament.is_started
                        ? "en-curso"
                        : "pendiente"
                    }`}
                  >
                    <span>
                      {tournament.is_finished
                        ? "🏆"
                        : tournament.is_started
                        ? "⚡"
                        : "⏳"}
                    </span>
                    <span>
                      {tournament.is_finished
                        ? "Finalizada"
                        : tournament.is_started
                        ? "En curso"
                        : "Pendiente"}
                    </span>
                  </div>

                  {tournament.is_started && !tournament.is_finished && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFinishTournament(tournament);
                      }}
                      className="reta-btn reta-btn-finish"
                      disabled={loading}
                    >
                      {loading ? "⏳ Finalizando..." : "Finalizar"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Estilos CSS para el componente
const styles = `
  .loading-tournaments {
    text-align: center;
    padding: 40px 20px;
    color: var(--text-secondary);
  }

  .no-tournaments {
    text-align: center;
    padding: 40px 20px;
  }

  .no-tournaments-content {
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    padding: 40px 20px;
    max-width: 400px;
    margin: 0 auto;
  }

  .no-tournaments-content h3 {
    color: var(--accent-color);
    font-size: 24px;
    margin: 0 0 16px 0;
    font-weight: 700;
  }

  .no-tournaments-content p {
    color: var(--text-secondary);
    font-size: 16px;
    margin: 0 0 24px 0;
    line-height: 1.5;
  }

  .create-first-tournament-btn {
    background: var(--accent-color);
    color: var(--bg-primary);
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: none;
  }

  .create-first-tournament-btn:hover {
    background: var(--accent-hover);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(255, 214, 0, 0.2);
  }

  .create-first-tournament-btn:active {
    transform: translateY(0);
    box-shadow: 0 2px 6px rgba(255, 214, 0, 0.1);
  }
`;

// Agregar estilos al documento
if (typeof document !== "undefined") {
  const styleSheet = document.createElement("style");
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}
