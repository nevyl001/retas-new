import React from "react";
import { useAmericanoDinamico } from "../../hooks/useAmericanoDinamico";
import { PlayerRegistration } from "./PlayerRegistration";
import { RoundView } from "./RoundView";
import { LiveRanking } from "./LiveRanking";
import { RoundHistory } from "./RoundHistory";
import {
  createPlayer,
  getPlayers,
  updateTournament,
  upsertAmericanoLivePublic,
  type Player,
} from "../../lib/database";
import { useUser } from "../../contexts/UserContext";
import {
  buildAmericanoDinamicoSnapshot,
  saveAmericanoDinamicoSnapshot,
} from "../../lib/americanoDinamicoStorage";
import "./AmericanoDinamicoScreen.css";

interface AmericanoDinamicoScreenProps {
  userId?: string | null;
  tournamentId?: string | null;
  onTournamentStatusChange?: (updates: {
    is_started?: boolean;
    is_finished?: boolean;
  }) => void;
}

export const AmericanoDinamicoScreen: React.FC<AmericanoDinamicoScreenProps> = ({
  userId,
  tournamentId,
  onTournamentStatusChange,
}) => {
  const { user } = useUser();
  const {
    players,
    rounds,
    phase,
    ranking,
    currentRound,
    totalRounds,
    addPlayer,
    removePlayer,
    toggleExistingPlayer,
    startTournament,
    commitRoundScores,
    editScore,
    nextRound,
  } = useAmericanoDinamico();
  const [availablePlayers, setAvailablePlayers] = React.useState<Player[]>([]);
  const [playersLoadError, setPlayersLoadError] = React.useState<string | null>(
    null
  );
  const finishedPersistedRef = React.useRef(false);
  const lastLivePublishTournamentRef = React.useRef<string | null>(null);
  const effectiveUserId = userId || user?.id || null;

  const publicAmericanoUrl = React.useMemo(
    () =>
      tournamentId && typeof window !== "undefined"
        ? `${window.location.origin}/public/americano/${tournamentId}`
        : "",
    [tournamentId]
  );

  const copyPublicAmericanoLink = React.useCallback(async () => {
    if (!publicAmericanoUrl) return;
    try {
      await navigator.clipboard.writeText(publicAmericanoUrl);
    } catch {
      window.prompt("Copia este enlace:", publicAmericanoUrl);
    }
  }, [publicAmericanoUrl]);

  React.useEffect(() => {
    if (!effectiveUserId) return;
    let cancelled = false;
    (async () => {
      try {
        setPlayersLoadError(null);
        const data = await getPlayers(effectiveUserId, tournamentId || undefined);
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
  }, [effectiveUserId, tournamentId]);

  const goBackToRetas = React.useCallback(() => {
    window.history.pushState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

  const handleAddPlayer = React.useCallback(
    async (name: string) => {
      if (!name.trim()) return;
      if (!effectiveUserId) {
        addPlayer(name);
        return;
      }
      try {
        const created = await createPlayer(
          name.trim(),
          effectiveUserId,
          tournamentId || undefined
        );
        setAvailablePlayers((prev) => {
          if (prev.some((p) => p.id === created.id)) return prev;
          return [...prev, created].sort((a, b) => a.name.localeCompare(b.name));
        });
        toggleExistingPlayer(created);
      } catch {
        // Fallback local para no bloquear el flujo si falla el insert en BD.
        addPlayer(name);
      }
    },
    [effectiveUserId, tournamentId, addPlayer, toggleExistingPlayer]
  );
  const handleStartTournament = React.useCallback(
    async (totalRounds: number, courts: number) => {
      startTournament(totalRounds, courts);
      finishedPersistedRef.current = false;
      if (!tournamentId) return;
      try {
        await updateTournament(tournamentId, {
          is_started: true,
          is_finished: false,
        });
        onTournamentStatusChange?.({ is_started: true, is_finished: false });
      } catch (e) {
        // Si falla persistencia, no bloqueamos el torneo local.
        console.warn("No se pudo marcar la reta como iniciada:", e);
      }
    },
    [startTournament, tournamentId, onTournamentStatusChange]
  );

  React.useEffect(() => {
    if (phase !== "finished" || !tournamentId || finishedPersistedRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        await updateTournament(tournamentId, {
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
  }, [phase, tournamentId, onTournamentStatusChange]);

  /** localStorage + Supabase (vista pública en vivo). */
  React.useEffect(() => {
    if (!tournamentId || rounds.length === 0) return;
    if (phase !== "playing" && phase !== "finished") return;
    const snap = buildAmericanoDinamicoSnapshot(
      ranking,
      rounds,
      phase,
      totalRounds
    );
    const publish = () => {
      saveAmericanoDinamicoSnapshot(tournamentId, snap);
      void upsertAmericanoLivePublic(tournamentId, snap);
    };
    const firstForThisTournament =
      lastLivePublishTournamentRef.current !== tournamentId;
    if (firstForThisTournament) {
      lastLivePublishTournamentRef.current = tournamentId;
      publish();
    }
    const t = window.setTimeout(publish, 250);
    return () => window.clearTimeout(t);
  }, [tournamentId, phase, rounds, ranking, totalRounds]);

  const podium = ranking.slice(0, 3);

  if (phase === "registration") {
    return (
      <div className="americano-screen">
        <div className="americano-screen__header">
          <button className="americano-back-btn" onClick={goBackToRetas}>
            ← Volver a Retas
          </button>
        </div>
        {playersLoadError && (
          <p className="americano-screen__error">
            {playersLoadError}
          </p>
        )}
        <PlayerRegistration
          players={players}
          availablePlayers={availablePlayers}
          onAddPlayer={handleAddPlayer}
          onRemovePlayer={removePlayer}
          onToggleExistingPlayer={toggleExistingPlayer}
          onStartTournament={handleStartTournament}
        />
      </div>
    );
  }

  if (phase === "playing") {
    return (
      <div className="americano-screen">
        <div className="americano-screen__header">
          <button className="americano-back-btn" onClick={goBackToRetas}>
            ← Volver a Retas
          </button>
        </div>
        {tournamentId && publicAmericanoUrl ? (
          <section className="americano-public-link" aria-label="Enlace público">
            <h3 className="americano-public-link__title">Vista pública en vivo</h3>
            <p className="americano-public-link__text">
              Comparte este enlace para que cualquiera vea en tiempo real quién juega
              contra quién y el marcador (se actualiza solo).
            </p>
            <div className="americano-public-link__row">
              <input
                type="text"
                readOnly
                className="americano-public-link__input"
                value={publicAmericanoUrl}
                onFocus={(e) => e.target.select()}
              />
              <button
                type="button"
                className="americano-btn americano-btn--primary"
                onClick={copyPublicAmericanoLink}
              >
                Copiar enlace
              </button>
            </div>
            <p className="americano-public-link__hint">
              Requiere columna <code>americano_live</code> en Supabase (archivo{" "}
              <code>tournament-americano-public-live.sql</code> del proyecto).
            </p>
          </section>
        ) : null}
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
            players={ranking}
            caption="Solo cuenta rondas ya cerradas; al cerrar la ronda actual se actualiza con esos resultados."
          />
        </div>
        <div className="americano-screen__block">
          <RoundHistory
            rounds={rounds}
            totalRounds={totalRounds}
            onEditScore={editScore}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="americano-screen">
      <div className="americano-screen__header">
        <button className="americano-back-btn" onClick={goBackToRetas}>
          ← Volver a Retas
        </button>
      </div>
      {tournamentId && publicAmericanoUrl ? (
        <section className="americano-public-link" aria-label="Enlace público">
          <h3 className="americano-public-link__title">Vista pública (resultado final)</h3>
          <div className="americano-public-link__row">
            <input
              type="text"
              readOnly
              className="americano-public-link__input"
              value={publicAmericanoUrl}
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              className="americano-btn americano-btn--primary"
              onClick={copyPublicAmericanoLink}
            >
              Copiar enlace
            </button>
          </div>
        </section>
      ) : null}
      <p className="americano-screen__finished">Torneo finalizado</p>
      {podium.length > 0 && (
        <section className="americano-podium">
          <h3>Felicidades a los 3 primeros lugares</h3>
          <div className="americano-podium__grid">
            {podium[0] && (
              <article className="americano-podium__card americano-podium__card--gold">
                <span className="americano-podium__place">1er lugar</span>
                <strong>{podium[0].name}</strong>
              </article>
            )}
            {podium[1] && (
              <article className="americano-podium__card americano-podium__card--silver">
                <span className="americano-podium__place">2do lugar</span>
                <strong>{podium[1].name}</strong>
              </article>
            )}
            {podium[2] && (
              <article className="americano-podium__card americano-podium__card--bronze">
                <span className="americano-podium__place">3er lugar</span>
                <strong>{podium[2].name}</strong>
              </article>
            )}
          </div>
        </section>
      )}
      <LiveRanking players={ranking} />
      <div className="americano-screen__block">
        <RoundHistory
          rounds={rounds}
          totalRounds={totalRounds}
          onEditScore={editScore}
        />
      </div>
    </div>
  );
};

export default AmericanoDinamicoScreen;
