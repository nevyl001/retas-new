import React from "react";
import { Tournament, Player, Pair, Match } from "../lib/database";
import { TournamentWinner } from "./TournamentWinnerCalculator";
import FourComponentsGrid from "./FourComponentsGrid";
import StartTournamentSection from "./StartTournamentSection";
import PublicLinkSection from "./PublicLinkSection";
import PairsDisplay from "./PairsDisplay";
import MatchesSection from "./MatchesSection";

interface TournamentDetailsProps {
  selectedTournament: Tournament;
  pairs: Pair[];
  matches: Match[];
  pairStats: Map<string, { sets: number; matches: number; points: number }>;
  matchesByRound: Record<number, Match[]>;
  loading: boolean;
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
  onReset: () => Promise<void>;
  loadTournamentData: () => void;
  setForceRefresh: React.Dispatch<React.SetStateAction<number>>;
  forceRefresh: number;
  onStartTournament: () => void;
  onCopyPublicLink: (tournamentId: string) => void;
  generatePublicLink: (tournamentId: string) => string;
  isTournamentFinished: boolean;
  winner: Pair | null;
  tournamentWinner: TournamentWinner | null;
  onShowWinnerScreen: () => void;
  onBackToHome: () => void;
}

export const TournamentDetails: React.FC<TournamentDetailsProps> = ({
  selectedTournament,
  pairs,
  matches,
  pairStats,
  matchesByRound,
  loading,
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
    <div className="tournament-details">
      {/* Cuadrícula de 4 Componentes Uniformes */}
      <FourComponentsGrid
        selectedTournament={selectedTournament}
        pairs={pairs}
        matches={matches}
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
        loading={loading}
        onReset={onReset}
        loadTournamentData={loadTournamentData}
        setForceRefresh={setForceRefresh}
      />

      {/* Sección para iniciar torneo */}
      <StartTournamentSection
        tournament={selectedTournament}
        pairs={pairs}
        loading={loading}
        onStartTournament={onStartTournament}
      />

      {/* Sección de Enlace Público */}
      <PublicLinkSection
        tournament={selectedTournament}
        onCopyPublicLink={onCopyPublicLink}
        generatePublicLink={generatePublicLink}
      />

      {/* Mostrar parejas creadas */}
      <PairsDisplay pairs={pairs} pairStats={pairStats} />

      {/* Lista de partidos y clasificación */}
      <MatchesSection
        tournament={selectedTournament}
        matches={matches}
        matchesByRound={matchesByRound}
        forceRefresh={forceRefresh}
        setForceRefresh={setForceRefresh}
        isTournamentFinished={isTournamentFinished}
        winner={winner}
        onShowWinnerScreen={onShowWinnerScreen}
        onBackToHome={onBackToHome}
      />
    </div>
  );
};

export default TournamentDetails;
