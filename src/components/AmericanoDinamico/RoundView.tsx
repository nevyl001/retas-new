import React, { useEffect, useMemo, useState } from "react";
import type { AmericanoMatch, AmericanoRound } from "../../lib/db/types";
import { americanoRoundPhaseCaption } from "../../lib/americanoPhaseLabels";
import { ActionBar } from "../platform/ActionBar";
import { Button } from "../ui";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import "../jugadores/riviera-jugadores.css";
import "./RoundView.css";

export interface RoundScorePayload {
  matchId: string;
  scoreA: number;
  scoreB: number;
}

interface RoundViewProps {
  round: AmericanoRound;
  /** Total de rondas del torneo (para mostrar "Final" en la última). */
  totalRounds?: number;
  onCommitRound: (scores: RoundScorePayload[]) => void;
  onRoundFinalized: () => void;
  /** FC-01 (Fase C1): true mientras la ronda siguiente se confirma con el servidor. */
  roundSyncPending?: boolean;
  /** Mensaje si el servidor rechazó/no confirmó el avance de ronda — reintentar es seguro (idempotente). */
  roundSyncError?: string | null;
  /** foto_url resuelta por id de jugador (legacy). */
  playerFotos?: Record<string, string | null>;
}

function readDraft(
  match: AmericanoMatch,
  drafts: Record<string, { a?: string; b?: string }>
): { a: string; b: string } {
  const d = drafts[match.id];
  return {
    a: d?.a ?? (typeof match.scoreA === "number" ? String(match.scoreA) : ""),
    b: d?.b ?? (typeof match.scoreB === "number" ? String(match.scoreB) : ""),
  };
}

function isDraftComplete(
  round: AmericanoRound,
  drafts: Record<string, { a?: string; b?: string }>
): boolean {
  return round.matches.every((m) => {
    const { a, b } = readDraft(m, drafts);
    const nA = Number(a);
    const nB = Number(b);
    return a !== "" && b !== "" && !Number.isNaN(nA) && !Number.isNaN(nB) && nA >= 0 && nB >= 0;
  });
}

function allMatchesCommitted(round: AmericanoRound): boolean {
  return round.matches.every(
    (m) =>
      typeof m.scoreA === "number" &&
      typeof m.scoreB === "number" &&
      !Number.isNaN(m.scoreA) &&
      !Number.isNaN(m.scoreB) &&
      m.scoreA >= 0 &&
      m.scoreB >= 0
  );
}

function draftsDifferFromCommitted(
  round: AmericanoRound,
  drafts: Record<string, { a?: string; b?: string }>
): boolean {
  return round.matches.some((m) => {
    const { a, b } = readDraft(m, drafts);
    if (typeof m.scoreA !== "number" || typeof m.scoreB !== "number") return false;
    if (a === "" && b === "") return false;
    const nA = Number(a);
    const nB = Number(b);
    if (a !== "" && !Number.isNaN(nA) && nA !== m.scoreA) return true;
    if (b !== "" && !Number.isNaN(nB) && nB !== m.scoreB) return true;
    return false;
  });
}

function teamPlayersLabel(players: ReadonlyArray<{ name: string }>): string {
  return players.map((p) => p.name.trim()).filter(Boolean).join(" · ");
}

