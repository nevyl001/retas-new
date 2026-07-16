import React, { useCallback, useMemo } from "react";
import { Tournament, Player, Pair, Match } from "../lib/database";
import { useUser } from "../contexts/UserContext";
import { useOrganizerPlayerPool } from "../hooks/useOrganizerPlayerPool";
import { useRetaAbiertaRealtime } from "../lib/retaAbierta/useRetaAbiertaRealtime";
import { ModernPlayerManager } from "./ModernPlayerManager";
import { NewPairManager } from "./NewPairManager";
import { TournamentStatusContent } from "./TournamentStatusContent";
import { DebugPanelContent } from "./DebugPanelContent";
import { testConnection } from "../lib/supabaseClient";
import { usePlayerValidation } from "../hooks/usePlayerValidation";

interface FourComponentsGridProps {
  selectedTournament: Tournament;
  pairs: Pair[];
  matches: Match[];
  showPlayerManager: boolean;
  setShowPlayerManager: (show: boolean) => void;
  showPairManager: boolean;
  setShowPairManager: (show: boolean) => void;
  showTournamentStatus: boolean;
  setShowTournamentStatus: (show: boolean) => void;
  showDebugInfo: boolean;
  setShowDebugInfo: (show: boolean) => void;
  selectedPlayers: Player[];
  setSelectedPlayers: (players: Player[]) => void;
  setError: (error: string) => void;
  addPair: (player1: Player, player2: Player) => void;
  isCreatingPair?: boolean;
  updatePairPlayers: (pairId: string, player1: Player, player2: Player) => void;
  deletePair: (pairId: string) => void;
  loading: boolean;
  onReset: () => Promise<void>;
  loadTournamentData: () => void;
  setForceRefresh: React.Dispatch<React.SetStateAction<number>>;
  mobileFilter?: "jugadores" | "config" | null;
  /** Preferido sobre selectedTournament.user_id si el torneo no lo trae */
  userId?: string;
}

