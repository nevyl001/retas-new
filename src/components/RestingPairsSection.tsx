import React, { useMemo, useState } from "react";
import { Pair, Match, updateMatch } from "../lib/database";
import { pairPlayersDisplayLabel } from "../lib/pairPlayerNames";
import {
  getPairTeamIndex,
  getPairTeamName,
  type TeamConfigLike,
} from "../lib/teamConfigDisplay";
import {
  listSwappablePlayingSlots,
  planRestingPairSwap,
} from "../lib/reta/swapRestingPair";
import { TeamBadge } from "./teams/TeamBadge";
import { TablerIcon } from "./ui/TablerIcon";
import { Button } from "./ui";
import "./RestingPairsSection.css";

interface RestingPairsSectionProps {
  pairs: Pair[];
  matches: Match[];
  /** Todos los partidos del torneo (para reacomodar rondas sin romper cruces). */
  allMatches?: Match[];
  round: number;
  courts: number;
  teamConfig?: TeamConfigLike | null;
  /** Si se pasa, el organizador puede intercambiar descanso ↔ jugando. */
  editable?: boolean;
  onMatchUpdated?: (match: Match) => void;
  onAfterSwap?: () => void | Promise<void>;
}

/** Partidos de la ronda: si ya vienen filtrados (p. ej. remontada), no re-filtrar por número. */
function resolveRoundMatches(matches: Match[], round: number): Match[] {
  if (!matches.length) return [];
  const roundNums = new Set(matches.map((m) => m.round ?? round));
  if (roundNums.size === 1) return matches;
  return matches.filter((m) => (m.round ?? round) === round);
}

/**
 * Calcula qué parejas descansan en una ronda específica.
 * Una pareja descansa si no está en ningún partido de esa ronda.
 */
const getRestingPairs = (
  pairs: Pair[],
  matches: Match[],
  round: number
): Pair[] => {
  const roundMatches = resolveRoundMatches(matches, round);
  const playingPairIds = new Set<string>();

  roundMatches.forEach((match) => {
    playingPairIds.add(match.pair1_id);
    playingPairIds.add(match.pair2_id);
  });

  return pairs.filter((pair) => !playingPairIds.has(pair.id));
};

