import React, { useState, useEffect, useCallback, useRef } from "react";
import { Match, Pair, Game } from "../lib/database";
import {
  getGames, // Solo necesitamos getGames (match y pairs vienen como props)
  createGame,
  deleteGame,
  updateMatch,
  updateGame,
} from "../lib/database";
import { MatchResultCalculator } from "./MatchResultCalculator";
import { aplicarRatingDesdePairs } from "../lib/rivieraJugadores/aplicarRatingPartido";

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

const TrophyIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    aria-hidden
    focusable="false"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M8 21h8" />
    <path d="M12 17v4" />
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M5 4H3v2a3 3 0 0 0 3 3" />
    <path d="M19 4h2v2a3 3 0 0 1-3 3" />
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
}) => {
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
  const [pair1, setPair1] = useState<Pair | null>(null);
  const [pair2, setPair2] = useState<Pair | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [pair1Score, setPair1Score] = useState("");
  const [pair2Score, setPair2Score] = useState("");
  const [courtInput, setCourtInput] = useState("");
  const [roundInput, setRoundInput] = useState("");
  const [metaSaving, setMetaSaving] = useState(false);
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const isUpdatingRef = useRef(false); // Prevenir múltiples actualizaciones simultáneas

  /** Tope al editar cancha en el partido: no limitar solo a `tournament.courts` (a menudo 1) o el guardado siempre queda en 1. */
  const courtEditCap = Math.max(1, maxCourts, 32);

  // Función optimizada para recargar datos locales SIN múltiples actualizaciones
  const refreshFromServer = useCallback(async () => {
    // Prevenir múltiples actualizaciones simultáneas
    if (isUpdatingRef.current) {
      console.log("⏳ Actualización ya en progreso, ignorando...");
      return;
    }

    try {
      isUpdatingRef.current = true;

      // Actualizar desde props (vienen actualizados del padre)
      setCurrentMatch(match);
      const p1 = pairs.find((p) => p.id === match.pair1_id);
      const p2 = pairs.find((p) => p.id === match.pair2_id);
      setPair1(p1 || null);
      setPair2(p2 || null);

      // Solo recargar juegos (único dato que necesita actualizarse)
      const matchGames = await getGames(match.id);
      setGames(matchGames);

      // Solo actualizar tabla UNA VEZ al final usando match del prop (ya viene actualizado del padre)
      if (onCorrectScore) {
        onCorrectScore(match);
      }
    } catch (err) {
      console.error("❌ Error recargando datos:", err);
    } finally {
      isUpdatingRef.current = false;
    }
  }, [match, pairs, onCorrectScore]);

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

  // Obtener etiqueta del ganador
  const getWinnerLabel = () => {
    const result = getMatchWinner();
    if (!result) return null;

    if (result.winner === "pair1") {
      return {
        text: `Ganador: ${getPairName(pair1)}`,
        type: "winner" as const,
        icon: "🏆",
        winnerPairName: getPairName(pair1),
      };
    } else if (result.winner === "pair2") {
      return {
        text: `Ganador: ${getPairName(pair2)}`,
        type: "winner" as const,
        icon: "🏆",
        winnerPairName: getPairName(pair2),
      };
    } else {
      return {
        text: "Empate",
        type: "tie" as const,
        icon: "🤝",
        winnerPairName: undefined as string | undefined,
      };
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
      if (onCorrectScore) {
        onCorrectScore(updated);
      }
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
      String(Math.min(courtEditCap, Math.max(1, match.court ?? 1)))
    );
    setRoundInput(String(Math.max(1, match.round ?? 1)));
    setError(null);
    setIsEditingMeta(true);
  }, [match.court, match.round, courtEditCap]);

  const cancelMetaEdit = useCallback(() => {
    setCourtInput(
      String(Math.min(courtEditCap, Math.max(1, match.court ?? 1)))
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

    if (!ownerId) {
      setError("No se pudo identificar al usuario para guardar el juego");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Crear juego
      const gameNumber = games.length + 1;
      const newGame = await createGame(currentMatch.id, gameNumber, ownerId);

      // Actualizar con puntuación
      await updateGame(newGame.id, {
        pair1_games: score1,
        pair2_games: score2,
        is_tie_break: false,
        tie_break_pair1_points: 0,
        tie_break_pair2_points: 0,
      });

      // Limpiar inputs inmediatamente
      setPair1Score("");
      setPair2Score("");

      // UNA SOLA actualización al final (esto actualiza todo)
      await refreshFromServer();

      console.log("✅ Juego agregado y UI actualizada");
    } catch (err) {
      console.error("❌ Error agregando juego:", err);
      setError("Error al agregar juego");
    } finally {
      setLoading(false);
    }
  };

  // Eliminar juego - OPTIMIZADO: una sola actualización al final
  const removeGame = async (gameId: string) => {
    if (!currentMatch) return;

    try {
      setLoading(true);
      setError(null);

      await deleteGame(gameId);

      // UNA SOLA actualización al final (esto actualiza todo)
      await refreshFromServer();

      console.log("✅ Juego eliminado");
    } catch (err) {
      console.error("❌ Error eliminando juego:", err);
      setError("Error al eliminar juego");
    } finally {
      setLoading(false);
    }
  };

  // Finalizar partido
  const finishMatch = async () => {
    if (!currentMatch) return;

    try {
      setLoading(true);
      setError(null);

      // Usar pairs recibidos como prop (ya están disponibles, no recargar)
      // Acumular estadísticas
      const result = await MatchResultCalculator.accumulateMatchStatistics(
        currentMatch,
        games,
        pairs // Usar prop en lugar de recargar
      );

      if (result.success) {
        // Calcular marcador final del partido para guardarlo en el match
        const matchGames = await getGames(currentMatch.id);
        let pair1FinalScore = 0;
        let pair2FinalScore = 0;

        // Calcular sets ganados por cada pareja
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

        console.log(
          `🏆 Partido finalizado: ${pair1FinalScore} - ${pair2FinalScore}`
        );

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

        // Cerrar el editor después de finalizar
        setIsEditing(false);

        // UNA SOLA actualización al final (esto actualiza todo, incluyendo status)
        await refreshFromServer();

        console.log("✅ Partido finalizado, juegos:", matchGames.length);
      } else {
        setError("Error: " + result.message);
      }
    } catch (err) {
      console.error("❌ Error finalizando partido:", err);
      setError("Error al finalizar partido");
    } finally {
      setLoading(false);
    }
  };

  // Reabrir partido - OPTIMIZADO: una sola actualización
  const reopenMatch = async () => {
    if (!currentMatch) return;

    try {
      setLoading(true);
      setError(null);

      // Marcar como no finalizado
      await updateMatch(currentMatch.id, { status: "pending" });

      // UNA SOLA actualización al final
      await refreshFromServer();

      console.log("✅ Partido reabierto");
    } catch (err) {
      console.error("❌ Error reabriendo partido:", err);
      setError("Error al reabrir partido");
    } finally {
      setLoading(false);
    }
  };

  // Cargar datos al montar - OPTIMIZADO: solo cargar juegos, usar props para match y pairs
  useEffect(() => {
    // Inicializar estado desde props inmediatamente (sin llamadas a BD)
    setCurrentMatch(match);
    const p1 = pairs.find((p) => p.id === match.pair1_id);
    const p2 = pairs.find((p) => p.id === match.pair2_id);
    setPair1(p1 || null);
    setPair2(p2 || null);

    // Solo cargar juegos (único dato específico del card que necesita BD)
    let isMounted = true;
    const fetchGames = async () => {
      try {
        setLoading(true);
        const matchGames = await getGames(match.id);
        if (!isMounted) return;
        setGames(matchGames);
        console.log("✅ Juegos cargados para partido:", match.id);
      } catch (err) {
        if (!isMounted) return;
        console.error("❌ Error cargando juegos:", err);
        setError("Error cargando juegos");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchGames();

    return () => {
      isMounted = false;
    };
  }, [match.id, match, pairs]); // Recargar cuando cambia el match o pairs

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
      String(Math.min(courtEditCap, Math.max(1, match.court ?? 1)))
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
  const winnerLabel = getWinnerLabel();
  const matchWinner = getMatchWinner();
  const pair1DisplayName = getPairName(pair1);
  const pair2DisplayName = getPairName(pair2);
  const pair1IsWinner = isFinished && matchWinner?.winner === "pair1";
  const pair2IsWinner = isFinished && matchWinner?.winner === "pair2";
  const pair1IsLoser = isFinished && matchWinner?.winner === "pair2";
  const pair2IsLoser = isFinished && matchWinner?.winner === "pair1";

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
      className={`omc-card${isSelected ? " selected" : ""}${
        isFinished ? " omc-card--done" : " omc-card--live"
      }`}
      onClick={() => onSelect(currentMatch.id)}
    >
      <header className="omc-header" onClick={stopCardClick}>
        <div className="omc-header__top">
          <h5 className="omc-match-title">
            <span className="omc-match-title__line">{pair1DisplayName}</span>
            <span className="omc-match-title__vs">vs</span>
            <span className="omc-match-title__line">{pair2DisplayName}</span>
          </h5>
          <span
            className={`omc-status ${
              isFinished ? "omc-status--done" : "omc-status--live"
            }`}
          >
            {isFinished ? "FINALIZADO" : "EN CURSO"}
          </span>
        </div>

        <div className="omc-header__meta">
          <div className="omc-pills">
            <span className="omc-pill">Cancha {currentMatch.court}</span>
            <span className="omc-pill">
              {roundLabelOverride ?? `Ronda ${currentMatch.round || 1}`}
            </span>
          </div>
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
                pair1IsWinner
                  ? " omc-team-row--winner"
                  : pair1IsLoser
                    ? " omc-team-row--loser"
                    : ""
              }`}
            >
              <div className="omc-team-row__info">
                <span className="omc-team-label">Pareja 1</span>
                <span className="omc-team-name">{pair1DisplayName}</span>
              </div>
              {teamDisplayScores.score1 != null ? (
                <span className="omc-team-score">{teamDisplayScores.score1}</span>
              ) : null}
            </div>
            <div
              className={`omc-team-row${
                pair2IsWinner
                  ? " omc-team-row--winner"
                  : pair2IsLoser
                    ? " omc-team-row--loser"
                    : ""
              }`}
            >
              <div className="omc-team-row__info">
                <span className="omc-team-label">Pareja 2</span>
                <span className="omc-team-name">{pair2DisplayName}</span>
              </div>
              {teamDisplayScores.score2 != null ? (
                <span className="omc-team-score">{teamDisplayScores.score2}</span>
              ) : null}
            </div>

            {winnerLabel?.type === "winner" && winnerLabel.winnerPairName && (
              <div className="omc-winner-bar">
                <TrophyIcon className="omc-winner-bar__icon" />
                <div className="omc-winner-bar__text">
                  <span className="omc-winner-bar__tag">Ganador</span>
                  <span className="omc-winner-bar__name">
                    {winnerLabel.winnerPairName}
                  </span>
                </div>
              </div>
            )}

            {games.length > 0 && (
              <p className="omc-games-line">
                <span className="omc-games-line__label">Juegos:</span>
                {gamesSummary}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="omc-team-row omc-team-row--pending">
              <div className="omc-team-row__info">
                <span className="omc-team-label">Pareja 1</span>
                <span className="omc-team-name">{pair1DisplayName}</span>
              </div>
            </div>
            <span className="omc-vs-divider">vs</span>
            <div className="omc-team-row omc-team-row--pending">
              <div className="omc-team-row__info">
                <span className="omc-team-label">Pareja 2</span>
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
              <span className="omc-register__vs">vs</span>
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
            <div className="omc-register__actions">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  addGame();
                }}
                onTouchStart={stopCardClick}
                onTouchEnd={(e) => {
                  stopCardClick(e);
                  e.preventDefault();
                  addGame();
                }}
                className="omc-btn-add"
                disabled={loading}
              >
                Agregar juego
              </button>
              {!isFinished ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    finishMatch();
                  }}
                  onTouchStart={stopCardClick}
                  onTouchEnd={(e) => {
                    stopCardClick(e);
                    e.preventDefault();
                    finishMatch();
                  }}
                  className="omc-btn-finish"
                  disabled={loading}
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
                  disabled={loading}
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
                      removeGame(game.id);
                    }}
                    onTouchStart={stopCardClick}
                    onTouchEnd={(e) => {
                      stopCardClick(e);
                      e.preventDefault();
                      removeGame(game.id);
                    }}
                    className="omc-btn-delete-game"
                    disabled={loading}
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
                refreshFromServer();
              }}
              onTouchStart={stopCardClick}
              onTouchEnd={async (e) => {
                stopCardClick(e);
                e.preventDefault();
                await refreshFromServer();
              }}
              className="omc-footer-btn"
              title="Actualizar datos"
              disabled={loading}
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
    prevProps.pairs.length === nextProps.pairs.length &&
    prevProps.pairs.every((p, i) => p.id === nextProps.pairs[i]?.id)
  );
});
