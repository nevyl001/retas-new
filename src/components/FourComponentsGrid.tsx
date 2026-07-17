import React, { useCallback, useMemo } from "react";
import { Tournament, Player, Pair, Match } from "../lib/database";
import { useUser } from "../contexts/UserContext";
import { useOrganizerPlayerPool } from "../hooks/useOrganizerPlayerPool";
import { useRetaAbiertaRealtime } from "../lib/retaAbierta/useRetaAbiertaRealtime";
import { ModernPlayerManager } from "./ModernPlayerManager";
import { NewPairManager } from "./NewPairManager";
import { TournamentStatusContent } from "./TournamentStatusContent";
import { DebugPanelContent } from "./DebugPanelContent";
import { RetaConfigPanel } from "./reta/RetaConfigPanel";
import { testConnection } from "../lib/supabaseClient";
import { usePlayerValidation } from "../hooks/usePlayerValidation";
import {
  QuickModeAccordion,
  QuickModeAccordionItem,
} from "./platform/quickMode";

function isDevToolsVisible(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("dev") === "1") return true;
    if (window.localStorage.getItem("riviera_dev_tools") === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

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
  /** Actualiza el torneo en el padre tras editar configuración */
  onTournamentPatched?: (tournament: Tournament) => void;
  /** Slot Convocatoria (sube en jerarquía del flujo de preparación). */
  convocatoriaSlot?: React.ReactNode;
}

export const FourComponentsGrid: React.FC<FourComponentsGridProps> = ({
  selectedTournament,
  pairs,
  matches,
  showPlayerManager: _showPlayerManager,
  setShowPlayerManager: _setShowPlayerManager,
  showPairManager: _showPairManager,
  setShowPairManager: _setShowPairManager,
  showTournamentStatus: _showTournamentStatus,
  setShowTournamentStatus: _setShowTournamentStatus,
  showDebugInfo: _showDebugInfo,
  setShowDebugInfo: _setShowDebugInfo,
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
  onTournamentPatched,
  convocatoriaSlot,
}) => {
  const { user } = useUser();
  const { validatePlayerSelection } = usePlayerValidation();
  const showDevTools = isDevToolsVisible();
  const isStarted = Boolean(selectedTournament.is_started);

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

  const availablePlayers = Math.max(0, playerPool.length - playersInPairs.length);

  /* Mobile tab filter keeps legacy narrow surfaces */
  if (mobileFilter === "jugadores") {
    return (
      <div className="four-components-grid qm-prep">
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
        <NewPairManager
          pairs={pairs}
          onPairUpdate={updatePairPlayers}
          onPairDelete={deletePair}
          players={playerPool}
          loading={playerPoolLoading}
        />
      </div>
    );
  }

  if (mobileFilter === "config") {
    return (
      <div className="four-components-grid qm-prep">
        <RetaConfigPanel
          tournament={selectedTournament}
          matches={matches}
          pairsCount={pairs.length}
          onSaved={(t) => {
            onTournamentPatched?.(t);
            loadTournamentData();
            setForceRefresh((prev) => prev + 1);
          }}
        />
        <TournamentStatusContent
          tournament={selectedTournament}
          pairsCount={pairs.length}
          loading={loading}
          onReset={onReset}
        />
      </div>
    );
  }

  /* Live competition: only control surface (reset / estado) */
  if (isStarted) {
    return (
      <div className="four-components-grid qm-prep">
        <QuickModeAccordion defaultOpenId="control">
          <QuickModeAccordionItem
            id="control"
            title="Control de competencia"
            subtitle="Estado y acciones del evento"
          >
            <TournamentStatusContent
              tournament={selectedTournament}
              pairsCount={pairs.length}
              loading={loading}
              onReset={onReset}
            />
          </QuickModeAccordionItem>
          {showDevTools ? (
            <QuickModeAccordionItem
              id="debug"
              title="Herramientas de desarrollo"
              subtitle="Solo visible en modo desarrollador"
            >
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
            </QuickModeAccordionItem>
          ) : null}
        </QuickModeAccordion>
      </div>
    );
  }

  return (
    <div className="four-components-grid qm-prep">
      <QuickModeAccordion defaultOpenId="registro">
        <QuickModeAccordionItem
          id="registro"
          title="Registro"
          subtitle="Jugadores del club y selección"
          meta={`${playerPool.length}`}
        >
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
        </QuickModeAccordionItem>

        <QuickModeAccordionItem
          id="equipos"
          title="Equipos"
          subtitle="Parejas listas para competir"
          meta={`${pairs.length} · disp. ${availablePlayers}`}
        >
          <NewPairManager
            pairs={pairs}
            onPairUpdate={updatePairPlayers}
            onPairDelete={deletePair}
            players={playerPool}
            loading={playerPoolLoading}
          />
        </QuickModeAccordionItem>

        {convocatoriaSlot ? (
          <QuickModeAccordionItem
            id="convocatoria"
            title="Convocatoria"
            subtitle="Cupo, link y confirmados"
          >
            {convocatoriaSlot}
          </QuickModeAccordionItem>
        ) : null}

        <QuickModeAccordionItem
          id="detalles"
          title="Detalles"
          subtitle="Nombre, fecha y canchas"
        >
          <RetaConfigPanel
            tournament={selectedTournament}
            matches={matches}
            pairsCount={pairs.length}
            onSaved={(t) => {
              onTournamentPatched?.(t);
              loadTournamentData();
              setForceRefresh((prev) => prev + 1);
            }}
          />
        </QuickModeAccordionItem>

        {showDevTools ? (
          <QuickModeAccordionItem
            id="debug"
            title="Herramientas de desarrollo"
            subtitle="Solo visible en modo desarrollador (?dev=1)"
          >
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
          </QuickModeAccordionItem>
        ) : null}
      </QuickModeAccordion>
    </div>
  );
};

export default FourComponentsGrid;
