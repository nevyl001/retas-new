import React from "react";
import {
  useClubModeEyebrow,
  useConvocatoriaOriginName,
} from "../../club-experience";
import { useMobileViewport } from "../../hooks/useMobileViewport";
import {
  resolveAmericanoNextAction,
  resolveAmericanoStatusLabel,
  resolveAmericanoSummary,
  type AmericanoMobileTabId,
} from "../../lib/modePresentation/americanoNextAction";
import { useAmericanoDinamico } from "../../hooks/useAmericanoDinamico";
import { PlayerRegistration } from "./PlayerRegistration";
import { RoundView } from "./RoundView";
import { LiveRanking } from "./LiveRanking";
import { RoundHistory } from "./RoundHistory";
import {
  getPlayers,
  getTournamentById,
  updateTournament,
  type Player,
} from "../../lib/database";
import { persistAmericanoDinamicoSnapshot } from "../../lib/americanoDinamicoSync";
import { resolvePlayerAvatars } from "../../lib/rivieraJugadores/publicPlayerAvatars";
import { useUser } from "../../contexts/UserContext";
import { PublicAmericanoPodiumCard } from "../public/PublicAmericanoPodiumCard";
import { navigateToAppHome } from "../../lib/appRouting";
import {
  buildAmericanoDinamicoSnapshot,
  clearAmericanoDinamicoSnapshot,
  loadAmericanoDinamicoSnapshot,
  markTournamentAsAmericano,
  persistAmericanoActiveTournamentId,
  resolveAmericanoTournamentId,
  saveAmericanoDinamicoSnapshot,
} from "../../lib/americanoDinamicoStorage";
import { ModeHeader } from "../platform/ModeHeader";
import {
  ModeEventHeader,
  ModeSectionPanel,
  ModeSectionTabs,
} from "../platform";
import { PublicShareSection } from "../platform/PublicShareSection";
import { AmericanoModeShell } from "./AmericanoModeShell";
import { ConvocatoriaWhatsAppPanel } from "../reta-abierta/ConvocatoriaWhatsAppPanel";
import { buildTournamentConvocatoriaContext } from "../../lib/retaAbierta/adapters";
import { closeOpenGameRegistration } from "../../lib/retaAbierta/retaAbiertaService";
import "../public/riviera-public-americano.css";
import "./AmericanoDinamicoScreen.css";

interface AmericanoDinamicoScreenProps {
  userId?: string | null;
  tournamentId?: string | null;
  onTournamentStatusChange?: (updates: {
    is_started?: boolean;
    is_finished?: boolean;
    courts?: number;
  }) => void;
}

