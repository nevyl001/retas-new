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
      <h1>🏆 ¡Organiza tu Reta de Pádel y ¡Que Gane el Mejor! 🏅</h1>

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
              <h2>🏆 Bienvenido al Gestor de Retas</h2>
              <p>
                Selecciona una reta del panel para comenzar a gestionar partidos
                y resultados.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MainLayout;
