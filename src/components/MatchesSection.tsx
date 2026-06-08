import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tournament, Match, Pair } from "../lib/database";
import MatchCardWithResults from "./MatchCardWithResults";
import RealTimeStandingsTable from "./RealTimeStandingsTable";
import RestingPairsSection from "./RestingPairsSection";
import { Button } from "./ui";
import {
  groupChampionshipByRound,
  isRoundRobinChampionshipActive,
  loadChampionshipConfig,
  maybeGenerateChampionshipRound,
  partitionMatches,
  resolveChampionPair,
  syncChampionshipConfigFromPublic,
  syncChampionshipConfigPublic,
} from "../lib/roundRobinChampionship";

const TEAM_CONFIG_KEY = "rivieraapp_teams_";

function getTeamConfig(tournamentId: string): { teamNames: string[]; pairToTeam: Record<string, number> } | null {
  try {
    const raw = localStorage.getItem(`${TEAM_CONFIG_KEY}${tournamentId}`);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.teamNames?.length && data?.pairToTeam && typeof data.pairToTeam === "object") return data;
    return null;
  } catch {
    return null;
  }
}

interface MatchesSectionProps {
  tournament: Tournament;
  matches: Match[];
  pairs: Pair[];
  matchesByRound?: Record<number, Match[]>;
  forceRefresh: number;
  setForceRefresh: React.Dispatch<React.SetStateAction<number>>;
  isTournamentFinished: boolean;
  winner: Pair | null;
  onShowWinnerScreen: () => void;
  onBackToHome: () => void;
  onReloadMatches?: () => void;
  userId?: string;
}

function renderRoundBlock(
  round: string,
  roundMatches: Match[],
  opts: {
    pairs: Pair[];
    tournament: Tournament;
    forceRefresh: number;
    setForceRefresh: React.Dispatch<React.SetStateAction<number>>;
    userId?: string;
    roundTitle?: React.ReactNode;
    onReloadMatches?: () => void | Promise<void>;
    onAfterScoreSaved?: () => void | Promise<void>;
  }
) {
  const {
    pairs,
    tournament,
    forceRefresh,
    setForceRefresh,
    userId,
    roundTitle,
    onReloadMatches,
    onAfterScoreSaved,
  } = opts;

  return (
    <div key={round} className="round-section-simplified">
      <div className="round-header-simplified">
        <div className="round-header-simplified__left">
          {roundTitle ?? (
            <h4 className="round-header-simplified__title">
              <span className="round-header-simplified__label">Ronda</span>
              <span className="round-header-simplified__num">{round}</span>
            </h4>
          )}
          <div className="round-header-simplified__line" aria-hidden />
        </div>
        <span className="round-header-simplified__count">
          {roundMatches.length} partidos
        </span>
      </div>
      <div className="matches-grid-simplified">
        {[...roundMatches]
          .sort((a, b) => (a.court ?? 1) - (b.court ?? 1))
          .map((match, matchIdx) => (
          <div
            key={match.id}
            style={{ "--i": matchIdx } as React.CSSProperties}
          >
            <MatchCardWithResults
              match={match}
              pairs={pairs}
              maxCourts={Math.max(1, tournament.courts || 1)}
              isSelected={false}
              onSelect={() => {}}
              onCorrectScore={async () => {
                await onReloadMatches?.();
                await onAfterScoreSaved?.();
                setForceRefresh((prev) => prev + 1);
              }}
              forceRefresh={forceRefresh}
              userId={userId}
            />
          </div>
        ))}
      </div>
      <RestingPairsSection
        pairs={pairs}
        matches={roundMatches}
        round={roundMatches[0]?.round ?? parseInt(round, 10)}
        courts={tournament.courts}
      />
    </div>
  );
}

