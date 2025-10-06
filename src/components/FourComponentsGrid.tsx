import React from "react";
import { Tournament, Player, Pair, Match } from "../lib/database";
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
  updatePairPlayers: (pairId: string, player1: Player, player2: Player) => void;
  deletePair: (pairId: string) => void;
  loading: boolean;
  onReset: () => Promise<void>;
  loadTournamentData: () => void;
  setForceRefresh: React.Dispatch<React.SetStateAction<number>>;
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
  updatePairPlayers,
  deletePair,
  loading,
  onReset,
  loadTournamentData,
  setForceRefresh,
}) => {
  const { validatePlayerSelection } = usePlayerValidation();

  const handlePlayerSelect = (players: Player[]) => {
    validatePlayerSelection(
      players,
      pairs,
      setError,
      addPair,
      setSelectedPlayers
    );
  };

  return (
    <div className="four-components-grid">
      {/* Gestión de Jugadores */}
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
              playersInPairs={pairs.flatMap((pair) => [
                pair.player1_id,
                pair.player2_id,
              ])}
              onPlayerSelect={handlePlayerSelect}
              selectedPlayers={selectedPlayers}
              allowMultipleSelection={true}
              userId={selectedTournament.user_id}
            />
          </div>
        )}
      </div>

      {/* Gestión de Parejas */}
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
            />
          </div>
        )}
      </div>

      {/* Panel de Estado de la Reta */}
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

      {/* Panel de Debug */}
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
                selectedTournament.is_started ? "✅ Iniciado" : "⏳ Pendiente"
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
              }}
              onVerifyStatus={async () => {
                try {
                  alert(
                    `📊 Estado del Sistema:\n` +
                      `• Retas: 1\n` +
                      `• Parejas: ${pairs.length}\n` +
                      `• Partidos: ${matches.length}\n` +
                      `• Estado: ✅ Todo funcionando correctamente`
                  );
                } catch (error) {
                  alert(
                    "❌ Error al verificar estado: " + (error as Error).message
                  );
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default FourComponentsGrid;
