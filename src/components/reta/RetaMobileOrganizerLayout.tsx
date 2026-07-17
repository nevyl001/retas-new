import React, { useMemo, useState } from "react";
import type { Tournament, Player, Pair, Match } from "../../lib/database";
import type { AmericanoDinamicoSnapshotV1 } from "../../lib/americanoDinamicoStorage";
import { useClubModeEyebrow } from "../../club-experience";
import { getStartFormatLabel, resolveTournamentStartFormat } from "../../lib/gameModeMapping";
import { useMobileViewport } from "../../hooks/useMobileViewport";
import {
  resolveRetaNextAction,
  resolveRetaStatusLabel,
  resolveRetaSummary,
  type RetaMobileTabId,
} from "../../lib/modePresentation/retaNextAction";
import {
  ModeEventHeader,
  ModeSectionPanel,
  ModeSectionTabs,
  MobileStickyActionFooter,
} from "../platform";
import FourComponentsGrid from "../FourComponentsGrid";
import StartTournamentSection from "../StartTournamentSection";
import RoundRobinPrepWorkspace from "../RoundRobinPrepWorkspace";
import PublicLinkSection from "../PublicLinkSection";
import { RetaAbiertaOrganizerPanel } from "../reta-abierta/RetaAbiertaOrganizerPanel";
import PairsDisplay from "../PairsDisplay";
import MatchesSection from "../MatchesSection";
import { AmericanoTournamentSummary } from "../AmericanoDinamico/AmericanoTournamentSummary";
import { TournamentStatusContent, RetaConfigDangerReset } from "../TournamentStatusContent";
import { DebugPanelContent } from "../DebugPanelContent";
import RealTimeStandingsTable from "../RealTimeStandingsTable";
import { testConnection } from "../../lib/supabaseClient";
import { Button } from "../ui";
import { useResolvedTeamConfig } from "../../hooks/useResolvedTeamConfig";

const RETA_TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "partidos", label: "Partidos" },
  { id: "clasificacion", label: "Clasificación" },
  { id: "jugadores", label: "Jugadores" },
  { id: "configuracion", label: "Config." },
] as const;

export interface RetaMobileOrganizerLayoutProps {
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
  isCreatingPair?: boolean;
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
  onCopyPublicLink: (
    tournamentId: string,
    teamConfig?: { teamNames: string[]; pairToTeam: Record<string, number> } | null
  ) => void;
  generatePublicLink: (
    tournamentId: string,
    teamConfig?: { teamNames: string[]; pairToTeam: Record<string, number> } | null
  ) => string;
  onBackToHome: () => void;
  isAmericanoShell: boolean;
  americanoSnapshot: AmericanoDinamicoSnapshotV1 | null;
  americanoRemoteLoading: boolean;
  desktopContent: React.ReactNode;
}

