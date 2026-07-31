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
import { Button, Input } from "./ui";
import { TablerIcon } from "./ui/TablerIcon";

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

  const parseGameError = (err: unknown): string => {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "";
    const message =
      err && typeof err === "object" && "message" in err
        ? String((err as { message?: string }).message)
        : "";
    if (code === "23505" || message.toLowerCase().includes("duplicate")) {
      return "Ese juego ya está guardado. Recarga e inténtalo de nuevo.";
    }
    if (message) {
      return `No se pudo guardar: ${message.slice(0, 120)}`;
    }
    return "Error al guardar el marcador. Revisa e inténtalo de nuevo.";
  };

  const applyFinishedMatchState = async (
    matchGames: Game[],
    activeMatch: Match,
    opts: { applyRating?: boolean } = {}
  ): Promise<boolean> => {
    const { applyRating = true } = opts;
    const result = await MatchResultCalculator.accumulateMatchStatistics(
      activeMatch,
      matchGames,
      pairs
    );

    if (!result.success) {
      setError("Error: " + result.message);
      return false;
    }

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

    await updateMatch(activeMatch.id, {
      status: "finished",
      pair1_score: pair1FinalScore,
      pair2_score: pair2FinalScore,
    });

    if (applyRating && userId && pair1FinalScore !== pair2FinalScore) {
      const pair1Row = pairs.find((p) => p.id === activeMatch.pair1_id);
      const pair2Row = pairs.find((p) => p.id === activeMatch.pair2_id);
      if (pair1Row && pair2Row) {
        void aplicarRatingDesdePairs(
          userId,
          pair1Row,
          pair2Row,
          pair1FinalScore > pair2FinalScore ? "a" : "b",
          {
            modoJuego: "reta_rr",
            partidoRef: `reta:${activeMatch.id}`,
            descripcion: "Reta Round Robin",
          }
        ).catch((e) => console.warn("[rating] reta:", e));
      }
    }

    setPair1Score("");
    setPair2Score("");
    setIsEditing(false);
    setGames(matchGames);
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
    return true;
  };

  /** Path rápido: un marcador → guardar y cerrar el partido. */
  const saveAndFinishResult = async () => {
    if (!currentMatch || isUpdatingRef.current) return;

    const score1 = parseInt(pair1Score, 10);
    const score2 = parseInt(pair2Score, 10);
    const ownerId = userId || "";
    const hasNewScore =
      !Number.isNaN(score1) &&
      !Number.isNaN(score2) &&
      !(score1 === 0 && score2 === 0);

    try {
      isUpdatingRef.current = true;
      setSaving(true);
      setError(null);

      let matchGames = await getGames(currentMatch.id);

      if (hasNewScore) {
        if (!ownerId) {
          setError("No se pudo identificar al usuario para guardar el resultado");
          return;
        }
        const gameNumber = await getNextGameNumber(currentMatch.id);
        const savedGame = await createGame(currentMatch.id, gameNumber, ownerId, {
          pair1_games: score1,
          pair2_games: score2,
          is_tie_break: false,
          tie_break_pair1_points: 0,
          tie_break_pair2_points: 0,
        });
        matchGames = [...matchGames, savedGame];
      } else if (matchGames.length === 0) {
        setError("Ingresa el marcador de cada pareja");
        return;
      }

      await applyFinishedMatchState(matchGames, currentMatch, {
        applyRating: true,
      });
    } catch (err: unknown) {
      console.error("❌ Error guardando resultado:", err);
      setError(parseGameError(err));
      await reloadGamesSilently();
    } finally {
      isUpdatingRef.current = false;
      setSaving(false);
    }
  };

  /**
   * Corregir: reemplaza el marcador y actualiza standings — sin Reabrir.
   */
  const saveCorrection = async () => {
    if (!currentMatch || isUpdatingRef.current) return;

    const score1 = parseInt(pair1Score, 10);
    const score2 = parseInt(pair2Score, 10);
    const ownerId = userId || "";

    if (Number.isNaN(score1) || Number.isNaN(score2)) {
      setError("Ingresa puntuaciones válidas");
      return;
    }
    if (score1 === 0 && score2 === 0) {
      setError("Ingresa el marcador (no puede ser 0-0)");
      return;
    }
    if (!ownerId) {
      setError("No se pudo identificar al usuario para guardar el resultado");
      return;
    }

    try {
      isUpdatingRef.current = true;
      setSaving(true);
      setError(null);

      const existing = await getGames(currentMatch.id);
      for (const g of existing) {
        await deleteGame(g.id);
      }

      const savedGame = await createGame(currentMatch.id, 1, ownerId, {
        pair1_games: score1,
        pair2_games: score2,
        is_tie_break: false,
        tie_break_pair1_points: 0,
        tie_break_pair2_points: 0,
      });

      await applyFinishedMatchState([savedGame], currentMatch, {
        applyRating: false,
      });
    } catch (err: unknown) {
      console.error("❌ Error corrigiendo resultado:", err);
      setError(parseGameError(err));
      await reloadGamesSilently();
    } finally {
      isUpdatingRef.current = false;
      setSaving(false);
    }
  };

  const openCorrectEditor = () => {
    const last = games[games.length - 1];
    if (last) {
      setPair1Score(String(last.pair1_games ?? ""));
      setPair2Score(String(last.pair2_games ?? ""));
    } else if (
      currentMatch &&
      typeof currentMatch.pair1_score === "number" &&
      typeof currentMatch.pair2_score === "number"
    ) {
      setPair1Score(String(currentMatch.pair1_score));
      setPair2Score(String(currentMatch.pair2_score));
    } else {
      setPair1Score("");
      setPair2Score("");
    }
    setError(null);
    setIsEditing(true);
  };

  const cancelEditor = () => {
    setIsEditing(false);
    setPair1Score("");
    setPair2Score("");
    setError(null);
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  openMetaEditor();
                }}
                title="Editar cancha y ronda"
                aria-label="Editar cancha y ronda"
                disabled={metaSaving}
              >
                <TablerIcon name="pencil" size={14} />
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  cancelMetaEdit();
                }}
                title="Cerrar sin guardar"
                aria-label="Cerrar edición de cancha y ronda"
                disabled={metaSaving}
              >
                <TablerIcon name="x" size={14} />
              </Button>
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
            <Input
              label="Cancha"
              type="number"
              min={1}
              max={courtEditCap}
              value={courtInput}
              onChange={(e) => setCourtInput(e.target.value)}
              aria-label="Número de cancha"
            />
            <Input
              label="Ronda"
              type="number"
              min={1}
              max={999}
              value={roundInput}
              onChange={(e) => setRoundInput(e.target.value)}
              aria-label="Número de ronda"
            />
          </div>
          <div className="omc-meta-editor__actions">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                saveCourtAndRound();
              }}
              loading={metaSaving}
            >
              {metaSaving ? "Guardando…" : "Guardar"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                cancelMetaEdit();
              }}
              disabled={metaSaving}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <div className="omc-body">
        {isFinished && !isEditing ? (
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
          <section className="omc-quick" onClick={stopCardClick}>
            <p className="omc-quick__hint">
              {isFinished
                ? "Corregir marcador — cambia y guarda"
                : "Marcador — escribe y guarda"}
            </p>
            <div className="omc-quick__row">
              <div className="omc-quick__pair">
                {pair1TeamName ? (
                  <TeamBadge
                    name={pair1TeamName}
                    teamIndex={pair1TeamIndex ?? undefined}
                    className="omc-quick__team-badge"
                  />
                ) : null}
                <span className="omc-quick__name">{pair1DisplayName}</span>
              </div>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={99}
                value={pair1Score}
                onChange={(e) => setPair1Score(e.target.value)}
                inputClassName="omc-quick__input"
                onClick={stopCardClick}
                placeholder="—"
                aria-label={`Marcador ${pair1DisplayName}`}
              />
            </div>
            <span className="omc-quick__vs" aria-hidden>
              vs
            </span>
            <div className="omc-quick__row">
              <div className="omc-quick__pair">
                {pair2TeamName ? (
                  <TeamBadge
                    name={pair2TeamName}
                    teamIndex={pair2TeamIndex ?? undefined}
                    className="omc-quick__team-badge"
                  />
                ) : null}
                <span className="omc-quick__name">{pair2DisplayName}</span>
              </div>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={99}
                value={pair2Score}
                onChange={(e) => setPair2Score(e.target.value)}
                inputClassName="omc-quick__input"
                onClick={stopCardClick}
                placeholder="—"
                aria-label={`Marcador ${pair2DisplayName}`}
              />
            </div>
            <Button
              type="button"
              variant="primary"
              className="omc-quick__save"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                void (isFinished ? saveCorrection() : saveAndFinishResult());
              }}
              onMouseDown={(e) => e.preventDefault()}
              loading={saving}
            >
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </section>
        )}
      </div>

      {error && <div className="omc-error">{error}</div>}

      {(isFinished || isEditing) && (
        <footer className="omc-footer" onClick={stopCardClick}>
          {isEditing ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                cancelEditor();
              }}
            >
              Cancelar
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                openCorrectEditor();
              }}
              title="Corregir marcador"
            >
              Corregir
            </Button>
          )}
        </footer>
      )}
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
