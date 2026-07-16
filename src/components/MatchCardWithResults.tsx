import React, { useState, useEffect, useCallback, useRef } from "react";
import { Match, Pair, Game } from "../lib/database";
import {
  getGames,
  createGame,
  getNextGameNumber,
  deleteGame,
  updateMatch,
} from "../lib/database";
import { MatchResultCalculator } from "./MatchResultCalculator";
import { aplicarRatingDesdePairs } from "../lib/rivieraJugadores/aplicarRatingPartido";
import { TeamBadge } from "./teams/TeamBadge";
import {
  getPairTeamIndex,
  getPairTeamName,
  type TeamConfigLike,
} from "../lib/teamConfigDisplay";
import { formatMatchCourtLabel } from "../lib/matchCourt";

const PencilIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    aria-hidden
    focusable="false"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

interface MatchCardWithResultsProps {
  match: Match;
  pairs: Pair[]; // Agregado: recibir pairs como prop para evitar cargas redundantes
  /** Canchas configuradas en la reta (calendario / descansos); la edición manual del partido permite más pistas. */
  maxCourts?: number;
  /** En remontada: etiqueta legible (FINAL, ENCUENTRO 1…) en lugar de "Ronda N". */
  roundLabelOverride?: string;
  isSelected: boolean;
  onSelect: (matchId: string) => void;
  onCorrectScore: (match: Match) => void;
  forceRefresh?: number;
  userId?: string;
  teamConfig?: TeamConfigLike | null;
}

