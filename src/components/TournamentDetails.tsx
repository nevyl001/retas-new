import React from "react";
import {
  Tournament,
  Player,
  Pair,
  Match,
  fetchAmericanoLivePublic,
} from "../lib/database";
import { TournamentWinner } from "./TournamentWinnerCalculator";
import FourComponentsGrid from "./FourComponentsGrid";
import StartTournamentSection from "./StartTournamentSection";
import PublicLinkSection from "./PublicLinkSection";
import PairsDisplay from "./PairsDisplay";
import MatchesSection from "./MatchesSection";
import {
  loadAmericanoDinamicoSnapshot,
  type AmericanoDinamicoSnapshotV1,
} from "../lib/americanoDinamicoStorage";
import { AmericanoTournamentSummary } from "./AmericanoDinamico/AmericanoTournamentSummary";

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
  userId?: string;
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
  userId,
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
  const [americanoSnapshot, setAmericanoSnapshot] =
    React.useState<AmericanoDinamicoSnapshotV1 | null>(null);

  /** localStorage (mismo navegador) + Supabase `americano_live` para ver el resumen en cualquier dispositivo. */
  const refreshAmericanoSnapshot = React.useCallback(async () => {
    if (!selectedTournament?.id) {
      setAmericanoSnapshot(null);
      return;
    }
    const id = selectedTournament.id;
    const local = loadAmericanoDinamicoSnapshot(id);
    try {
      const remote = await fetchAmericanoLivePublic(id);
      if (remote.status === "ok") {
        const r = remote.snapshot;
        if (!local) {
          setAmericanoSnapshot(r);
          return;
        }
        const tLocal = new Date(local.savedAt).getTime();
        const tRemote = new Date(r.savedAt).getTime();
        setAmericanoSnapshot(
          !Number.isNaN(tRemote) && tRemote >= tLocal ? r : local
        );
        return;
      }
    } catch {
      /* red o Supabase: seguimos con local si existe */
    }
    setAmericanoSnapshot(local);
  }, [selectedTournament?.id]);

  React.useEffect(() => {
    void refreshAmericanoSnapshot();
  }, [
    refreshAmericanoSnapshot,
    forceRefresh,
    selectedTournament.is_finished,
    selectedTournament.updated_at,
  ]);

  React.useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ tournamentId?: string }>;
      if (ce.detail?.tournamentId === selectedTournament.id) {
        void refreshAmericanoSnapshot();
      }
    };
    window.addEventListener("americano-dinamico-snapshot", handler);
    return () => window.removeEventListener("americano-dinamico-snapshot", handler);
  }, [selectedTournament.id, refreshAmericanoSnapshot]);

  return (
    <div className="tournament-details">
      {/* Sección para iniciar torneo */}
      <StartTournamentSection
        tournament={selectedTournament}
        pairs={pairs}
        loading={loading}
        onStartTournament={onStartTournament}
      />

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

      {/* Sección de Enlace Público */}
      <PublicLinkSection
        tournament={selectedTournament}
        onCopyPublicLink={onCopyPublicLink}
        generatePublicLink={generatePublicLink}
      />

      {/* Americano dinámico no usa parejas/partidos clásicos en BD; evitar UI vacía engañosa */}
      {!americanoSnapshot && (
        <PairsDisplay pairs={pairs} pairStats={pairStats} />
      )}

      {americanoSnapshot && (
        <AmericanoTournamentSummary snapshot={americanoSnapshot} />
      )}

      {!americanoSnapshot && (
        <MatchesSection
          tournament={selectedTournament}
          matches={matches}
          pairs={pairs}
          matchesByRound={matchesByRound}
          forceRefresh={forceRefresh}
          setForceRefresh={setForceRefresh}
          isTournamentFinished={isTournamentFinished}
          winner={winner}
          onShowWinnerScreen={onShowWinnerScreen}
          onBackToHome={onBackToHome}
          userId={userId}
        />
      )}
    </div>
  );
};

export default TournamentDetails;
