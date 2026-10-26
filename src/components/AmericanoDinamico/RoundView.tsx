import React, { useEffect, useMemo, useState } from "react";
import type { AmericanoMatch, AmericanoRound } from "../../lib/db/types";
import { americanoRoundPhaseCaption } from "../../lib/americanoPhaseLabels";
import { formatMatchCourtLabel, sortByMatchCourt } from "../../lib/matchCourt";
import { ActionBar } from "../platform/ActionBar";
import { Button } from "../ui";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import { AmericanoPairLine } from "../americano/AmericanoPairLine";
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
  /** Persiste ranking + servidor solo al pulsar Confirmar (borrador local hasta entonces). */
  onCommitRound?: (scores: RoundScorePayload[]) => void;
  onRoundFinalized?: () => void;
  /** Ronda histórica: marcador visible, sin captura. */
  readOnly?: boolean;
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

function ScoreField({
  value,
  ariaLabel,
  onChange,
}: {
  value: string;
  ariaLabel: string;
  onChange: (raw: string) => void;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      className="am-match-board__score"
      value={value}
      placeholder="—"
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export const RoundView: React.FC<RoundViewProps> = ({
  round,
  totalRounds = 0,
  onCommitRound,
  onRoundFinalized,
  readOnly = false,
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

  const matchesByCourt = useMemo(
    () => sortByMatchCourt(round.matches),
    [round.matches]
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
    onCommitRound?.(scores);
    setDraftScores({});
  };

  return (
    <section className="americano-round rv-card">
      <header className="americano-round__header">
        <div>
          <h3>
            Ronda {round.roundNumber}
            {totalRounds > 0 ? (
              <span className="americano-round__of-total">
                {" "}
                de {totalRounds}
              </span>
            ) : null}
          </h3>
          <span
            className="americano-round__phase"
            title="Rotación americana equilibrada: emparejamientos por costo, sin usar el ranking."
          >
            {americanoRoundPhaseCaption(round, totalRounds) ||
              "Rotación americana"}
          </span>
        </div>
        <p className="americano-round__hint">
          {readOnly
            ? "Resultado de una ronda anterior, solo lectura."
            : "Captura los juegos de cada pareja. No se guardan ni suman al ranking hasta que pulses Confirmar resultados."}
        </p>
      </header>

      <div className="americano-round__matches">
        {matchesByCourt.map((match) => {
          const { a, b } = readDraft(match, draftScores);
          const teamALabel = teamPlayersLabel(match.teamA);
          const teamBLabel = teamPlayersLabel(match.teamB);
          const scoreA = a === "" ? null : Number(a);
          const scoreB = b === "" ? null : Number(b);
          const scored =
            scoreA != null &&
            scoreB != null &&
            !Number.isNaN(scoreA) &&
            !Number.isNaN(scoreB);
          const aWins = scored && scoreA > scoreB;
          const bWins = scored && scoreB > scoreA;
          const tie = scored && scoreA === scoreB;
          const patchScore = (side: "a" | "b", raw: string) => {
            const sanitized = raw.replace(/\D/g, "").slice(0, 2);
            setDraftScores((prev) => ({
              ...prev,
              [match.id]: { ...prev[match.id], [side]: sanitized },
            }));
          };

          const toLine = (players: AmericanoMatch["teamA"]) =>
            players.map((player) => ({
              id: player.id,
              name: player.name,
              fotoUrl: playerFotos[player.id] ?? null,
            }));

          return (
            <article
              key={match.id}
              className="americano-match-card rv-card rv-match-card"
            >
              <div className="americano-match-card__top">
                <span className="americano-match-card__court">
                  {formatMatchCourtLabel(match.court)}
                </span>
              </div>

              <div className="americano-court">
                <AmericanoPairLine
                  label={teamALabel}
                  highlight={aWins ? "win" : tie ? "tie" : scored ? "loss" : undefined}
                  players={toLine(match.teamA)}
                />
                <div className="americano-court__score">
                  {readOnly ? (
                    <span aria-label={`Marcador ${a || "sin juegos"} a ${b || "sin juegos"}`}>
                      {a || "—"} – {b || "—"}
                    </span>
                  ) : (
                    <>
                      <ScoreField
                        value={a}
                        ariaLabel={`Juegos ${teamALabel}`}
                        onChange={(raw) => patchScore("a", raw)}
                      />
                      <span className="am-match-board__score-sep" aria-hidden>
                        -
                      </span>
                      <ScoreField
                        value={b}
                        ariaLabel={`Juegos ${teamBLabel}`}
                        onChange={(raw) => patchScore("b", raw)}
                      />
                    </>
                  )}
                </div>
                <AmericanoPairLine
                  label={teamBLabel}
                  highlight={bWins ? "win" : tie ? "tie" : scored ? "loss" : undefined}
                  players={toLine(match.teamB)}
                />
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
              Nadie descansa esta ronda
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

      {readOnly ? null : (
        <>
          <ActionBar className="americano-round__actions">
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirm}
              disabled={!draftComplete}
            >
              Confirmar resultados
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onRoundFinalized?.()}
              disabled={!canFinalizeRound}
              loading={roundSyncPending}
            >
              {roundSyncPending ? "Guardando…" : "Ronda finalizada"}
            </Button>
          </ActionBar>
          {!draftComplete && (
            <p className="americano-round__footer-hint">
              Faltan marcadores por capturar
            </p>
          )}
          {draftComplete && (!committed || dirty) && (
            <p className="americano-round__footer-hint">Listo para confirmar</p>
          )}
          {committed && !dirty && (
            <p className="americano-round__footer-hint">Resultados confirmados</p>
          )}
        </>
      )}
      {roundSyncError && !readOnly && (
        <p className="americano-round__footer-hint americano-round__footer-hint--error">
          {roundSyncError} Puedes volver a pulsar «Ronda finalizada» — reintentar es seguro.
        </p>
      )}
    </section>
  );
};
