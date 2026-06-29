import React from "react";
import {
  Tournament,
  Player,
  Pair,
  Match,
} from "../lib/database";
import type { AmericanoDinamicoSnapshotV1 } from "../lib/americanoDinamicoStorage";
import { loadAmericanoDinamicoSnapshotMerged } from "../lib/americanoDinamicoSync";
import { TournamentWinner } from "../lib/tournamentWinner";
import FourComponentsGrid from "./FourComponentsGrid";
import StartTournamentSection from "./StartTournamentSection";
import PublicLinkSection from "./PublicLinkSection";
import PairsDisplay from "./PairsDisplay";
import MatchesSection from "./MatchesSection";
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
  const [americanoRemoteLoading, setAmericanoRemoteLoading] =
    React.useState(false);

  const isAmericanoShell =
    selectedTournament.is_started &&
    pairs.length === 0 &&
    matches.length === 0;

  /** localStorage + Supabase `americano_live` (fuente de verdad en nube). */
  const refreshAmericanoSnapshot = React.useCallback(async () => {
    if (!selectedTournament?.id) {
      setAmericanoSnapshot(null);
      return;
    }
    const { snapshot } = await loadAmericanoDinamicoSnapshotMerged(
      selectedTournament.id
    );
    setAmericanoSnapshot(snapshot);
  }, [selectedTournament?.id]);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setAmericanoRemoteLoading(isAmericanoShell);
      await refreshAmericanoSnapshot();
      if (!cancelled) setAmericanoRemoteLoading(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    refreshAmericanoSnapshot,
    isAmericanoShell,
    forceRefresh,
    selectedTournament.is_finished,
    selectedTournament.updated_at,
    selectedTournament.id,
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
      {!americanoSnapshot && !(isAmericanoShell && americanoRemoteLoading) && (
        <PairsDisplay pairs={pairs} pairStats={pairStats} />
      )}

      {isAmericanoShell && americanoRemoteLoading && (
        <div className="tournament-details__americano-wait">
          Cargando resultados del Americano…
        </div>
      )}

      {americanoSnapshot && (
        <AmericanoTournamentSummary
          snapshot={americanoSnapshot}
          tournamentId={selectedTournament.id}
        />
      )}

      {isAmericanoShell &&
        !americanoRemoteLoading &&
        !americanoSnapshot && (
          <div className="tournament-details__americano-miss">
            <p>
              <strong>No hay snapshot de Americano dinámico</strong> para esta
              reta en este navegador ni en la nube.
            </p>
            <p>
              Abre el torneo en <strong>Americano dinámico</strong> unos segundos
              (con la sesión del organizador) para que se guarde en Supabase, o
              revisa en Supabase la columna <code>americano_live</code> en{" "}
              <code>tournament_public_config</code>.
            </p>
            <p>
              <a
                className="tournament-details__americano-link"
                href={`/americano-dinamico?tournamentId=${encodeURIComponent(
                  selectedTournament.id
                )}`}
              >
                Abrir Americano dinámico
              </a>
            </p>
          </div>
        )}

      {!americanoSnapshot && !(isAmericanoShell && americanoRemoteLoading) && (
        <MatchesSection
          tournament={selectedTournament}
          matches={matches}
          pairs={pairs}
          matchesByRound={matchesByRound}
          forceRefresh={forceRefresh}
          setForceRefresh={setForceRefresh}
          isTournamentFinished={isTournamentFinished}
          winner={winner}
          tournamentWinner={tournamentWinner}
          onShowWinnerScreen={onShowWinnerScreen}
          onBackToHome={onBackToHome}
          onReloadMatches={loadTournamentData}
          userId={userId}
        />
      )}
    </div>
  );
};

export default TournamentDetails;
