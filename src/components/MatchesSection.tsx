import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tournament, Match, Pair } from "../lib/database";
import MatchCardWithResults from "./MatchCardWithResults";
import RealTimeStandingsTable from "./RealTimeStandingsTable";
import RestingPairsSection from "./RestingPairsSection";
import { Button } from "./ui";
import { TablerIcon } from "./ui/TablerIcon";
import { EmptyState } from "./platform/EmptyState";
import {
  groupChampionshipByRound,
  isRoundRobinChampionshipActive,
  loadChampionshipConfig,
  maybeGenerateChampionshipRound,
  partitionMatches,
  syncChampionshipConfigFromPublic,
  syncChampionshipConfigPublic,
  championshipRoundLabel,
  championshipMatchEncounterLabel,
  sortChampionshipRoundMatches,
} from "../lib/roundRobinChampionship";
import { useResolvedTeamConfig } from "../hooks/useResolvedTeamConfig";
import { compareMatchCourt } from "../lib/matchCourt";
import {
  getDynamicTeamBlocks,
  type RetaDynamicBlockRow,
} from "../lib/reta/dynamicTeamBlocksApi";
import { generateNextDynamicBlock } from "../lib/reta/generateNextDynamicBlock";
import { resolveTotalDynamicBlocks } from "../lib/reta/dynamicTeamLineups";
import { pairsAppearingInMatches } from "../lib/teamConfigDisplay";

interface MatchesSectionProps {
  tournament: Tournament;
  matches: Match[];
  pairs: Pair[];
  matchesByRound?: Record<number, Match[]>;
  forceRefresh: number;
  setForceRefresh: React.Dispatch<React.SetStateAction<number>>;
  onBackToHome: () => void;
  onReloadMatches?: () => void;
  userId?: string;
  hideStandings?: boolean;
  hideBackButton?: boolean;
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
    matchEncounterLabel?: (match: Match) => string | undefined;
    onAfterScoreSaved?: () => void | Promise<void>;
    teamConfig?: { teamNames: string[]; pairToTeam: Record<string, number> } | null;
    /** Si se pasa, "parejas que descansan" solo considera este set (p.ej. parejas del bloque). */
    restingCandidatePairs?: Pair[];
    hideRestingPairs?: boolean;
  }
) {
  const {
    pairs,
    tournament,
    forceRefresh,
    setForceRefresh,
    userId,
    roundTitle,
    matchEncounterLabel,
    onAfterScoreSaved,
    teamConfig,
    restingCandidatePairs,
    hideRestingPairs,
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
          .sort((a, b) => compareMatchCourt(a.court, b.court))
          .map((match, matchIdx) => {
          const encounterLabel = matchEncounterLabel?.(match);
          return (
          <div
            key={match.id}
            style={{ "--i": matchIdx } as React.CSSProperties}
          >
            <MatchCardWithResults
              match={match}
              pairs={pairs}
              maxCourts={Math.max(1, tournament.courts || 1)}
              roundLabelOverride={encounterLabel ?? undefined}
              isSelected={false}
              onSelect={() => {}}
              onCorrectScore={async () => {
                await onAfterScoreSaved?.();
                setForceRefresh((prev) => prev + 1);
              }}
              forceRefresh={forceRefresh}
              userId={userId}
              teamConfig={teamConfig}
            />
          </div>
          );
        })}
      </div>
      {!hideRestingPairs ? (
        <RestingPairsSection
          pairs={restingCandidatePairs ?? pairs}
          matches={roundMatches}
          round={roundMatches[0]?.round ?? parseInt(round, 10)}
          courts={tournament.courts}
        />
      ) : null}
    </div>
  );
}

