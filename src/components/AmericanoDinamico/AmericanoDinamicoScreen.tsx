import React from "react";
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
import { Button } from "../ui";
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
    rosterForUi,
    currentRoundIndex,
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
      <div className="americano-screen">
        <p className="americano-screen__loading">Cargando americano…</p>
      </div>
    );
  }

  if (phase === "registration") {
    return (
      <div className="americano-screen">
        <div className="americano-screen__header riviera-back-toolbar">
          <Button type="button" variant="back" onClick={goBackToRetas}>
            ← Volver al inicio
          </Button>
        </div>
        {syncWarning}
        {tournamentBanner}
        {playersLoadError && (
          <p className="americano-screen__error">
            {playersLoadError}
          </p>
        )}
        <PlayerRegistration
          players={players}
          availablePlayers={availablePlayers}
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
        {syncWarning}
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
              El marcador se sincroniza en la nube; comparte el enlace para verlo
              en vivo desde cualquier dispositivo.
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
    </div>
  );
};

export default AmericanoDinamicoScreen;