export const RestingPairsSection: React.FC<RestingPairsSectionProps> = ({
  pairs,
  matches,
  allMatches,
  round,
  courts,
  teamConfig = null,
  editable = false,
  onMatchUpdated,
  onAfterSwap,
}) => {
  const roundMatches = useMemo(
    () => resolveRoundMatches(matches, round),
    [matches, round]
  );
  const tournamentMatches = allMatches ?? matches;
  const restingPairs = useMemo(
    () => getRestingPairs(pairs, roundMatches, round),
    [pairs, roundMatches, round]
  );

  const [selectedRestingId, setSelectedRestingId] = useState<string | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const swapSlots = useMemo(() => {
    if (!selectedRestingId) return [];
    return listSwappablePlayingSlots({
      roundMatches,
      restingPairId: selectedRestingId,
      pairs,
      teamConfig,
    });
  }, [selectedRestingId, roundMatches, pairs, teamConfig]);

  const pairById = useMemo(() => {
    const map = new Map<string, Pair>();
    pairs.forEach((p) => map.set(p.id, p));
    return map;
  }, [pairs]);

  if (restingPairs.length === 0) {
    return null;
  }

  const pairsPlaying = pairs.length - restingPairs.length;
  const maxPairsThatCanPlay = courts * 2;
  const showTeams = Boolean(
    teamConfig?.teamNames?.length &&
      teamConfig?.pairToTeam &&
      Object.keys(teamConfig.pairToTeam).length > 0
  );

  const handleSelectResting = (pairId: string) => {
    if (!editable || busy) return;
    setError(null);
    setSelectedRestingId((prev) => (prev === pairId ? null : pairId));
  };

  const handleSwapWith = async (playingPairId: string) => {
    if (!selectedRestingId || busy) return;
    const plan = planRestingPairSwap({
      allMatches: tournamentMatches,
      roundMatches,
      round,
      restingPairId: selectedRestingId,
      playingPairId,
      pairs,
      courts,
      teamConfig,
    });
    if ("error" in plan) {
      setError(plan.error);
      return;
    }

    if (plan.patches.length === 0) {
      setSelectedRestingId(null);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      for (const patch of plan.patches) {
        const updated = await updateMatch(patch.matchId, patch.updates);
        onMatchUpdated?.(updated);
      }
      setSelectedRestingId(null);
      await onAfterSwap?.();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo reacomodar la ronda. Intenta de nuevo."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`resting-pairs-section${
        editable ? " resting-pairs-section--editable" : ""
      }`}
    >
      <div className="resting-pairs-header">
        <span className="resting-pairs-icon">
          <TablerIcon name="moon" size={16} />
        </span>
        <span className="resting-pairs-title">
          Parejas que Descansan ({restingPairs.length})
        </span>
        {editable ? (
          <span className="resting-pairs-edit-hint">
            {selectedRestingId
              ? "Elige quién descansa en su lugar (se reacomoda sola)"
              : "Toca quien descansa para meterla a jugar"}
          </span>
        ) : null}
      </div>
      <div className="resting-pairs-list">
        {restingPairs.map((pair) => {
          const teamName = showTeams
            ? getPairTeamName(pair.id, teamConfig, pair)
            : null;
          const teamIndex = showTeams
            ? getPairTeamIndex(pair.id, teamConfig, pair)
            : null;
          const isSelected = selectedRestingId === pair.id;

          return (
            <button
              key={pair.id}
              type="button"
              disabled={!editable || busy}
              onClick={() => handleSelectResting(pair.id)}
              className={`resting-pair-card${
                showTeams ? " resting-pair-card--teams" : ""
              }${editable ? " resting-pair-card--action" : ""}${
                isSelected ? " is-selected" : ""
              }`}
              aria-pressed={editable ? isSelected : undefined}
            >
              {teamName ? (
                <TeamBadge
                  name={teamName}
                  teamIndex={teamIndex ?? undefined}
                  className="resting-pair-team"
                />
              ) : null}
              <span className="resting-pair-name">
                {pairPlayersDisplayLabel(pair)}
              </span>
            </button>
          );
        })}
      </div>

      {editable && selectedRestingId ? (
        <div className="resting-pairs-swap">
          <p className="resting-pairs-swap__title">
            Reemplazar en esta ronda a:
          </p>
          {swapSlots.length === 0 ? (
            <p className="resting-pairs-swap__empty">
              No hay partidos pendientes donde pueda entrar esta pareja
              {showTeams ? " (mismo equipo)" : ""}.
            </p>
          ) : (
            <div className="resting-pairs-swap__list">
              {swapSlots.map((slot) => {
                const playing = pairById.get(slot.playingPairId);
                const label = playing
                  ? pairPlayersDisplayLabel(playing)
                  : slot.playingPairId;
                const courtLabel =
                  slot.court != null ? `Cancha ${slot.court}` : "Sin cancha";
                return (
                  <Button
                    key={`${slot.matchId}-${slot.side}`}
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    loading={busy}
                    className="resting-pairs-swap__btn"
                    onClick={() => void handleSwapWith(slot.playingPairId)}
                  >
                    {label}
                    <span className="resting-pairs-swap__meta">
                      {courtLabel}
                    </span>
                  </Button>
                );
              })}
            </div>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setSelectedRestingId(null);
              setError(null);
            }}
          >
            Cancelar
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className="resting-pairs-error" role="alert">
          {error}
        </p>
      ) : null}

      {restingPairs.length > 0 && (
        <div className="resting-pairs-info">
          <span className="resting-pairs-info-text">
            {pairsPlaying} parejas jugando ({courts} canchas × 2 parejas ={" "}
            {maxPairsThatCanPlay} máximo)
            {editable
              ? " · Se reacomodan rondas pendientes; los rivales no se cambian."
              : ""}
          </span>
        </div>
      )}
    </div>
  );
};

export default RestingPairsSection;