export const MatchesSection: React.FC<MatchesSectionProps> = ({
  tournament,
  matches,
  pairs,
  forceRefresh,
  setForceRefresh,
  onBackToHome,
  onReloadMatches,
  userId,
  hideStandings = false,
  hideBackButton = false,
}) => {
  const teamConfig = useResolvedTeamConfig(tournament, pairs);

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

  const isDynamicLineups = Boolean(tournament.team_config?.dynamicLineups?.enabled);
  const [dynamicBlocks, setDynamicBlocks] = useState<RetaDynamicBlockRow[]>([]);
  const [dynamicBlocksTick, setDynamicBlocksTick] = useState(0);

  useEffect(() => {
    if (!isDynamicLineups) return;
    let cancelled = false;
    void getDynamicTeamBlocks(tournament.id).then((rows) => {
      if (!cancelled) setDynamicBlocks(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [isDynamicLineups, tournament.id, forceRefresh, dynamicBlocksTick]);

  const dynamicGeneratingRef = useRef(false);
  const tryGenerateNextDynamicBlock = useCallback(async () => {
    if (!isDynamicLineups || !userId || dynamicGeneratingRef.current) return;
    dynamicGeneratingRef.current = true;
    try {
      const result = await generateNextDynamicBlock({ tournament, pairs, matches, userId });
      if (result.status === "generated") {
        setDynamicBlocksTick((n) => n + 1);
        await onReloadMatches?.();
        setForceRefresh((n) => n + 1);
      }
    } catch (e) {
      console.warn("[alineacion-dinamica] no se pudo generar el siguiente bloque:", e);
    } finally {
      dynamicGeneratingRef.current = false;
    }
  }, [isDynamicLineups, userId, tournament, pairs, matches, onReloadMatches, setForceRefresh]);

  useEffect(() => {
    void tryGenerateNextDynamicBlock();
  }, [tryGenerateNextDynamicBlock, forceRefresh, matches]);

  const completedDynamicBlocks = useMemo(
    () =>
      dynamicBlocks
        .filter((b) => b.status === "completed")
        .sort((a, b) => a.block_number - b.block_number),
    [dynamicBlocks]
  );

  const dynamicBlockGroups = useMemo(() => {
    if (!isDynamicLineups) return [];
    return completedDynamicBlocks.map((block) => ({
      block,
      matches: regular.filter(
        (m) => (m.round ?? 0) >= block.round_start && (m.round ?? 0) <= block.round_end
      ),
    }));
  }, [isDynamicLineups, completedDynamicBlocks, regular]);

  const playerNameById = useMemo(() => {
    const map = new Map<string, string>();
    pairs.forEach((p) => {
      if (p.player1_id) map.set(p.player1_id, p.player1_name);
      if (p.player2_id) map.set(p.player2_id, p.player2_name);
    });
    return map;
  }, [pairs]);

  const canOfferNextDynamicBlock = useMemo(() => {
    const dyn = tournament.team_config?.dynamicLineups;
    const current = completedDynamicBlocks[completedDynamicBlocks.length - 1];
    if (!isDynamicLineups || !dyn || !current) return false;
    const totalBlocks = resolveTotalDynamicBlocks(dyn.totalRounds, dyn.pairsPerTeam);
    if (current.block_number >= totalBlocks) return false;
    const currentBlockMatches = matches.filter(
      (m) => (m.round ?? 0) >= current.round_start && (m.round ?? 0) <= current.round_end
    );
    return (
      currentBlockMatches.length > 0 &&
      currentBlockMatches.every((m) => m.status === "finished")
    );
  }, [isDynamicLineups, tournament.team_config, completedDynamicBlocks, matches]);

  if (!tournament.is_started) return null;

  const roundBlockOpts = {
    pairs,
    tournament,
    forceRefresh,
    setForceRefresh,
    userId,
    onAfterScoreSaved: tryGenerateChampionship,
    teamConfig,
    restingCandidatePairs:
      teamConfig?.pairToTeam && !isDynamicLineups
        ? pairs.filter((p) => Object.prototype.hasOwnProperty.call(teamConfig.pairToTeam, p.id))
        : undefined,
  };

  return (
    <div className="matches-container-simplified rv-card-soft ro-surface-dark">
      <div className="matches-header-simplified">
        <h3>Partidos</h3>
        <span className="matches-count-simplified">{matches.length} total</span>
      </div>

      {matches.length === 0 ? (
        <EmptyState
          className="matches-error-simplified"
          icon={<TablerIcon name="clipboard-list" size={32} />}
          title="No hay partidos programados aún"
          description="Inicia la reta para generar los partidos automáticamente"
        />
      ) : (
        <>
          {isDynamicLineups
            ? dynamicBlockGroups.map(({ block, matches: blockMatches }) => {
                const matchesByRoundInBlock: Record<number, Match[]> = {};
                blockMatches.forEach((m) => {
                  const r = m.round || block.round_start;
                  if (!matchesByRoundInBlock[r]) matchesByRoundInBlock[r] = [];
                  matchesByRoundInBlock[r].push(m);
                });
                const blockActivePairs = pairsAppearingInMatches(
                  pairs,
                  blockMatches
                ) as Pair[];
                return (
                  <section
                    key={block.block_number}
                    className="dynamic-lineups-block"
                    aria-label={
                      block.stage === "initial_round_robin"
                        ? "Round Robin inicial"
                        : `Ronda ${block.round_start}`
                    }
                  >
                    <header className="dynamic-lineups-block__header">
                      <h3 className="dynamic-lineups-block__title">
                        {block.stage === "initial_round_robin"
                          ? "ROUND ROBIN INICIAL"
                          : `RONDA ${block.round_start}`}
                      </h3>
                      <span className="dynamic-lineups-block__rounds">
                        {block.round_start === block.round_end
                          ? `Ronda ${block.round_start}`
                          : `Rondas ${block.round_start}–${block.round_end}`}
                      </span>
                    </header>
                    {block.stage === "dynamic_round" ? (
                      <div className="dynamic-lineups-block__change" role="status">
                        <p className="dynamic-lineups-block__change-title">
                          Ronda {block.round_start - 1} completada. Las nuevas
                          alineaciones fueron generadas según el rendimiento de
                          los jugadores.
                        </p>
                        <div className="dynamic-lineups-block__change-teams">
                          {block.teams.map((t) => (
                            <div key={t.teamIndex} className="dynamic-lineups-block__change-team">
                              <span className="dynamic-lineups-block__change-team-name">
                                {teamConfig?.teamNames?.[t.teamIndex] ??
                                  `Equipo ${t.teamIndex + 1}`}
                              </span>
                              <ul>
                                {t.lineup.pairs.map((pair, idx) => (
                                  <li key={idx}>
                                    {pair
                                      .map((playerId: string) => playerNameById.get(playerId) ?? "—")
                                      .join(" / ")}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {Object.entries(matchesByRoundInBlock)
                      .sort(([a], [b]) => Number(a) - Number(b))
                      .map(([round, roundMatches]) =>
                        renderRoundBlock(round, roundMatches, {
                          ...roundBlockOpts,
                          hideRestingPairs: false,
                          restingCandidatePairs: blockActivePairs,
                        })
                      )}
                  </section>
                );
              })
            : Object.entries(regularByRound)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([round, roundMatches]) =>
                  renderRoundBlock(round, roundMatches, roundBlockOpts)
                )}

          {isDynamicLineups && canOfferNextDynamicBlock ? (
            <div className="dynamic-lineups-block__next-action">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  void tryGenerateNextDynamicBlock();
                }}
              >
                Generar siguiente bloque
              </Button>
            </div>
          ) : null}

          {championshipActive && (
            <section className="rr-championship" aria-label="Remontada Final">
              <header className="rr-championship__header">
                <span className="rr-championship__icon" aria-hidden>
                  <TablerIcon name="bolt" size={20} />
                </span>
                <div>
                  <h3 className="rr-championship__title">REMONTADA FINAL</h3>
                  <p className="rr-championship__subtitle">
                    Una oportunidad más de demostrar tu potencial
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
                  const totalRounds = champConfig?.championshipRounds ?? idx;
                  const semiMatches = championshipByRound[idx - 1] ?? [];
                  const sortedRoundMatches = sortChampionshipRoundMatches(
                    roundMatches,
                    idx,
                    totalRounds,
                    semiMatches
                  );
                  return renderRoundBlock(
                    String(idx),
                    sortedRoundMatches,
                    {
                      ...roundBlockOpts,
                      roundTitle: (
                        <h4 className="round-header-simplified__title rr-championship__round-title">
                          <span className="rr-championship__round-label">
                            {championshipRoundLabel(idx, totalRounds)}
                          </span>
                        </h4>
                      ),
                      matchEncounterLabel: (match) =>
                        championshipMatchEncounterLabel(
                          match,
                          idx,
                          totalRounds,
                          semiMatches
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

      {!hideStandings ? (
        <RealTimeStandingsTable
          tournamentId={tournament.id}
          forceRefresh={forceRefresh}
          teamConfig={teamConfig}
        />
      ) : null}

      {!hideBackButton ? (
        <div className="back-home-button-container riviera-back-toolbar">
          <Button type="button" variant="back" onClick={onBackToHome}>
            ← Volver al inicio
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export default MatchesSection;