export const MatchesSection: React.FC<MatchesSectionProps> = ({
  tournament,
  matches,
  pairs,
  forceRefresh,
  setForceRefresh,
  isTournamentFinished,
  winner,
  onShowWinnerScreen,
  onBackToHome,
  onReloadMatches,
  userId,
}) => {
  const teamConfig = useMemo(() => {
    if (tournament.format === "teams" && tournament.team_config?.teamNames?.length && tournament.team_config?.pairToTeam) {
      return tournament.team_config;
    }
    return getTeamConfig(tournament.id);
  }, [tournament.id, tournament.format, tournament.team_config]);

  const [configTick, setConfigTick] = useState(0);
  const championshipActive = isRoundRobinChampionshipActive(tournament);
  const champConfig = useMemo(() => {
    void configTick;
    return loadChampionshipConfig(tournament.id);
  }, [tournament.id, configTick]);

  useEffect(() => {
    void syncChampionshipConfigFromPublic(tournament.id).then(() => {
      setConfigTick((n) => n + 1);
    });
  }, [tournament.id]);

  useEffect(() => {
    const cfg = loadChampionshipConfig(tournament.id);
    if (cfg?.championshipEnabled) {
      void syncChampionshipConfigPublic(tournament.id, cfg);
    }
  }, [tournament.id, forceRefresh, configTick]);

  const { regular, championship } = useMemo(
    () => partitionMatches(matches, tournament.id, champConfig),
    [matches, tournament.id, champConfig]
  );

  const regularByRound = useMemo(() => {
    const acc: Record<number, Match[]> = {};
    for (const m of regular) {
      const r = m.round || 1;
      if (!acc[r]) acc[r] = [];
      acc[r].push(m);
    }
    return acc;
  }, [regular]);

  const championshipByRound = useMemo(
    () => groupChampionshipByRound(championship, champConfig?.regularRoundsMax),
    [championship, champConfig?.regularRoundsMax]
  );

  const generatingRef = useRef(false);
  const [championPair, setChampionPair] = useState<Pair | null>(null);

  const tryGenerateChampionship = useCallback(async () => {
    if (!championshipActive || !userId || generatingRef.current) return;
    generatingRef.current = true;
    try {
      const created = await maybeGenerateChampionshipRound({
        tournament,
        matches,
        pairs,
        userId,
      });
      if (created.length > 0) {
        setConfigTick((n) => n + 1);
        await onReloadMatches?.();
        setForceRefresh((n) => n + 1);
      }
    } catch (e) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : String(e);
      console.warn("[remontada-final] no se pudo generar ronda:", msg, e);
    } finally {
      generatingRef.current = false;
    }
  }, [championshipActive, userId, tournament, matches, pairs, onReloadMatches, setForceRefresh]);

  useEffect(() => {
    void tryGenerateChampionship();
  }, [tryGenerateChampionship, forceRefresh, matches]);

  useEffect(() => {
    if (!isTournamentFinished || !championshipActive) {
      setChampionPair(null);
      return;
    }
    let cancelled = false;
    void resolveChampionPair(pairs, matches).then((p) => {
      if (!cancelled) setChampionPair(p);
    });
    return () => {
      cancelled = true;
    };
  }, [isTournamentFinished, championshipActive, pairs, matches, forceRefresh]);

  if (!tournament.is_started) return null;

  const roundBlockOpts = {
    pairs,
    tournament,
    forceRefresh,
    setForceRefresh,
    userId,
    onReloadMatches,
    onAfterScoreSaved: tryGenerateChampionship,
  };

  const canShowWinnersButton =
    championshipActive
      ? isTournamentFinished
      : isTournamentFinished || tournament.is_finished;

  return (
    <div className="matches-container-simplified">
      <div className="matches-header-simplified">
        <h3>Partidos</h3>
        <span className="matches-count-simplified">{matches.length} total</span>
      </div>

      {matches.length === 0 ? (
        <div className="matches-error-simplified">
          <p>📝 No hay partidos programados aún</p>
          <p>Inicia la reta para generar los partidos automáticamente</p>
        </div>
      ) : (
        <>
          {Object.entries(regularByRound)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([round, roundMatches]) =>
              renderRoundBlock(round, roundMatches, roundBlockOpts)
            )}

          {championshipActive && (
            <section className="rr-championship" aria-label="Remontada Final">
              <header className="rr-championship__header">
                <span className="rr-championship__icon" aria-hidden>
                  ⚡
                </span>
                <div>
                  <h3 className="rr-championship__title">REMONTADA FINAL</h3>
                  <p className="rr-championship__subtitle">
                    Los mejores se vuelven a ver las caras
                  </p>
                </div>
              </header>

              {regular.length > 0 &&
                !regular.every((m) => m.status === "finished") && (
                  <p className="rr-championship__pending">
                    Se activará cuando terminen todas las rondas del Round Robin.
                  </p>
                )}

              {regular.length > 0 &&
                regular.every((m) => m.status === "finished") &&
                championship.length === 0 &&
                champConfig &&
                champConfig.championshipRoundsGenerated <
                  champConfig.championshipRounds && (
                  <p className="rr-championship__pending">
                    Preparando partidos de remontada…
                  </p>
                )}

              {Object.keys(championshipByRound)
                .sort((a, b) => Number(a) - Number(b))
                .map((roundKey) => {
                  const idx = Number(roundKey);
                  const roundMatches = championshipByRound[idx];
                  return renderRoundBlock(
                    String(idx),
                    roundMatches,
                    {
                      ...roundBlockOpts,
                      roundTitle: (
                        <h4 className="round-header-simplified__title rr-championship__round-title">
                          <span className="rr-championship__round-label">
                            REMONTADA RONDA {idx}
                          </span>
                        </h4>
                      ),
                    }
                  );
                })}

              {championshipActive &&
                champConfig &&
                champConfig.championshipRoundsGenerated <
                  champConfig.championshipRounds &&
                regular.every((m) => m.status === "finished") &&
                championship.length > 0 &&
                championship.every((m) => m.status === "finished") && (
                  <p className="rr-championship__pending">
                    Preparando siguiente ronda de campeonato…
                  </p>
                )}
            </section>
          )}
        </>
      )}

      <RealTimeStandingsTable
        tournamentId={tournament.id}
        forceRefresh={forceRefresh}
        teamConfig={teamConfig}
      />

      {isTournamentFinished && championshipActive && championPair && (
        <div className="rr-championship__winner">
          <span className="rr-championship__winner-badge" aria-hidden>
            🏆
          </span>
          <div>
            <p className="rr-championship__winner-title">
              ¡Campeón del torneo!
            </p>
            <p className="rr-championship__winner-name">
              {championPair.player1_name} / {championPair.player2_name}
            </p>
          </div>
        </div>
      )}

      {canShowWinnersButton && winner && (
        <div className="winner-button-container">
          <button className="show-winner-button" onClick={onShowWinnerScreen}>
            🏆 Ver ganadores
          </button>
        </div>
      )}

      <div className="back-home-button-container riviera-back-toolbar">
        <Button type="button" variant="back" onClick={onBackToHome}>
          ← Volver al inicio
        </Button>
      </div>
    </div>
  );
};

export default MatchesSection;
