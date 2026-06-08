import React from "react";
import { useAmericanoDinamico } from "../../hooks/useAmericanoDinamico";
import { PlayerRegistration } from "./PlayerRegistration";
import { RoundView } from "./RoundView";
import { LiveRanking } from "./LiveRanking";
import { RoundHistory } from "./RoundHistory";
import {
  createPlayer,
  getPlayers,
  getTournamentById,
  updateTournament,
  upsertAmericanoLivePublic,
  type Player,
} from "../../lib/database";
import { useUser } from "../../contexts/UserContext";
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
import { Button } from "../ui";
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
  const resolvedTournamentId = resolveAmericanoTournamentId(tournamentId);
  const effectiveUserId = userId || user?.id || null;
  const [availablePlayers, setAvailablePlayers] = React.useState<Player[]>([]);
  const [playersLoadError, setPlayersLoadError] = React.useState<string | null>(
    null
  );
  const [tournamentName, setTournamentName] = React.useState<string>("");
  const [tournamentDescription, setTournamentDescription] =
    React.useState<string>("");
  const finishedPersistedRef = React.useRef(false);

  const {
    players,
    rounds,
    phase,
    ranking,
    currentRoundIndex,
    currentRound,
    totalRounds,
    addPlayer,
    removePlayer,
    toggleExistingPlayer,
    startTournament,
    commitRoundScores,
    editScore,
    nextRound,
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

  const copyPublicAmericanoLink = React.useCallback(async () => {
    if (!publicAmericanoUrl) return;
    try {
      await navigator.clipboard.writeText(publicAmericanoUrl);
    } catch {
      window.prompt("Copia este enlace:", publicAmericanoUrl);
    }
  }, [publicAmericanoUrl]);

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
      totalRounds
    );
    saveAmericanoDinamicoSnapshot(resolvedTournamentId, snap, {
      skipDispatch: true,
    });
  }, [resolvedTournamentId, phase, rounds, ranking, totalRounds]);

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
      saveAmericanoDinamicoSnapshot(resolvedTournamentId, draft, {
        skipDispatch: true,
      });
    }, 400);
    return () => window.clearTimeout(t);
  }, [resolvedTournamentId, phase, players]);

  const goBackToRetas = React.useCallback(() => {
    navigateToAppHome();
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
          resolvedTournamentId || undefined
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
    [effectiveUserId, resolvedTournamentId, addPlayer, toggleExistingPlayer]
  );
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

  /** Supabase + evento otras vistas (localStorage ya va en useLayoutEffect). */
  React.useEffect(() => {
    if (!resolvedTournamentId || rounds.length === 0) return;
    if (phase !== "playing" && phase !== "finished") return;
    const snap = buildAmericanoDinamicoSnapshot(
      ranking,
      rounds,
      phase,
      totalRounds
    );
    const t = window.setTimeout(() => {
      void upsertAmericanoLivePublic(resolvedTournamentId, snap);
      try {
        window.dispatchEvent(
          new CustomEvent("americano-dinamico-snapshot", {
            detail: { tournamentId: resolvedTournamentId },
          })
        );
      } catch {
        /* ignore */
      }
    }, 450);
    return () => window.clearTimeout(t);
  }, [resolvedTournamentId, phase, rounds, ranking, totalRounds]);

  const podium = ranking.slice(0, 3);

  const tournamentBanner =
    tournamentName || tournamentDescription ? (
      <header className="americano-tournament-banner">
        <p className="americano-tournament-banner__kicker">Americano</p>
        {tournamentName ? (
          <h2 className="americano-tournament-banner__name">{tournamentName}</h2>
        ) : null}
        {tournamentDescription ? (
          <p className="americano-tournament-banner__desc">
            {tournamentDescription}
          </p>
        ) : null}
      </header>
    ) : null;

  if (phase === "registration") {
    return (
      <div className="americano-screen">
        <div className="americano-screen__header riviera-back-toolbar">
          <Button type="button" variant="back" onClick={goBackToRetas}>
            ← Volver al inicio
          </Button>
        </div>
        {tournamentBanner}
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
        <div className="americano-screen__header riviera-back-toolbar">
          <Button type="button" variant="back" onClick={goBackToRetas}>
            ← Volver al inicio
          </Button>
        </div>
        {tournamentBanner}
        {resolvedTournamentId && publicAmericanoUrl ? (
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
              <Button
                type="button"
                variant="primary"
                className="americano-public-link__copy"
                onClick={copyPublicAmericanoLink}
              >
                Copiar enlace
              </Button>
            </div>
            <p className="americano-public-link__hint">
              Requiere columna <code>americano_live</code> en{" "}
              <code>tournament_public_config</code> (Supabase).
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
            rounds={rounds.slice(0, currentRoundIndex)}
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
      <div className="americano-screen__header riviera-back-toolbar">
          <Button type="button" variant="back" onClick={goBackToRetas}>
            ← Volver al inicio
          </Button>
      </div>
      {tournamentBanner}
      {resolvedTournamentId && publicAmericanoUrl ? (
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
            <Button
              type="button"
              variant="primary"
              className="americano-public-link__copy"
              onClick={copyPublicAmericanoLink}
            >
              Copiar enlace
            </Button>
          </div>
        </section>
      ) : null}
      <p className="americano-screen__finished">Americano finalizado</p>
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
      <LiveRanking players={ranking} rounds={rounds} />
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
