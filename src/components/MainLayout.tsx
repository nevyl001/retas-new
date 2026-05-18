import React from "react";
import { Tournament, Player, Pair, Match } from "../lib/database";
import { continueTournament } from "../lib/tournamentRouting";
import { TournamentWinner } from "./TournamentWinnerCalculator";
import { TournamentManager } from "./TournamentManager";
import TournamentDetails from "./TournamentDetails";
import { HomeDashboard } from "./home/HomeDashboard";

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
  onStartTournament: (opts: {
    format: "roundRobin" | "teams";
    teamsCount?: number;
    teamNames?: string[];
    pairToTeam?: Record<string, number>;
  }) => void;
  onCopyPublicLink: (tournamentId: string, teamConfig?: { teamNames: string[]; pairToTeam: Record<string, number> } | null) => void;
  generatePublicLink: (tournamentId: string, teamConfig?: { teamNames: string[]; pairToTeam: Record<string, number> } | null) => string;

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
  const [showAllRetas, setShowAllRetas] = React.useState(false);

  const handleTournamentSelect = React.useCallback(
    (tournament: Tournament | null) => {
      if (!tournament) {
        onTournamentSelect(null);
        return;
      }
      if (userId) {
        continueTournament(tournament, {
          userId,
          onSelectMain: onTournamentSelect,
        });
        return;
      }
      onTournamentSelect(tournament);
    },
    [userId, onTournamentSelect]
  );

  return (
    <div className="container">
      {loading && (
        <div className="loading">
          <p>⏳ Cargando...</p>
        </div>
      )}

      <div className="main-layout">
        {!selectedTournament ? (
          <>
            <HomeDashboard
              userId={userId}
              onTournamentSelect={handleTournamentSelect}
              onShowAllRetas={() => setShowAllRetas((v) => !v)}
            />
            {showAllRetas && (
              <div className="reta-management-section reta-management-section--v2">
                <TournamentManager
                  onTournamentSelect={handleTournamentSelect}
                  onBack={() => setShowAllRetas(false)}
                />
              </div>
            )}
          </>
        ) : (
          <div className="reta-content riviera-organizer-reta">
            <div className="reta-content__toolbar riviera-back-toolbar">
              <button
                type="button"
                className="riviera-btn-back"
                onClick={() => {
                  onTournamentSelect(null);
                  onBackToHome();
                }}
              >
                ← Volver al inicio
              </button>
            </div>
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
          </div>
        )}
      </div>
    </div>
  );
};

export default MainLayout;