const MatchCardWithResults: React.FC<MatchCardWithResultsProps> = ({
  match,
  pairs,
  maxCourts = 12,
  roundLabelOverride,
  isSelected,
  onSelect,
  onCorrectScore,
  forceRefresh = 0,
  userId,
  teamConfig = null,
}) => {
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
  const [pair1, setPair1] = useState<Pair | null>(null);
  const [pair2, setPair2] = useState<Pair | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [pair1Score, setPair1Score] = useState("");
  const [pair2Score, setPair2Score] = useState("");
  const [courtInput, setCourtInput] = useState("");
  const [roundInput, setRoundInput] = useState("");
  const [metaSaving, setMetaSaving] = useState(false);
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const isUpdatingRef = useRef(false);
  const gamesLoadedRef = useRef(false);

  /** Tope al editar cancha en el partido: no limitar solo a `tournament.courts` (a menudo 1) o el guardado siempre queda en 1. */
  const courtEditCap = Math.max(1, maxCourts, 32);

  const syncPairsFromProps = useCallback(() => {
    const p1 = pairs.find((p) => p.id === match.pair1_id);
    const p2 = pairs.find((p) => p.id === match.pair2_id);
    setPair1(p1 || null);
    setPair2(p2 || null);
  }, [match.pair1_id, match.pair2_id, pairs]);

  /** Recarga juegos sin skeleton ni recarga del torneo completo. */
  const reloadGamesSilently = useCallback(async () => {
    try {
      const matchGames = await getGames(match.id);
      setGames(matchGames);
      setCurrentMatch(match);
      syncPairsFromProps();
    } catch (err) {
      console.error("❌ Error recargando juegos:", err);
    }
  }, [match, syncPairsFromProps]);

  /** Avisa al padre para actualizar standings / remontada (debounced vía forceRefresh). */
  const notifyParent = useCallback(
    (updatedMatch: Match = match) => {
      onCorrectScore?.(updatedMatch);
    },
    [match, onCorrectScore]
  );

  // Obtener nombre de pareja
  const getPairName = (pair: Pair | null): string => {
    if (!pair) return "Pareja desconocida";
    return `${pair.player1?.name || pair.player1_name || "Jugador 1"} / ${
      pair.player2?.name || pair.player2_name || "Jugador 2"
    }`;
  };

  // Calcular ganador del partido
  const getMatchWinner = () => {
    if (games.length === 0) return null;

    let pair1Wins = 0;
    let pair2Wins = 0;

    games.forEach((game) => {
      if (game.pair1_games > game.pair2_games) {
        pair1Wins++;
      } else if (game.pair2_games > game.pair1_games) {
        pair2Wins++;
      }
    });

    if (pair1Wins > pair2Wins) {
      return { winner: "pair1", pair1Wins, pair2Wins };
    } else if (pair2Wins > pair1Wins) {
      return { winner: "pair2", pair1Wins, pair2Wins };
    } else {
      return { winner: "tie", pair1Wins, pair2Wins };
    }
  };

  const saveCourtAndRound = async () => {
    if (!currentMatch) return;

    try {
      setMetaSaving(true);
      setError(null);
      const parsedCourt = parseInt(courtInput, 10);
      const parsedRound = parseInt(roundInput, 10);
      if (Number.isNaN(parsedCourt) || Number.isNaN(parsedRound)) {
        setError("Cancha y ronda deben ser números válidos");
        setMetaSaving(false);
        return;
      }
      const court = Math.min(courtEditCap, Math.max(1, parsedCourt));
      const round = Math.min(999, Math.max(1, parsedRound));
      const updated = await updateMatch(currentMatch.id, { court, round });
      setCurrentMatch(updated);
      setCourtInput(String(court));
      setRoundInput(String(round));
      notifyParent(updated);
      setIsEditingMeta(false);
    } catch (err) {
      console.error("❌ Error guardando cancha/ronda:", err);
      setError("No se pudo guardar cancha ni ronda");
    } finally {
      setMetaSaving(false);
    }
  };

  const openMetaEditor = useCallback(() => {
    setCourtInput(
      String(
        match.court == null || match.court <= 0
          ? ""
          : Math.min(courtEditCap, Math.max(1, match.court))
      )
    );
    setRoundInput(String(Math.max(1, match.round ?? 1)));
    setError(null);
    setIsEditingMeta(true);
  }, [match.court, match.round, courtEditCap]);

  const cancelMetaEdit = useCallback(() => {
    setCourtInput(
      String(
        match.court == null || match.court <= 0
          ? ""
          : Math.min(courtEditCap, Math.max(1, match.court))
      )
    );
    setRoundInput(String(Math.max(1, match.round ?? 1)));
    setIsEditingMeta(false);
    setError(null);
  }, [match.court, match.round, courtEditCap]);

  // Agregar juego - OPTIMIZADO: una sola actualización al final
  const addGame = async () => {
    if (!currentMatch) return;

    const score1 = parseInt(pair1Score);
    const score2 = parseInt(pair2Score);
    const ownerId = userId || "";

    if (isNaN(score1) || isNaN(score2)) {
      setError("Ingresa puntuaciones válidas");
      return;
    }

    if (score1 === score2 && score1 === 0) {
      setError("Ingresa el marcador del juego (no puede ser 0-0)");
      return;
    }

    if (!ownerId) {
      setError("No se pudo identificar al usuario para guardar el juego");
      return;
    }

    if (isUpdatingRef.current) return;

    try {
      isUpdatingRef.current = true;
      setSaving(true);
      setError(null);

      const gameNumber = await getNextGameNumber(currentMatch.id);
      const savedGame = await createGame(currentMatch.id, gameNumber, ownerId, {
        pair1_games: score1,
        pair2_games: score2,
        is_tie_break: false,
        tie_break_pair1_points: 0,
        tie_break_pair2_points: 0,
      });

      setPair1Score("");
      setPair2Score("");
      setGames((prev) => [...prev, savedGame]);
    } catch (err: unknown) {
      console.error("❌ Error agregando juego:", err);
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : "";
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: string }).message)
          : "";
      if (code === "23505" || message.toLowerCase().includes("duplicate")) {
        setError("Ese juego ya está guardado. Pulsa «Actualizar».");
      } else if (message) {
        setError(
          `No se pudo guardar el juego: ${message.slice(0, 120)}`
        );
      } else {
        setError("Error al agregar juego. Revisa el marcador e inténtalo de nuevo.");
      }
      await reloadGamesSilently();
    } finally {
      isUpdatingRef.current = false;
      setSaving(false);
    }
  };

  // Eliminar juego - OPTIMIZADO: una sola actualización al final
  const removeGame = async (gameId: string) => {
    if (!currentMatch) return;

    try {
      setSaving(true);
      setError(null);

      await deleteGame(gameId);
      setGames((prev) => prev.filter((g) => g.id !== gameId));
    } catch (err) {
      console.error("❌ Error eliminando juego:", err);
      setError("Error al eliminar juego");
      await reloadGamesSilently();
    } finally {
      setSaving(false);
    }
  };

  // Finalizar partido
  const finishMatch = async () => {
    if (!currentMatch) return;

    if (isUpdatingRef.current) return;

    try {
      isUpdatingRef.current = true;
      setSaving(true);
      setError(null);

      const matchGames = await getGames(currentMatch.id);
      const result = await MatchResultCalculator.accumulateMatchStatistics(
        currentMatch,
        matchGames,
        pairs
      );

      if (result.success) {
        let pair1FinalScore = 0;
        let pair2FinalScore = 0;

        matchGames.forEach((game) => {
          if (game.pair1_games >= 6) {
            pair1FinalScore++;
          }
          if (game.pair2_games >= 6) {
            pair2FinalScore++;
          }
        });

        // Marcar como finalizado y guardar marcador final
        await updateMatch(currentMatch.id, {
          status: "finished",
          pair1_score: pair1FinalScore,
          pair2_score: pair2FinalScore,
        });

        if (userId && pair1FinalScore !== pair2FinalScore) {
          const pair1Row = pairs.find((p) => p.id === currentMatch.pair1_id);
          const pair2Row = pairs.find((p) => p.id === currentMatch.pair2_id);
          if (pair1Row && pair2Row) {
            void aplicarRatingDesdePairs(
              userId,
              pair1Row,
              pair2Row,
              pair1FinalScore > pair2FinalScore ? "a" : "b",
              {
                modoJuego: "reta_rr",
                partidoRef: `reta:${currentMatch.id}`,
                descripcion: "Reta Round Robin",
              }
            ).catch((e) => console.warn("[rating] reta:", e));
          }
        }

        setIsEditing(false);
        setCurrentMatch((prev) =>
          prev
            ? {
                ...prev,
                status: "finished",
                pair1_score: pair1FinalScore,
                pair2_score: pair2FinalScore,
              }
            : prev
        );
        notifyParent();
      } else {
        setError("Error: " + result.message);
      }
    } catch (err) {
      console.error("❌ Error finalizando partido:", err);
      setError("Error al finalizar partido");
    } finally {
      isUpdatingRef.current = false;
      setSaving(false);
    }
  };

  // Reabrir partido - OPTIMIZADO: una sola actualización
  const reopenMatch = async () => {
    if (!currentMatch) return;

    try {
      setSaving(true);
      setError(null);

      await updateMatch(currentMatch.id, { status: "pending" });
      setCurrentMatch((prev) =>
        prev ? { ...prev, status: "pending" } : prev
      );
      notifyParent();
    } catch (err) {
      console.error("❌ Error reabriendo partido:", err);
      setError("Error al reabrir partido");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    gamesLoadedRef.current = false;
  }, [match.id]);

  useEffect(() => {
    setCurrentMatch(match);
    syncPairsFromProps();
  }, [match, syncPairsFromProps]);

  useEffect(() => {
    let isMounted = true;
    const showSkeleton = !gamesLoadedRef.current;

    const fetchGames = async () => {
      try {
        if (showSkeleton) setLoading(true);
        const matchGames = await getGames(match.id);
        if (!isMounted) return;
        setGames(matchGames);
        gamesLoadedRef.current = true;
      } catch (err) {
        if (!isMounted) return;
        console.error("❌ Error cargando juegos:", err);
        setError("Error cargando juegos");
      } finally {
        if (isMounted && showSkeleton) {
          setLoading(false);
        }
      }
    };

    fetchGames();

    return () => {
      isMounted = false;
    };
  }, [match.id]);

  // Actualizar estado cuando el prop match cambia (sin recargar de BD)
  useEffect(() => {
    // Actualizar match desde prop (viene actualizado del padre)
    if (match && (!currentMatch || 
        match.id !== currentMatch.id || 
        match.status !== currentMatch.status ||
        match.pair1_score !== currentMatch.pair1_score ||
        match.pair2_score !== currentMatch.pair2_score ||
        match.court !== currentMatch.court ||
        (match.round ?? 1) !== (currentMatch.round ?? 1))) {
      setCurrentMatch(match);
      
      // Si el status cambió a finished, cerrar el editor
      if (match.status === 'finished' && isEditing) {
        setIsEditing(false);
      }
      
      // Actualizar pairs desde prop (vienen actualizados del padre)
      if (match.pair1_id && match.pair2_id) {
        const p1 = pairs.find((p) => p.id === match.pair1_id);
        const p2 = pairs.find((p) => p.id === match.pair2_id);
        setPair1(p1 || null);
        setPair2(p2 || null);
      }
      
      // Solo recargar juegos si cambió el status o scores (puede haber nuevos juegos)
      if (match.id === currentMatch?.id && 
          (match.status !== currentMatch.status || 
           match.pair1_score !== currentMatch.pair1_score ||
           match.pair2_score !== currentMatch.pair2_score)) {
        getGames(match.id).then((matchGames) => {
          setGames(matchGames);
        }).catch((err) => {
          console.error("❌ Error recargando juegos:", err);
        });
      }
    }
  }, [match, pairs, currentMatch, isEditing]); // Incluir todas las dependencias

  useEffect(() => {
    if (isEditingMeta) return;
    setCourtInput(
      String(
        match.court == null || match.court <= 0
          ? ""
          : Math.min(courtEditCap, Math.max(1, match.court))
      )
    );
    setRoundInput(String(Math.max(1, match.round ?? 1)));
  }, [match.id, match.court, match.round, courtEditCap, isEditingMeta]);

  if (loading) {
    return (
      <div
        className="omc-card omc-card--loading"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Cargando partido"
      >
        <div className="omc-skeleton omc-skeleton--wide" aria-hidden />
        <div className="omc-skeleton" aria-hidden />
        <div className="omc-skeleton omc-skeleton--short" aria-hidden />
      </div>
    );
  }

  if (!currentMatch) {
    return null;
  }

  const isFinished = currentMatch.status === "finished";
  const matchWinner = getMatchWinner();
  const pair1DisplayName = getPairName(pair1);
  const pair2DisplayName = getPairName(pair2);
  const pair1TeamName = getPairTeamName(currentMatch.pair1_id, teamConfig);
  const pair2TeamName = getPairTeamName(currentMatch.pair2_id, teamConfig);
  const pair1TeamIndex = getPairTeamIndex(currentMatch.pair1_id, teamConfig);
  const pair2TeamIndex = getPairTeamIndex(currentMatch.pair2_id, teamConfig);
  const pair1IsWinner = isFinished && matchWinner?.winner === "pair1";
  const pair2IsWinner = isFinished && matchWinner?.winner === "pair2";
  const pair1IsLoser = isFinished && matchWinner?.winner === "pair2";
  const pair2IsLoser = isFinished && matchWinner?.winner === "pair1";
  const isTie = isFinished && matchWinner?.winner === "tie";

  /** Marcador en fila: puntos del juego (6, 2…), no pair1_score del match (cuenta de sets). */
  const teamDisplayScores = (() => {
    if (!isFinished || games.length === 0) {
      return { score1: null as number | null, score2: null as number | null };
    }
    const lastGame = games[games.length - 1];
    const s1 = lastGame.pair1_games;
    const s2 = lastGame.pair2_games;
    if (typeof s1 !== "number" || typeof s2 !== "number") {
      return { score1: null, score2: null };
    }
    return { score1: s1, score2: s2 };
  })();

  const gamesSummary = games
    .map(
      (game, index) =>
        `J${index + 1}: ${game.pair1_games}–${game.pair2_games}`
    )
    .join(", ");

  const stopCardClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      className={`omc-card rv-card rv-match-card${isSelected ? " selected" : ""}${
        isFinished ? " omc-card--done" : " omc-card--live"
      }${isTie ? " omc-card--tie" : ""}`}
      onClick={() => onSelect(currentMatch.id)}
    >
      <header className="omc-header" onClick={stopCardClick}>
        <div className="omc-header__top">
          <div className="omc-pills">
            <span className="omc-pill omc-pill--court">
              {formatMatchCourtLabel(currentMatch.court)}
            </span>
            <span className="omc-pill omc-pill--round">
              {roundLabelOverride ?? `Ronda ${currentMatch.round || 1}`}
            </span>
          </div>
          <div className="omc-header__actions">
            <span
              className={`omc-status ${
                isFinished ? "omc-status--done" : "omc-status--live"
              }`}
            >
              {isFinished ? "FINALIZADO" : "EN CURSO"}
            </span>
            {!isEditingMeta ? (
              <button
                type="button"
                className="omc-pencil-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  openMetaEditor();
                }}
                title="Editar cancha y ronda"
                aria-label="Editar cancha y ronda"
                disabled={metaSaving}
              >
                <PencilIcon className="omc-pencil-icon" />
              </button>
            ) : (
              <button
                type="button"
                className="omc-pencil-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  cancelMetaEdit();
                }}
                title="Cerrar sin guardar"
                aria-label="Cerrar edición de cancha y ronda"
                disabled={metaSaving}
              >
                ×
              </button>
            )}
          </div>
        </div>

        <hr className="omc-header__rule" />
      </header>

      {isEditingMeta && (
        <div
          className="omc-meta-editor"
          onClick={stopCardClick}
        >
          <div className="omc-meta-editor__fields">
            <label className="omc-meta-editor__field">
              <span>Cancha</span>
              <input
                type="number"
                min={1}
                max={courtEditCap}
                value={courtInput}
                onChange={(e) => setCourtInput(e.target.value)}
                aria-label="Número de cancha"
              />
            </label>
            <label className="omc-meta-editor__field">
              <span>Ronda</span>
              <input
                type="number"
                min={1}
                max={999}
                value={roundInput}
                onChange={(e) => setRoundInput(e.target.value)}
                aria-label="Número de ronda"
              />
            </label>
          </div>
          <div className="omc-meta-editor__actions">
            <button
              type="button"
              className="omc-meta-save"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                saveCourtAndRound();
              }}
              disabled={metaSaving}
            >
              {metaSaving ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              className="omc-meta-cancel"
              onClick={(e) => {
                e.stopPropagation();
                cancelMetaEdit();
              }}
              disabled={metaSaving}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="omc-body">
        {isFinished ? (
          <>
            <div
              className={`omc-team-row${
                isTie
                  ? " omc-team-row--tie"
                  : pair1IsWinner
                    ? " omc-team-row--winner"
                    : pair1IsLoser
                      ? " omc-team-row--loser"
                      : ""
              }`}
            >
              <div className="omc-team-row__info">
                {pair1TeamName ? (
                  <TeamBadge
                    name={pair1TeamName}
                    teamIndex={pair1TeamIndex ?? undefined}
                    className="omc-team-badge"
                  />
                ) : null}
                <span className="omc-team-name">{pair1DisplayName}</span>
              </div>
              {teamDisplayScores.score1 != null ? (
                <span className="omc-team-score">{teamDisplayScores.score1}</span>
              ) : null}
            </div>
            <div
              className={`omc-team-row${
                isTie
                  ? " omc-team-row--tie"
                  : pair2IsWinner
                    ? " omc-team-row--winner"
                    : pair2IsLoser
                      ? " omc-team-row--loser"
                      : ""
              }`}
            >
              <div className="omc-team-row__info">
                {pair2TeamName ? (
                  <TeamBadge
                    name={pair2TeamName}
                    teamIndex={pair2TeamIndex ?? undefined}
                    className="omc-team-badge"
                  />
                ) : null}
                <span className="omc-team-name">{pair2DisplayName}</span>
              </div>
              {teamDisplayScores.score2 != null ? (
                <span className="omc-team-score">{teamDisplayScores.score2}</span>
              ) : null}
            </div>

            {isTie ? (
              <div className="omc-tie-banner" role="status" aria-label="Empate">
                <span className="omc-tie-banner__icon" aria-hidden>
                  ⇄
                </span>
                <span className="omc-tie-banner__label">Empate</span>
                {teamDisplayScores.score1 != null &&
                teamDisplayScores.score2 != null ? (
                  <span className="omc-tie-banner__score">
                    {teamDisplayScores.score1}–{teamDisplayScores.score2}
                  </span>
                ) : null}
              </div>
            ) : null}

            {games.length > 0 && (
              <div
                className={`omc-result-strip${
                  isTie ? " omc-result-strip--tie" : ""
                }`}
              >
                <span className="omc-result-strip__label">
                  {isTie ? "Empate" : "Resultado"}
                </span>
                <span className="omc-result-strip__value">{gamesSummary}</span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="omc-team-row omc-team-row--pending">
              <div className="omc-team-row__info">
                {pair1TeamName ? (
                  <TeamBadge
                    name={pair1TeamName}
                    teamIndex={pair1TeamIndex ?? undefined}
                    className="omc-team-badge"
                  />
                ) : null}
                <span className="omc-team-name">{pair1DisplayName}</span>
              </div>
            </div>
            <span className="omc-vs-divider">vs</span>
            <div className="omc-team-row omc-team-row--pending">
              <div className="omc-team-row__info">
                {pair2TeamName ? (
                  <TeamBadge
                    name={pair2TeamName}
                    teamIndex={pair2TeamIndex ?? undefined}
                    className="omc-team-badge"
                  />
                ) : null}
                <span className="omc-team-name">{pair2DisplayName}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {isEditing && (
        <>
          <section className="omc-register" onClick={stopCardClick}>
            <h6 className="omc-register__label">Registrar resultado</h6>
            <div className="omc-register__scores">
              <div className="omc-register__side">
                <div className="omc-register__pair-id">
                  {pair1TeamName ? (
                    <TeamBadge
                      name={pair1TeamName}
                      teamIndex={pair1TeamIndex ?? undefined}
                      className="omc-register__team-badge"
                    />
                  ) : null}
                  <span className="omc-register__pair-name">{pair1DisplayName}</span>
                </div>
                <input
                  type="number"
                  min={0}
                  max={7}
                  value={pair1Score}
                  onChange={(e) => setPair1Score(e.target.value)}
                  className="omc-register__input"
                  onClick={stopCardClick}
                  placeholder="0"
                  aria-label={`Puntos ${pair1DisplayName}`}
                />
              </div>
              <span className="omc-register__vs">vs</span>
              <div className="omc-register__side">
                <div className="omc-register__pair-id">
                  {pair2TeamName ? (
                    <TeamBadge
                      name={pair2TeamName}
                      teamIndex={pair2TeamIndex ?? undefined}
                      className="omc-register__team-badge"
                    />
                  ) : null}
                  <span className="omc-register__pair-name">{pair2DisplayName}</span>
                </div>
                <input
                  type="number"
                  min={0}
                  max={7}
                  value={pair2Score}
                  onChange={(e) => setPair2Score(e.target.value)}
                  className="omc-register__input"
                  onClick={stopCardClick}
                  placeholder="0"
                  aria-label={`Puntos ${pair2DisplayName}`}
                />
              </div>
            </div>
            <div className="omc-register__actions">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  void addGame();
                }}
                className="omc-btn-add"
                disabled={saving}
              >
                Agregar juego
              </button>
              {!isFinished ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    void finishMatch();
                  }}
                  className="omc-btn-finish"
                  disabled={saving}
                >
                  Finalizar partido
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    reopenMatch();
                  }}
                  className="omc-btn-reopen"
                  disabled={saving}
                >
                  Reabrir partido
                </button>
              )}
            </div>
          </section>

          {games.length > 0 && (
            <section className="omc-delete-games" onClick={stopCardClick}>
              <span className="omc-delete-games__label">Eliminar juegos</span>
              {games.map((game, index) => (
                <div key={game.id} className="omc-delete-games__item">
                  <span>
                    J{index + 1}: {game.pair1_games}–{game.pair2_games}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      void removeGame(game.id);
                    }}
                    className="omc-btn-delete-game"
                    disabled={saving}
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {error && <div className="omc-error">{error}</div>}

      <footer className="omc-footer" onClick={stopCardClick}>
        {isEditing ? (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                void reloadGamesSilently();
              }}
              className="omc-footer-btn"
              title="Actualizar datos"
              disabled={saving}
            >
              Actualizar
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(false);
                setError(null);
              }}
              className="omc-footer-btn omc-footer-btn--ghost"
            >
              Cancelar
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            className="omc-footer-btn"
            title="Editar marcador"
          >
            Marcador
          </button>
        )}
      </footer>
    </div>
  );
};

// Usar React.memo para evitar re-renders innecesarios cuando props no cambian
export default React.memo(MatchCardWithResults, (prevProps, nextProps) => {
  // Solo re-renderizar si cambian datos críticos
  return (
    prevProps.match.id === nextProps.match.id &&
    prevProps.match.status === nextProps.match.status &&
    prevProps.match.pair1_score === nextProps.match.pair1_score &&
    prevProps.match.pair2_score === nextProps.match.pair2_score &&
    prevProps.match.court === nextProps.match.court &&
    (prevProps.match.round ?? 1) === (nextProps.match.round ?? 1) &&
    prevProps.maxCourts === nextProps.maxCourts &&
    prevProps.forceRefresh === nextProps.forceRefresh &&
    prevProps.teamConfig?.teamNames === nextProps.teamConfig?.teamNames &&
    prevProps.teamConfig?.pairToTeam === nextProps.teamConfig?.pairToTeam &&
    prevProps.pairs.length === nextProps.pairs.length &&
    prevProps.pairs.every((p, i) => p.id === nextProps.pairs[i]?.id)
  );
});