export const RetaMobileOrganizerLayout: React.FC<RetaMobileOrganizerLayoutProps> = ({
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
  setShowDebugInfo,
  selectedPlayers,
  setSelectedPlayers,
  setError,
  addPair,
  isCreatingPair = false,
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
  onBackToHome,
  isAmericanoShell,
  americanoSnapshot,
  americanoRemoteLoading,
  desktopContent,
}) => {
  const isMobile = useMobileViewport(767);
  const modeEyebrow = useClubModeEyebrow();
  const teamConfig = useResolvedTeamConfig(selectedTournament, pairs);
  const [activeTab, setActiveTab] = useState<RetaMobileTabId>("resumen");

  const playersCount = selectedPlayers.length;
  const status = resolveRetaStatusLabel(selectedTournament);
  const nextAction = resolveRetaNextAction({
    is_started: selectedTournament.is_started,
    is_finished: selectedTournament.is_finished,
    pairsCount: pairs.length,
    playersCount,
  });
  const summary = resolveRetaSummary({
    is_started: selectedTournament.is_started,
    is_finished: selectedTournament.is_finished,
    pairsCount: pairs.length,
    playersCount,
    matchesCount: matches.length,
  });

  const modality = useMemo(
    () => getStartFormatLabel(selectedTournament.format === "teams" ? "teams" : "roundRobin"),
    [selectedTournament.format]
  );

  React.useEffect(() => {
    if (isMobile) {
      setShowPlayerManager(true);
      setShowPairManager(true);
    }
  }, [isMobile, setShowPlayerManager, setShowPairManager]);

  if (!isMobile) {
    return <>{desktopContent}</>;
  }

  const isRoundRobinPrep =
    !selectedTournament.is_started &&
    resolveTournamentStartFormat(selectedTournament) === "roundRobin";

  if (isRoundRobinPrep) {
    return (
      <RoundRobinPrepWorkspace
        tournament={selectedTournament}
        pairs={pairs}
        matches={matches}
        loading={loading}
        selectedPlayers={selectedPlayers}
        setSelectedPlayers={setSelectedPlayers}
        setError={setError}
        addPair={addPair}
        isCreatingPair={isCreatingPair}
        updatePairPlayers={updatePairPlayers}
        deletePair={deletePair}
        userId={userId}
        loadTournamentData={loadTournamentData}
        setForceRefresh={setForceRefresh}
        onStartTournament={(opts) => onStartTournament(opts)}
        onReset={onReset}
      />
    );
  }

  const showMatchesPanels = !americanoSnapshot && !(isAmericanoShell && americanoRemoteLoading);
  const stickyLabel =
    !selectedTournament.is_started && pairs.length >= 2
      ? "Iniciar torneo"
      : selectedTournament.is_started && !selectedTournament.is_finished
        ? "Ver partidos"
        : null;

  return (
    <div className="mode-mobile-shell mode-mobile-shell--tabbed reta-mobile-shell">
      <ModeEventHeader
        eyebrow={modeEyebrow}
        title={selectedTournament.name}
        modality={modality}
        statusLabel={status.label}
        statusVariant={status.variant}
        summary={summary}
        nextActionLabel={nextAction?.label}
        onNextAction={
          nextAction ? () => setActiveTab(nextAction.tabId) : undefined
        }
      />

      <ModeSectionTabs
        tabs={[...RETA_TABS]}
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as RetaMobileTabId)}
        ariaLabel="Secciones de la reta"
      />

      <ModeSectionPanel id="resumen" activeId={activeTab}>
        <StartTournamentSection
          tournament={selectedTournament}
          pairs={pairs}
          loading={loading}
          onStartTournament={onStartTournament}
        />
        <RetaAbiertaOrganizerPanel tournament={selectedTournament} />
        <PublicLinkSection
          tournament={selectedTournament}
          onCopyPublicLink={onCopyPublicLink}
          generatePublicLink={generatePublicLink}
        />
        {showMatchesPanels && (
          <PairsDisplay pairs={pairs} pairStats={pairStats} teamConfig={teamConfig} />
        )}
        {isAmericanoShell && americanoRemoteLoading && (
          <p className="home-muted">Cargando resultados del Americano…</p>
        )}
        {americanoSnapshot && (
          <AmericanoTournamentSummary
            snapshot={americanoSnapshot}
            tournamentId={selectedTournament.id}
          />
        )}
      </ModeSectionPanel>

      {showMatchesPanels && (
        <>
          <ModeSectionPanel id="partidos" activeId={activeTab}>
            {selectedTournament.is_started ? (
              <MatchesSection
                tournament={selectedTournament}
                matches={matches}
                pairs={pairs}
                matchesByRound={matchesByRound}
                forceRefresh={forceRefresh}
                setForceRefresh={setForceRefresh}
                onBackToHome={onBackToHome}
                onReloadMatches={loadTournamentData}
                userId={userId}
                hideStandings
                hideBackButton
              />
            ) : (
              <p className="home-muted">Inicia el torneo para ver los partidos.</p>
            )}
          </ModeSectionPanel>

          <ModeSectionPanel id="clasificacion" activeId={activeTab}>
            {selectedTournament.is_started ? (
              <RealTimeStandingsTable
                tournamentId={selectedTournament.id}
                forceRefresh={forceRefresh}
                teamConfig={teamConfig}
              />
            ) : (
              <p className="home-muted">
                La clasificación aparecerá cuando existan resultados.
              </p>
            )}
          </ModeSectionPanel>
        </>
      )}

      <ModeSectionPanel id="jugadores" activeId={activeTab}>
        <FourComponentsGrid
          selectedTournament={selectedTournament}
          pairs={pairs}
          matches={matches}
          showPlayerManager={showPlayerManager}
          setShowPlayerManager={setShowPlayerManager}
          showPairManager={showPairManager}
          setShowPairManager={setShowPairManager}
          showTournamentStatus={false}
          setShowTournamentStatus={setShowTournamentStatus}
          showDebugInfo={false}
          setShowDebugInfo={setShowDebugInfo}
          selectedPlayers={selectedPlayers}
          setSelectedPlayers={setSelectedPlayers}
          setError={setError}
          addPair={addPair}
          isCreatingPair={isCreatingPair}
          updatePairPlayers={updatePairPlayers}
          deletePair={deletePair}
          loading={loading}
          onReset={onReset}
          loadTournamentData={loadTournamentData}
          setForceRefresh={setForceRefresh}
          mobileFilter="jugadores"
          userId={userId}
        />
      </ModeSectionPanel>

      <ModeSectionPanel id="configuracion" activeId={activeTab}>
        <TournamentStatusContent
          tournament={selectedTournament}
          pairsCount={pairs.length}
          loading={loading}
          onReset={onReset}
          showReset={false}
          compact
        />
        <RetaConfigDangerReset loading={loading} onReset={onReset} />
        <details className="reta-config-debug">
          <summary className="reta-config-debug__summary">
            Herramientas avanzadas
          </summary>
          <div className="reta-config-debug__body">
            <DebugPanelContent
              status={selectedTournament.is_started ? "✅ Iniciado" : "⏳ Pendiente"}
              pairsCount={pairs.length}
              matchesCount={matches.length}
              onTestConnection={async () => {
                const result = await testConnection();
                alert(result ? "✅ Conexión exitosa" : "❌ Error de conexión");
              }}
              onReloadData={() => {
                loadTournamentData();
                setForceRefresh((prev) => prev + 1);
              }}
              onVerifyStatus={async () => {
                alert(
                  `Parejas: ${pairs.length}\nPartidos: ${matches.length}`
                );
              }}
            />
          </div>
        </details>
      </ModeSectionPanel>

      {stickyLabel ? (
        <MobileStickyActionFooter>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              if (!selectedTournament.is_started) {
                setActiveTab("resumen");
                document
                  .querySelector(".start-tournament-section")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
                return;
              }
              setActiveTab("partidos");
            }}
          >
            {stickyLabel}
          </Button>
        </MobileStickyActionFooter>
      ) : null}
    </div>
  );
};
