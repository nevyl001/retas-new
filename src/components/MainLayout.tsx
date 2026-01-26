import React from "react";
import { Tournament, Player, Pair, Match } from "../lib/database";
import { TournamentWinner } from "./TournamentWinnerCalculator";
import { TournamentManager } from "./TournamentManager";
import WelcomeBanner from "./WelcomeBanner";
import TournamentDetails from "./TournamentDetails";

interface MainLayoutProps {
  selectedTournament: Tournament | null;
  onTournamentSelect: (tournament: Tournament | null) => void;
  loading: boolean;
  userId?: string;

  // Tournament data
  pairs: Pair[];
  matches: Match[];
  pairStats: Map<string, { sets: number; matches: number; points: number }>;
  matchesByRound: Record<number, Match[]>;

  // UI states
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

  // Actions
  addPair: (player1: Player, player2: Player) => void;
  updatePairPlayers: (pairId: string, player1: Player, player2: Player) => void;
  deletePair: (pairId: string) => void;
  onReset: () => Promise<void>;
  loadTournamentData: () => void;
  setForceRefresh: React.Dispatch<React.SetStateAction<number>>;
  forceRefresh: number;
  onStartTournament: () => void;
  onCopyPublicLink: (tournamentId: string) => void;
  generatePublicLink: (tournamentId: string) => string;

  // Winner logic
  isTournamentFinished: boolean;
  winner: Pair | null;
  tournamentWinner: TournamentWinner | null;
  onShowWinnerScreen: () => void;
  onBackToHome: () => void;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  selectedTournament,
  onTournamentSelect,
  loading,
  userId,
  pairs,
  matches,
  pairStats,
  matchesByRound,
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
  onReset,
  loadTournamentData,
  setForceRefresh,
  forceRefresh,
  onStartTournament,
  onCopyPublicLink,
  generatePublicLink,
  isTournamentFinished,
  winner,
  tournamentWinner,
  onShowWinnerScreen,
  onBackToHome,
}) => {
  return (
    <div className="container">
      <div className="header-section">
        <h1>Gestor de Retas de Pádel</h1>
        <div className="header-instructions">
          <div className="instruction-step">
            <span className="instruction-number">1</span>
            <span className="instruction-icon">📝</span>
            <span>Crea tu primera reta</span>
          </div>
          <div className="instruction-step">
            <span className="instruction-number">2</span>
            <span className="instruction-icon">👥</span>
            <span>Añade jugadores participantes</span>
          </div>
          <div className="instruction-step">
            <span className="instruction-number">3</span>
            <span className="instruction-icon">🤝</span>
            <span>Forma parejas</span>
          </div>
          <div className="instruction-step">
            <span className="instruction-number">4</span>
            <span className="instruction-icon">⚡</span>
            <span>Inicia la reta y genera partidos</span>
          </div>
        </div>
      </div>

      {loading && (
        <div className="loading">
          <p>⏳ Cargando...</p>
        </div>
      )}

      <div className="main-layout">
        {/* Banner de Bienvenida */}
        <WelcomeBanner isVisible={!selectedTournament} />

        {/* Gestión de Retas */}
        <div className="reta-management-section">
          <TournamentManager
            selectedTournament={selectedTournament || undefined}
            onTournamentSelect={onTournamentSelect}
          />
        </div>

        {/* Contenido de la Reta Seleccionada */}
        <div className="reta-content">
          {selectedTournament ? (
            <TournamentDetails
              selectedTournament={selectedTournament}
              pairs={pairs}
              matches={matches}
              pairStats={pairStats}
              matchesByRound={matchesByRound}
              loading={loading}
              showPlayerManager={showPlayerManager}
              setShowPlayerManager={setShowPlayerManager}
              showPairManager={showPairManager}
              setShowPairManager={setShowPairManager}
              showTournamentStatus={showTournamentStatus}
              setShowTournamentStatus={setShowTournamentStatus}
              showDebugInfo={showDebugInfo}
              setShowDebugInfo={setShowDebugInfo}
              selectedPlayers={selectedPlayers}
              setSelectedPlayers={setSelectedPlayers}
              setError={setError}
              addPair={addPair}
              updatePairPlayers={updatePairPlayers}
              deletePair={deletePair}
              userId={userId}
              onReset={onReset}
              loadTournamentData={loadTournamentData}
              setForceRefresh={setForceRefresh}
              forceRefresh={forceRefresh}
              onStartTournament={onStartTournament}
              onCopyPublicLink={onCopyPublicLink}
              generatePublicLink={generatePublicLink}
              isTournamentFinished={isTournamentFinished}
              winner={winner}
              tournamentWinner={tournamentWinner}
              onShowWinnerScreen={onShowWinnerScreen}
              onBackToHome={onBackToHome}
            />
          ) : (
            <div className="no-tournament-selected">
              <h2>Selecciona una Reta</h2>
              <p>
                Elige una reta del panel para comenzar a gestionar partidos y resultados.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MainLayout;