export const RoundView: React.FC<RoundViewProps> = ({
  round,
  totalRounds = 0,
  onCommitRound,
  onRoundFinalized,
  roundSyncPending = false,
  roundSyncError = null,
  playerFotos = {},
}) => {
  const [draftScores, setDraftScores] = useState<
    Record<string, { a?: string; b?: string }>
  >({});

  useEffect(() => {
    setDraftScores({});
  }, [round.roundNumber]);

  const draftComplete = useMemo(
    () => isDraftComplete(round, draftScores),
    [round, draftScores]
  );

  const committed = useMemo(() => allMatchesCommitted(round), [round]);
  const dirty = useMemo(
    () => draftsDifferFromCommitted(round, draftScores),
    [round, draftScores]
  );

  const canFinalizeRound = committed && !dirty && !roundSyncPending;

  const handleConfirm = () => {
    if (!draftComplete) return;
    const scores: RoundScorePayload[] = round.matches.map((m) => {
      const { a, b } = readDraft(m, draftScores);
      return { matchId: m.id, scoreA: Number(a), scoreB: Number(b) };
    });
    onCommitRound(scores);
  };

  return (
    <section className="americano-round rv-card">
      <header className="americano-round__header">
        <div>
          <h3>Ronda {round.roundNumber}</h3>
          <span
            className="americano-round__phase"
            title="Rotación americana equilibrada: emparejamientos por costo, sin usar el ranking."
          >
            {americanoRoundPhaseCaption(round, totalRounds) ||
              "Rotación americana"}
          </span>
        </div>
        <p className="americano-round__hint">
          Escribe los juegos de cada equipo y confirma. Luego pulsa{" "}
          <strong>Ronda finalizada</strong>.
        </p>
      </header>

      <div className="americano-round__matches">
        {round.matches.map((match) => {
          const { a, b } = readDraft(match, draftScores);
          const teamALabel = teamPlayersLabel(match.teamA);
          const teamBLabel = teamPlayersLabel(match.teamB);
          const patchScore = (side: "a" | "b", raw: string) => {
            const sanitized = raw.replace(/\D/g, "").slice(0, 2);
            setDraftScores((prev) => ({
              ...prev,
              [match.id]: { ...prev[match.id], [side]: sanitized },
            }));
          };
          const bumpScore = (side: "a" | "b", delta: number) => {
            const current = readDraft(match, draftScores)[side];
            const next = Math.max(0, (Number(current) || 0) + delta);
            setDraftScores((prev) => ({
              ...prev,
              [match.id]: { ...prev[match.id], [side]: String(next) },
            }));
          };

          return (
            <article key={match.id} className="americano-match-card rv-card rv-match-card">
              <div className="americano-match-card__top">
                <span className="americano-match-card__court">
                  Cancha {match.court}
                </span>
              </div>

              <p className="americano-match-card__score-hint">
                Juegos ganados por equipo
              </p>

              <div className="americano-match-card__scoreboard">
                <div className="americano-match-card__score-row">
                  <div className="americano-match-card__side">
                    <span className="americano-match-card__side-tag">A</span>
                    <div className="americano-match-card__players americano-match-card__players--compact">
                      {match.teamA.map((p) => (
                        <div key={p.id} className="americano-match-card__player">
                          <JugadorAvatar
                            fotoUrl={playerFotos[p.id]}
                            nombre={p.name}
                            size="sm"
                            className="americano-match-card__avatar americano-match-card__avatar--compact"
                          />
                          <span className="americano-match-card__player-name">
                            {p.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="americano-match-card__score-control">
                    <button
                      type="button"
                      className="americano-match-card__score-step"
                      aria-label={`Menos juegos ${teamALabel}`}
                      onClick={() => bumpScore("a", -1)}
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      className="americano-match-card__score-input"
                      value={a}
                      placeholder="0"
                      aria-label={`Juegos ${teamALabel}`}
                      onChange={(e) => patchScore("a", e.target.value)}
                    />
                    <button
                      type="button"
                      className="americano-match-card__score-step"
                      aria-label={`Más juegos ${teamALabel}`}
                      onClick={() => bumpScore("a", 1)}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="americano-match-card__score-divider" aria-hidden>
                  vs
                </div>

                <div className="americano-match-card__score-row">
                  <div className="americano-match-card__side">
                    <span className="americano-match-card__side-tag">B</span>
                    <div className="americano-match-card__players americano-match-card__players--compact">
                      {match.teamB.map((p) => (
                        <div key={p.id} className="americano-match-card__player">
                          <JugadorAvatar
                            fotoUrl={playerFotos[p.id]}
                            nombre={p.name}
                            size="sm"
                            className="americano-match-card__avatar americano-match-card__avatar--compact"
                          />
                          <span className="americano-match-card__player-name">
                            {p.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="americano-match-card__score-control">
                    <button
                      type="button"
                      className="americano-match-card__score-step"
                      aria-label={`Menos juegos ${teamBLabel}`}
                      onClick={() => bumpScore("b", -1)}
                    >
                      −
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      className="americano-match-card__score-input"
                      value={b}
                      placeholder="0"
                      aria-label={`Juegos ${teamBLabel}`}
                      onChange={(e) => patchScore("b", e.target.value)}
                    />
                    <button
                      type="button"
                      className="americano-match-card__score-step"
                      aria-label={`Más juegos ${teamBLabel}`}
                      onClick={() => bumpScore("b", 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="americano-round__bench card-like rv-card-soft">
        <h4>Descansando</h4>
        <div className="americano-round__bench-list">
          {round.benchPlayers.length === 0 ? (
            <span className="americano-round__bench-empty">
              Sin descanso esta ronda
            </span>
          ) : (
            round.benchPlayers.map((player) => (
              <span key={player.id} className="americano-round__bench-player">
                <JugadorAvatar
                  fotoUrl={playerFotos[player.id]}
                  nombre={player.name}
                  size="sm"
                  className="americano-round__bench-avatar"
                />
                {player.name}
              </span>
            ))
          )}
        </div>
      </div>

      <ActionBar className="americano-round__actions">
        <Button
          type="button"
          variant="secondary"
          onClick={handleConfirm}
          disabled={!draftComplete}
        >
          Confirmar resultados
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={onRoundFinalized}
          disabled={!canFinalizeRound}
          loading={roundSyncPending}
        >
          {roundSyncPending ? "Guardando…" : "Ronda finalizada"}
        </Button>
      </ActionBar>
      {!draftComplete && (
        <p className="americano-round__footer-hint">
          Completa todos los marcadores (≥ 0) para poder confirmar.
        </p>
      )}
      {dirty && (
        <p className="americano-round__footer-hint">
          Hay cambios sin confirmar. Pulsa <strong>Confirmar resultados</strong>{" "}
          antes de finalizar la ronda.
        </p>
      )}
      {roundSyncError && (
        <p className="americano-round__footer-hint americano-round__footer-hint--error">
          {roundSyncError} Puedes volver a pulsar «Ronda finalizada» — reintentar es seguro.
        </p>
      )}
    </section>
  );
};