export const AmericanoDinamicoScreen: React.FC<AmericanoDinamicoScreenProps> = ({
  userId,
  tournamentId,
  onTournamentStatusChange,
}) => {
  const { user } = useUser();
  const modeEyebrow = useClubModeEyebrow();
  const convocatoriaOrigin = useConvocatoriaOriginName();
  const isMobile = useMobileViewport(767);
  const [playingTab, setPlayingTab] = React.useState<AmericanoMobileTabId>("ronda");
  const resolvedTournamentId = resolveAmericanoTournamentId(tournamentId);
  const effectiveUserId = userId || user?.id || null;
  const [availablePlayers, setAvailablePlayers] = React.useState<Player[]>([]);
  const [playersLoadError, setPlayersLoadError] = React.useState<string | null>(
    null
  );
  const [tournamentName, setTournamentName] = React.useState<string>("");
  const [tournamentDescription, setTournamentDescription] =
    React.useState<string>("");
  const [tournamentCourts, setTournamentCourts] = React.useState(2);
  const finishedPersistedRef = React.useRef(false);

  const {
    players,
    rounds,
    phase,
    ranking,
    rosterForUi,
    currentRound,
    totalRounds,
    removePlayer,
    toggleExistingPlayer,
    startTournament,
    commitRoundScores,
    editScore,
    nextRound,
    hydrating,
    remoteSyncReady,
    participacionSyncError,
    retryParticipacionSync,
  } = useAmericanoDinamico(tournamentId ?? null, {
    organizadorId: effectiveUserId,
    sessionLabel: tournamentName || "Sesión",
  });

  React.useEffect(() => {
    if (!resolvedTournamentId) return;
    persistAmericanoActiveTournamentId(resolvedTournamentId);
    markTournamentAsAmericano(resolvedTournamentId);
  }, [resolvedTournamentId]);

  const publicAmericanoUrl = React.useMemo(
    () =>
      resolvedTournamentId && typeof window !== "undefined"
        ? `${window.location.origin}/public/americano/${resolvedTournamentId}`
        : "",
    [resolvedTournamentId]
  );

  React.useEffect(() => {
    if (!resolvedTournamentId) return;
    let cancelled = false;
    (async () => {
      try {
        const t = await getTournamentById(resolvedTournamentId);
        if (cancelled || !t) return;
        setTournamentName(typeof t.name === "string" ? t.name.trim() : "");
        setTournamentDescription(
          typeof t.description === "string" ? t.description.trim() : ""
        );
        const loadedCourts = Math.max(1, Math.floor(Number(t.courts)) || 1);
        setTournamentCourts(loadedCourts);
      } catch {
        if (!cancelled) {
          setTournamentName("");
          setTournamentDescription("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedTournamentId]);

  React.useEffect(() => {
    if (!effectiveUserId) return;
    let cancelled = false;
    (async () => {
      try {
        setPlayersLoadError(null);
        const data = await getPlayers(
          effectiveUserId,
          resolvedTournamentId || undefined
        );
        if (!cancelled) setAvailablePlayers(data || []);
      } catch {
        if (!cancelled) {
          setAvailablePlayers([]);
          setPlayersLoadError(
            "No se pudieron cargar los jugadores desde la base de datos."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveUserId, resolvedTournamentId]);

  /** Registro: guardar borrador en el mismo frame que la UI (F5 inmediato). */
  React.useLayoutEffect(() => {
    if (!resolvedTournamentId || phase !== "registration") return;
    if (players.length === 0) return;
    const draft = buildAmericanoDinamicoSnapshot(
      players,
      [],
      "registration",
      0
    );
    saveAmericanoDinamicoSnapshot(resolvedTournamentId, draft, {
      skipDispatch: true,
    });
  }, [resolvedTournamentId, phase, players]);

  /** Playing/finished: localStorage síncrono en cada commit (sin esperar 250 ms). */
  React.useLayoutEffect(() => {
    if (!resolvedTournamentId || rounds.length === 0) return;
    if (phase !== "playing" && phase !== "finished") return;
    const snap = buildAmericanoDinamicoSnapshot(
      ranking,
      rounds,
      phase,
      totalRounds,
      rosterForUi
    );
    saveAmericanoDinamicoSnapshot(resolvedTournamentId, snap, {
      skipDispatch: true,
    });
  }, [resolvedTournamentId, phase, rounds, ranking, totalRounds, rosterForUi]);

  /** Registro: borrador → local + Supabase. */
  React.useEffect(() => {
    if (!resolvedTournamentId || phase !== "registration") return;
    const t = window.setTimeout(() => {
      if (players.length === 0) {
        const existing = loadAmericanoDinamicoSnapshot(resolvedTournamentId);
        if (
          existing?.rounds?.length ||
          existing?.tournamentPhase === "playing" ||
          existing?.tournamentPhase === "finished"
        ) {
          return;
        }
        clearAmericanoDinamicoSnapshot(resolvedTournamentId);
        return;
      }
      const draft = buildAmericanoDinamicoSnapshot(
        players,
        [],
        "registration",
        0
      );
      void persistAmericanoDinamicoSnapshot(resolvedTournamentId, draft, {
        skipDispatch: true,
      });
    }, 400);
    return () => window.clearTimeout(t);
  }, [resolvedTournamentId, phase, players]);

  /** Playing/finished: local inmediato + Supabase (debounced). */
  React.useEffect(() => {
    if (!resolvedTournamentId || rounds.length === 0) return;
    if (phase !== "playing" && phase !== "finished") return;
    const snap = buildAmericanoDinamicoSnapshot(
      ranking,
      rounds,
      phase,
      totalRounds,
      rosterForUi
    );
    const t = window.setTimeout(() => {
      void persistAmericanoDinamicoSnapshot(resolvedTournamentId, snap);
    }, 450);
    return () => window.clearTimeout(t);
  }, [resolvedTournamentId, phase, rounds, ranking, totalRounds, rosterForUi]);

  const goBackToRetas = React.useCallback(() => {
    navigateToAppHome();
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

  const handleStartTournament = React.useCallback(
    async (totalRounds: number, courts: number) => {
      startTournament(totalRounds, courts);
      finishedPersistedRef.current = false;
      if (!resolvedTournamentId) return;
      try {
        const safeCourts = Math.max(1, Math.floor(courts) || 1);
        await updateTournament(resolvedTournamentId, {
          is_started: true,
          is_finished: false,
          courts: safeCourts,
        });
        await closeOpenGameRegistration("americano", resolvedTournamentId);
        onTournamentStatusChange?.({
          is_started: true,
          is_finished: false,
          courts: safeCourts,
        });
      } catch (e) {
        // Si falla persistencia, no bloqueamos el torneo local.
        console.warn("No se pudo marcar la reta como iniciada:", e);
      }
    },
    [startTournament, resolvedTournamentId, onTournamentStatusChange]
  );

  React.useEffect(() => {
    if (phase !== "finished" || !resolvedTournamentId || finishedPersistedRef.current)
      return;
    let cancelled = false;
    (async () => {
      try {
        await updateTournament(resolvedTournamentId, {
          is_started: true,
          is_finished: true,
        });
        if (!cancelled) {
          finishedPersistedRef.current = true;
          onTournamentStatusChange?.({ is_started: true, is_finished: true });
        }
      } catch (e) {
        console.warn("No se pudo marcar la reta como finalizada:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, resolvedTournamentId, onTournamentStatusChange]);

  const podiumPlayers = React.useMemo(
    () => ranking.slice(0, 3),
    [ranking]
  );
  const [podiumAvatars, setPodiumAvatars] = React.useState<
    Record<string, string | null>
  >({});

  React.useEffect(() => {
    if (!effectiveUserId || podiumPlayers.length === 0 || phase !== "finished") {
      setPodiumAvatars({});
      return;
    }
    let cancelled = false;
    void resolvePlayerAvatars(
      effectiveUserId,
      podiumPlayers.map((p) => ({ id: p.id, name: p.name }))
    ).then((map) => {
      if (!cancelled) setPodiumAvatars(map);
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveUserId, phase, podiumPlayers]);

  const tournamentBanner =
    tournamentName || tournamentDescription ? (
      <ModeHeader
        className="americano-tournament-banner rv-mode-header"
        eyebrow={modeEyebrow || "Americano"}
        title={tournamentName || "Reta Pádel Americano"}
        subtitle={tournamentDescription || undefined}
      />
    ) : null;

  const syncWarning = !remoteSyncReady ? (
    <p className="americano-screen__error">
      Falta la columna <code>americano_live</code> en Supabase (
      <code>tournament_public_config</code>). Ejecuta{" "}
      <code>supabase/tournament-public-config-americano.sql</code>. Mientras tanto
      solo se guarda en este navegador.
    </p>
  ) : null;

  if (hydrating && phase === "registration" && players.length === 0) {
    return (
      <AmericanoModeShell showToolbar={false}>
        <p className="americano-screen__loading">Cargando americano…</p>
      </AmericanoModeShell>
    );
  }

  if (phase === "registration") {
    return (
      <AmericanoModeShell onBack={goBackToRetas}>
        {syncWarning}
        <ModeHeader
          className="americano-entry-header americano-tournament-banner rv-mode-header rv-mode-header--entry"
          eyebrow={modeEyebrow}
          title={tournamentName || "Americano Dinámico"}
          subtitle={
            tournamentDescription ||
            "Selecciona jugadores del registro y define rondas y canchas."
          }
        />
        {playersLoadError && (
          <p className="americano-screen__error">
            {playersLoadError}
          </p>
        )}
        {resolvedTournamentId ? (
          <ConvocatoriaWhatsAppPanel
            context={buildTournamentConvocatoriaContext({
              mode: "americano",
              tournamentId: resolvedTournamentId,
              name: tournamentName || "Americano",
              clubName: convocatoriaOrigin,
            })}
          />
        ) : null}
        <PlayerRegistration
          players={players}
          availablePlayers={availablePlayers}
          onRemovePlayer={removePlayer}
          onToggleExistingPlayer={toggleExistingPlayer}
          onStartTournament={handleStartTournament}
          initialCourts={tournamentCourts}
        />
      </AmericanoModeShell>
    );
  }

  if (phase === "playing") {
    const americanoStatus = resolveAmericanoStatusLabel({ phase });
    const americanoNextAction = resolveAmericanoNextAction({
      phase,
      playersCount: players.length,
      hasCurrentRound: Boolean(currentRound),
    });
    const americanoSummary = resolveAmericanoSummary({
      phase,
      playersCount: players.length,
      currentRound: currentRound?.roundNumber ?? 0,
      totalRounds,
    });
    const americanoTabs = [
      { id: "ronda", label: "Ronda" },
      { id: "partidos", label: "Partidos" },
      { id: "ranking", label: "Ranking" },
      { id: "jugadores", label: "Jugadores" },
    ];

    const jugadoresPanel = (
      <div className="americano-screen__jugadores-compact">
        <p className="americano-screen__jugadores-count">
          {players.length} jugadores en el torneo
        </p>
        <ul className="americano-screen__jugadores-list">
          {rosterForUi.map((p) => (
            <li key={p.id}>{p.name}</li>
          ))}
        </ul>
      </div>
    );

    const playingBody = isMobile ? (
      <div className="mode-mobile-shell mode-mobile-shell--tabbed americano-mobile-shell">
        <ModeEventHeader
          eyebrow={modeEyebrow || "Americano"}
          title={tournamentName || "Americano Dinámico"}
          modality="Americano dinámico"
          statusLabel={americanoStatus.label}
          statusVariant={americanoStatus.variant}
          summary={americanoSummary}
          nextActionLabel={americanoNextAction?.label}
          onNextAction={
            americanoNextAction
              ? () => setPlayingTab(americanoNextAction.tabId)
              : undefined
          }
        />
        <ModeSectionTabs
          tabs={americanoTabs}
          activeId={playingTab}
          onChange={(id) => setPlayingTab(id as AmericanoMobileTabId)}
          ariaLabel="Secciones del americano"
        />
        <ModeSectionPanel id="ronda" activeId={playingTab}>
          {currentRound ? (
            <RoundView
              key={currentRound.roundNumber}
              round={currentRound}
              totalRounds={totalRounds}
              onCommitRound={commitRoundScores}
              onRoundFinalized={nextRound}
            />
          ) : (
            <p className="americano-screen__loading">Preparando ronda…</p>
          )}
        </ModeSectionPanel>
        <ModeSectionPanel id="partidos" activeId={playingTab}>
          <RoundHistory
            rounds={rounds}
            totalRounds={totalRounds}
            onEditScore={editScore}
          />
        </ModeSectionPanel>
        <ModeSectionPanel id="ranking" activeId={playingTab}>
          <LiveRanking
            ranked={ranking}
            roster={rosterForUi}
            rounds={rounds}
            caption="Acumulado de todo el americano: suma cada ronda en cuanto confirmes los marcadores."
          />
        </ModeSectionPanel>
        <ModeSectionPanel id="jugadores" activeId={playingTab}>
          {jugadoresPanel}
        </ModeSectionPanel>
      </div>
    ) : (
      <>
        {currentRound && (
          <RoundView
            key={currentRound.roundNumber}
            round={currentRound}
            totalRounds={totalRounds}
            onCommitRound={commitRoundScores}
            onRoundFinalized={nextRound}
          />
        )}
        <div className="americano-screen__block">
          <LiveRanking
            ranked={ranking}
            roster={rosterForUi}
            rounds={rounds}
            caption="Acumulado de todo el americano: suma cada ronda en cuanto confirmes los marcadores."
          />
        </div>
        <div className="americano-screen__block">
          <RoundHistory
            rounds={rounds}
            totalRounds={totalRounds}
            onEditScore={editScore}
          />
        </div>
      </>
    );

    return (
      <AmericanoModeShell onBack={goBackToRetas}>
        {syncWarning}
        {tournamentBanner}
        {publicAmericanoUrl ? (
          <PublicShareSection
            publicUrl={publicAmericanoUrl}
            title="Enlace público"
            infoLines={[
              "Comparte el enlace para ver marcador y emparejamientos en vivo.",
            ]}
          />
        ) : null}
        {playingBody}
      </AmericanoModeShell>
    );
  }

  return (
    <AmericanoModeShell onBack={goBackToRetas}>
      {tournamentBanner}
      {publicAmericanoUrl ? (
        <PublicShareSection
          publicUrl={publicAmericanoUrl}
          title="Enlace público"
          infoLines={["Comparte el enlace para ver podio y ranking del americano."]}
        />
      ) : null}
      <p className="americano-screen__finished">Americano finalizado</p>
      {participacionSyncError && (
        <div className="americano-screen__error" role="alert">
          <p>
            El americano terminó, pero no se registró en el historial de
            jugadores: {participacionSyncError}
          </p>
          <button
            type="button"
            className="americano-screen__retry-sync"
            onClick={() => retryParticipacionSync()}
          >
            Reintentar registro
          </button>
        </div>
      )}
      {podiumPlayers.length > 0 && (
        <section className="americano-podium te-public-podium">
          <h3>Felicidades a los 3 primeros lugares</h3>
          <div className="te-public-podium__grid">
            {podiumPlayers[0] && (
              <PublicAmericanoPodiumCard
                rank={1}
                name={podiumPlayers[0].name}
                fotoUrl={podiumAvatars[podiumPlayers[0].id]}
              />
            )}
            {podiumPlayers[1] && (
              <PublicAmericanoPodiumCard
                rank={2}
                name={podiumPlayers[1].name}
                fotoUrl={podiumAvatars[podiumPlayers[1].id]}
                animationDelay="0.08s"
              />
            )}
            {podiumPlayers[2] && (
              <PublicAmericanoPodiumCard
                rank={3}
                name={podiumPlayers[2].name}
                fotoUrl={podiumAvatars[podiumPlayers[2].id]}
                animationDelay="0.12s"
              />
            )}
          </div>
        </section>
      )}
      <LiveRanking ranked={ranking} roster={rosterForUi} rounds={rounds} />
      <div className="americano-screen__block">
        <RoundHistory
          rounds={rounds}
          totalRounds={totalRounds}
          onEditScore={editScore}
        />
      </div>
    </AmericanoModeShell>
  );
};

export default AmericanoDinamicoScreen;