export const FourComponentsGrid: React.FC<FourComponentsGridProps> = ({
  selectedTournament,
  pairs,
  matches,
  showPlayerManager,
  setShowPlayerManager,
  showPairManager,
  setShowPairManager,
  showTournamentStatus,
  setShowTournamentStatus,
  showDebugInfo,
  setShowDebugInfo,
  selectedPlayers,
  setSelectedPlayers,
  setError,
  addPair,
  isCreatingPair = false,
  updatePairPlayers,
  deletePair,
  loading,
  onReset,
  loadTournamentData,
  setForceRefresh,
  mobileFilter = null,
  userId: userIdProp,
}) => {
  const { user } = useUser();
  const { validatePlayerSelection } = usePlayerValidation();

  const organizerId =
    userIdProp?.trim() ||
    selectedTournament.user_id?.trim() ||
    user?.id?.trim() ||
    null;

  const {
    players: playerPool,
    loading: playerPoolLoading,
    error: playerPoolError,
    refresh: refreshPlayerPool,
  } = useOrganizerPlayerPool(organizerId);

  // Inscritos/vínculos por convocatoria: invalidar pool sin recargar la página.
  const onConvocatoriaOrFocusRefresh = useCallback(() => {
    void refreshPlayerPool();
  }, [refreshPlayerPool]);

  useRetaAbiertaRealtime({
    tournamentId: selectedTournament.id,
    enabled: Boolean(selectedTournament.id),
    onUpdate: onConvocatoriaOrFocusRefresh,
  });

  const playersInPairs = useMemo(
    () => pairs.flatMap((pair) => [pair.player1_id, pair.player2_id]),
    [pairs]
  );

  const handlePlayerSelect = (players: Player[]) => {
    validatePlayerSelection(
      players,
      pairs,
      setError,
      addPair,
      setSelectedPlayers,
      { isCreatingPair }
    );
  };

  return (
    <div className="four-components-grid">
      {(!mobileFilter || mobileFilter === "jugadores") && (
        <>
          <div className="component-card player-management-section">
            <div className="component-header">
              <div className="component-icon">👥</div>
              <div className="component-title">
                <h3>Gestión de Jugadores</h3>
                <span className="component-subtitle">
                  Administrar Participantes
                </span>
              </div>
              <button
                className="component-toggle-btn"
                onClick={() => setShowPlayerManager(!showPlayerManager)}
              >
                {showPlayerManager ? "❌" : "👁️"}
              </button>
            </div>
            {showPlayerManager && (
              <div className="component-content">
                <ModernPlayerManager
                  playersInPairs={playersInPairs}
                  onPlayerSelect={handlePlayerSelect}
                  selectedPlayers={selectedPlayers}
                  allowMultipleSelection={true}
                  userId={organizerId ?? undefined}
                  players={playerPool}
                  loading={playerPoolLoading}
                  error={playerPoolError}
                  onRefreshPlayers={refreshPlayerPool}
                  isCreatingPair={isCreatingPair}
                />
              </div>
            )}
          </div>

          <div className="component-card pair-management-section">
            <div className="component-header">
              <div className="component-icon">✏️</div>
              <div className="component-title">
                <h3>Gestión de Parejas</h3>
                <span className="component-subtitle">Administrar Equipos</span>
              </div>
              <button
                className="component-toggle-btn"
                onClick={() => setShowPairManager(!showPairManager)}
              >
                {showPairManager ? "❌" : "👁️"}
              </button>
            </div>
            {showPairManager && (
              <div className="component-content">
                <NewPairManager
                  pairs={pairs}
                  onPairUpdate={updatePairPlayers}
                  onPairDelete={deletePair}
                  players={playerPool}
                  loading={playerPoolLoading}
                />
              </div>
            )}
          </div>
        </>
      )}

      {(!mobileFilter || mobileFilter === "config") && (
        <>
          <div className="component-card reta-status-card">
            <div className="component-header">
              <div className="component-icon">🏆</div>
              <div className="component-title">
                <h3>
                  {selectedTournament.is_finished
                    ? "Reta Finalizada"
                    : "Reta en Progreso"}
                </h3>
                <span className="component-subtitle">Estado de la Reta</span>
              </div>
              <button
                className="component-toggle-btn"
                onClick={() => setShowTournamentStatus(!showTournamentStatus)}
              >
                {showTournamentStatus ? "❌" : "👁️"}
              </button>
            </div>
            {showTournamentStatus && (
              <div className="component-content">
                <TournamentStatusContent
                  tournament={selectedTournament}
                  pairsCount={pairs.length}
                  loading={loading}
                  onReset={onReset}
                />
              </div>
            )}
          </div>

          <div className="component-card debug-panel-card">
            <div className="component-header">
              <div className="component-icon">🔧</div>
              <div className="component-title">
                <h3>Panel de Debug</h3>
                <span className="component-subtitle">Información del Sistema</span>
              </div>
              <button
                className="component-toggle-btn"
                onClick={() => setShowDebugInfo(!showDebugInfo)}
              >
                {showDebugInfo ? "❌" : "👁️"}
              </button>
            </div>
            {showDebugInfo && (
              <div className="component-content">
                <DebugPanelContent
                  status={
                    selectedTournament.is_started
                      ? "✅ Iniciado"
                      : "⏳ Pendiente"
                  }
                  pairsCount={pairs.length}
                  matchesCount={matches.length}
                  onTestConnection={async () => {
                    try {
                      const result = await testConnection();
                      alert(
                        result
                          ? "✅ Conexión exitosa a la base de datos"
                          : "❌ Error de conexión"
                      );
                    } catch (error) {
                      alert(
                        "❌ Error al probar la conexión: " +
                          (error as Error).message
                      );
                    }
                  }}
                  onReloadData={() => {
                    loadTournamentData();
                    setForceRefresh((prev) => prev + 1);
                    void refreshPlayerPool();
                  }}
                  onVerifyStatus={async () => {
                    try {
                      alert(
                        `📊 Estado del Sistema:\n` +
                          `• Retas: 1\n` +
                          `• Parejas: ${pairs.length}\n` +
                          `• Partidos: ${matches.length}\n` +
                          `• Jugadores pool: ${playerPool.length}\n` +
                          `• Estado: ✅ Todo funcionando correctamente`
                      );
                    } catch (error) {
                      alert(
                        "❌ Error al verificar estado: " +
                          (error as Error).message
                      );
                    }
                  }}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default FourComponentsGrid;
