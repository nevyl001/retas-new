import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  getMatches,
  getPairs,
  getTournamentGames,
  getTournamentByIdPublic,
  getTournamentPublicConfig,
  getTournamentPublicConfigExtended,
} from "../lib/database";
import { Match, Pair, Game, Tournament } from "../lib/database";
import { repairMatchCourtRotation } from "../lib/circleRoundRobinSchedule";
import { isTeamsTournament } from "../lib/gameModeMapping";
import {
  getPairTeamIndex,
  getPairTeamName,
} from "../lib/teamConfigDisplay";
import { resolveRetaStandingsHelpMode } from "../lib/standingsHelpMode";
import {
  buildTeamWinnerCelebrateStatCards,
  teamStandingRowToWinnerStats,
} from "../lib/teamWinnerCelebrate";
import {
  computePairsWithStats,
  computeTeamStandings,
  getMatchScoresForStandings,
  resolvePublicStandingsTeamConfig,
  sortPairsForStandings,
} from "../lib/standingsUtils";
import type { TeamConfig } from "./RealTimeStandingsTable";
import { useRealtimeSubscription } from "../hooks/useRealtimeSubscription";
import type { TournamentWinner } from "../lib/tournamentWinner";
import {
  matchesForStandingsTable,
  resolveTournamentPodiumOutcome,
} from "../lib/resolveTournamentOutcome";
import { ClubIdentity, formatTenantDocumentTitle, isClubBrandedOrganizer, useClubExperience, useOrganizerDisplayName } from "../club-experience";
import { isPubDsV2Enabled } from "../config/peds";
import { PublicTorneoExpressShell } from "./torneo-express/public/PublicTorneoExpressShell";
import { StatusBadge } from "./platform/StatusBadge";
import { PublicHero } from "./public/peds";
import { PublicRetaMatchCard } from "./public/PublicRetaMatchCard";
import type { PublicRetaPairPlayer } from "./public/PublicRetaPairSide";
import {
  PublicRetaStandingsSection,
  type PublicRetaStandingRow,
} from "./public/PublicRetaStandingsSection";
import { PublicRetaRestingPairsSection } from "./public/PublicRetaRestingPairsSection";
import {
  PublicRetaWinnerSection,
  type PublicRetaWinnerAvatar,
} from "./public/PublicRetaWinnerSection";
import { RetaRoundRobinWinnerCelebrate } from "./reta/RetaRoundRobinWinnerCelebrate";
import {
  pairPlayer1DisplayName,
  pairPlayer2DisplayName,
  pairPlayersDisplayLabel,
} from "../lib/pairPlayerNames";
import {
  resolvePlayerAvatars,
  resolvePlayerPublicProfiles,
  type PlayerAvatarLookupEntry,
  type PlayerPublicProfile,
} from "../lib/rivieraJugadores/publicPlayerAvatars";
import {
  championshipMatchEncounterLabel,
  championshipRoundLabel,
  enrichChampionshipConfigForPartition,
  groupChampionshipByRound,
  isRoundRobinTournamentComplete,
  loadChampionshipConfig,
  parseChampionshipConfig,
  partitionMatches,
  sortChampionshipRoundMatches,
  type RoundRobinChampionshipConfig,
} from "../lib/roundRobinChampionship";
import "./public/riviera-public-americano.css";

interface PublicTournamentViewProps {
  tournamentId: string;
}

const RetaPublicHeader: React.FC<{
  formatKicker: string;
  publicTournamentName: string | null;
  publicTournamentDescription: string | null;
  showClubBranding?: boolean;
}> = ({
  formatKicker,
  publicTournamentName,
  publicTournamentDescription,
  showClubBranding = false,
}) => {
  const { isClubBranded } = useClubExperience();

  return (
    <header className="te-public-header te-public-header--reta te-pub-fade-in">
      <div className="te-public-header__brand">
        {isClubBranded || showClubBranding ? (
          <ClubIdentity
            variant="compact"
            showTagline={false}
            logoSurface="dark"
            wordmarkOnly
            className="te-public-header__club-identity"
          />
        ) : null}
        <p className="te-public-header__kicker">{formatKicker} · En vivo</p>
        <h1 className="te-public-header__title te-public-header__title--event">
          {publicTournamentName || "Resultados en tiempo real"}
        </h1>
        <div className="te-public-header__line" aria-hidden />
        <div className="te-public-header__meta">
          {publicTournamentDescription ? (
            <span className="te-public-header__categoria-pill te-public-header__categoria-pill--desc">
              {publicTournamentDescription}
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
};

/** Parsea team config desde el hash de la URL (#teams=...) para que móvil muestre tabla por equipos aunque falle la API */
function parseTeamConfigFromHash(): TeamConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const hash = window.location.hash.slice(1);
    const match = hash.match(/^teams=(.+)$/);
    if (!match) return null;
    const decoded = decodeURIComponent(match[1]);
    const parsed = JSON.parse(decoded) as unknown;
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as TeamConfig).teamNames) || !(parsed as TeamConfig).pairToTeam || typeof (parsed as TeamConfig).pairToTeam !== "object") return null;
    const cfg = parsed as TeamConfig;
    if (!cfg.teamNames.length || !Object.keys(cfg.pairToTeam).length) return null;
    return cfg;
  } catch {
    return null;
  }
}

const PublicTournamentView: React.FC<PublicTournamentViewProps> = ({
  tournamentId,
}) => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tournamentWinner, setTournamentWinner] =
    useState<TournamentWinner | null>(null);
  const [showWinner, setShowWinner] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [teamConfig, setTeamConfig] = useState<TeamConfig | null>(parseTeamConfigFromHash);
  const [winningTeamName, setWinningTeamName] = useState<string | null>(null);
  const [publicTournamentName, setPublicTournamentName] = useState<string | null>(null);
  const [publicTournamentDescription, setPublicTournamentDescription] = useState<
    string | null
  >(null);
  const [championshipConfig, setChampionshipConfig] =
    useState<RoundRobinChampionshipConfig | null>(null);
  const [organizadorId, setOrganizadorId] = useState<string | null>(null);
  const organizerName = useOrganizerDisplayName(organizadorId ?? undefined);
  const showClubBranding = isClubBrandedOrganizer(organizadorId);
  const [winnerAvatars, setWinnerAvatars] = useState<PublicRetaWinnerAvatar[]>(
    []
  );
  const [playerProfiles, setPlayerProfiles] = useState<
    Record<string, PlayerPublicProfile>
  >({});
  const configFetchOnDemandRef = useRef(false);

  const loadTournamentData = useCallback(async () => {
    if (!tournamentId) return;
    try {
      setError(""); // Limpiar errores previos

      const publicConfig = await getTournamentPublicConfigExtended(tournamentId);
      const configFromPublic =
        publicConfig?.format === "teams" &&
        publicConfig?.team_config?.teamNames?.length &&
        publicConfig?.team_config?.pairToTeam &&
        Object.keys(publicConfig.team_config.pairToTeam).length > 0
          ? publicConfig.team_config
          : null;

      const tournamentPromise = getTournamentByIdPublic(tournamentId);
      void tournamentPromise.then((tournamentEarly) => {
        const earlyOrgId =
          typeof tournamentEarly?.user_id === "string" &&
          tournamentEarly.user_id.trim()
            ? tournamentEarly.user_id.trim()
            : null;
        if (earlyOrgId) setOrganizadorId(earlyOrgId);
      });

      const [matchesData, pairsData, gamesData, tournament] = await Promise.all([
        getMatches(tournamentId),
        getPairs(tournamentId),
        getTournamentGames(tournamentId),
        tournamentPromise,
      ]);

      const hashTeamConfig = parseTeamConfigFromHash();
      const resolvedTeamConfig = resolvePublicStandingsTeamConfig(
        tournament,
        configFromPublic,
        tournamentId,
        hashTeamConfig
      );
      setTeamConfig(resolvedTeamConfig);

      setPublicTournamentName(
        tournament && typeof (tournament as { name?: string }).name === "string"
          ? (tournament as { name: string }).name
          : null
      );
      const t = tournament as Tournament | null | undefined;
      const rawDesc =
        t?.description && typeof t.description === "string"
          ? t.description.trim()
          : "";
      const nameNorm = (t?.name || "").trim();
      setPublicTournamentDescription(
        rawDesc && rawDesc !== nameNorm ? rawDesc : null
      );
      setOrganizadorId(
        typeof t?.user_id === "string" && t.user_id.trim()
          ? t.user_id.trim()
          : null
      );
      let resolvedMatches = matchesData;
      if (matchesData.length > 0 && t && !isTeamsTournament(t)) {
        resolvedMatches = await repairMatchCourtRotation(
          pairsData,
          t.courts,
          matchesData,
          t.format
        );
      }
      setMatches(resolvedMatches);
      setPairs(pairsData);
      setGames(gamesData || []);
      setLastUpdate(new Date());

      console.log("🔄 Vista pública actualizada:", new Date().toLocaleTimeString());

      const champCfg: RoundRobinChampionshipConfig | null =
        parseChampionshipConfig(publicConfig?.championship_config) ??
        loadChampionshipConfig(tournamentId);
      setChampionshipConfig(champCfg);

      const tournamentComplete = isRoundRobinTournamentComplete(
        matchesData,
        t ?? null,
        champCfg
      );

      if (!tournamentComplete) {
        setShowWinner(false);
        setWinningTeamName(null);
        setTournamentWinner(null);
      } else {
        if (resolvedTeamConfig) {
          const pairsWithStats = computePairsWithStats(pairsData, matchesData, gamesData || []);
          const standings = computeTeamStandings(pairsWithStats, resolvedTeamConfig);
          setWinningTeamName(standings?.[0]?.name ?? null);
          setTournamentWinner(null);
          setShowWinner(true);
        } else {
          setWinningTeamName(null);
          try {
            const outcome = await resolveTournamentPodiumOutcome(
              pairsData,
              matchesData,
              gamesData || [],
              tournamentId,
              champCfg
            );
            setTournamentWinner(outcome.winner);
            setShowWinner(true);
          } catch (err) {
            console.error("Error calculating winner:", err);
          }
        }
      }
    } catch (err) {
      setError("Error al cargar los datos de la reta");
      console.error("Error loading tournament data:", err);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  // Suscripción en tiempo real (con polling como fallback)
  // IMPORTANTE: Debe ir DESPUÉS de la definición de loadTournamentData
  useRealtimeSubscription({
    tournamentId,
    onUpdate: loadTournamentData,
    enabled: true,
  });

  // Cargar teamConfig desde config pública (anon) lo antes posible
  useEffect(() => {
    if (!tournamentId) return;
    let cancelled = false;
    getTournamentPublicConfig(tournamentId)
      .then((c) => { if (!cancelled && c?.team_config?.teamNames?.length && c?.team_config?.pairToTeam) setTeamConfig(c.team_config); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tournamentId]);

  // Reintentos para config pública (móvil: red más lenta; torneo ya configurado por equipos)
  useEffect(() => {
    if (!tournamentId || pairs.length === 0) return;
    let cancelled = false;
    const delays = [0, 400, 1000, 2000, 3500];
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    delays.forEach((delay) => {
      const t = setTimeout(() => {
        getTournamentPublicConfig(tournamentId).then((c) => {
          if (cancelled) return;
          if (c?.team_config?.teamNames?.length && c?.team_config?.pairToTeam)
            setTeamConfig(c.team_config);
        }).catch(() => {});
      }, delay);
      timeouts.push(t);
    });
    return () => { cancelled = true; timeouts.forEach(clearTimeout); };
  }, [tournamentId, pairs.length]);

  // Una vez más al renderizar: si hay parejas y aún no hay config (móvil), intentar cargar config por si la primera petición falló
  useEffect(() => {
    if (!tournamentId || pairs.length === 0 || teamConfig || configFetchOnDemandRef.current) return;
    configFetchOnDemandRef.current = true;
    getTournamentPublicConfig(tournamentId).then((c) => {
      if (c?.team_config?.teamNames?.length && c?.team_config?.pairToTeam)
        setTeamConfig(c.team_config);
    }).catch(() => {});
  }, [tournamentId, pairs.length, teamConfig]);

  useEffect(() => {
    if (!tournamentId) return;
    setLoading(true);
    loadTournamentData();

    const interval = setInterval(() => {
      loadTournamentData();
    }, 60000);
    return () => clearInterval(interval);
  }, [tournamentId, loadTournamentData]);

  const playerAvatarEntries = useMemo((): PlayerAvatarLookupEntry[] => {
    const seen = new Set<string>();
    const entries: PlayerAvatarLookupEntry[] = [];
    for (const pair of pairs) {
      for (const row of [
        { id: pair.player1_id, name: pairPlayer1DisplayName(pair) },
        { id: pair.player2_id, name: pairPlayer2DisplayName(pair) },
      ]) {
        if (!row.id || seen.has(row.id)) continue;
        seen.add(row.id);
        entries.push({
          id: row.id,
          name: row.name?.trim() || "Jugador",
        });
      }
    }
    return entries;
  }, [pairs]);

  useEffect(() => {
    if (!organizadorId || playerAvatarEntries.length === 0) {
      setPlayerProfiles({});
      return;
    }
    let cancelled = false;
    void resolvePlayerPublicProfiles(organizadorId, playerAvatarEntries, {
      publicOnly: true,
    }).then((map) => {
      if (!cancelled) setPlayerProfiles(map);
    });
    return () => {
      cancelled = true;
    };
  }, [organizadorId, playerAvatarEntries]);

  const getPairName = (pairId: string) => {
    const pair = pairs.find((p) => p.id === pairId);
    if (!pair) return "Pareja no encontrada";
    return pairPlayersDisplayLabel(pair);
  };

  const getPairPlayers = useCallback(
    (pairId: string): PublicRetaPairPlayer[] => {
      const pair = pairs.find((p) => p.id === pairId);
      if (!pair) return [];
      return [
        {
          id: pair.player1_id,
          name: pairPlayer1DisplayName(pair),
          fotoUrl: playerProfiles[pair.player1_id]?.fotoUrl ?? null,
          rating: playerProfiles[pair.player1_id]?.rating ?? 3,
        },
        {
          id: pair.player2_id,
          name: pairPlayer2DisplayName(pair),
          fotoUrl: playerProfiles[pair.player2_id]?.fotoUrl ?? null,
          rating: playerProfiles[pair.player2_id]?.rating ?? 3,
        },
      ];
    },
    [pairs, playerProfiles]
  );

  const renderPublicMatchCard = (
    match: Match,
    matchIdx: number,
    opts?: { remontadaRound?: number; encounterLabel?: string }
  ) => {
    const result = getMatchResult(match.id);
    const pair1Won =
      result.hasResult && result.pair1Score > result.pair2Score;
    const pair2Won =
      result.hasResult && result.pair2Score > result.pair1Score;
    const matchGames = games
      .filter((game) => game.match_id === match.id)
      .map((game) => ({
        id: game.id,
        pair1: game.pair1_games || 0,
        pair2: game.pair2_games || 0,
      }));

    let winnerLabel: string | null = null;
    if (
      match.status === "finished" &&
      result.hasResult &&
      (pair1Won || pair2Won)
    ) {
      winnerLabel = pair1Won
        ? getPairName(match.pair1_id)
        : getPairName(match.pair2_id);
    }

    return (
      <PublicRetaMatchCard
        key={match.id}
        pair1Label={getPairName(match.pair1_id)}
        pair2Label={getPairName(match.pair2_id)}
        pair1Players={getPairPlayers(match.pair1_id)}
        pair2Players={getPairPlayers(match.pair2_id)}
        pair1TeamLabel={teamConfig ? getPairTeamName(match.pair1_id, teamConfig) : null}
        pair2TeamLabel={teamConfig ? getPairTeamName(match.pair2_id, teamConfig) : null}
        pair1TeamIndex={teamConfig ? getPairTeamIndex(match.pair1_id, teamConfig) : null}
        pair2TeamIndex={teamConfig ? getPairTeamIndex(match.pair2_id, teamConfig) : null}
        score1={result.hasResult ? result.pair1Score : 0}
        score2={result.hasResult ? result.pair2Score : 0}
        hasResult={result.hasResult}
        court={match.court || 1}
        status={match.status === "finished" ? "finished" : "active"}
        live={match.status !== "finished"}
        index={matchIdx}
        winnerLabel={winnerLabel}
        games={matchGames.length > 0 ? matchGames : undefined}
        remontadaRound={opts?.remontadaRound}
        encounterLabel={opts?.encounterLabel}
      />
    );
  };

  const getMatchResult = (matchId: string) => {
    const match = matches.find((m) => m.id === matchId);
    const matchGames = games.filter((game) => game.match_id === matchId);

    if (!match || matchGames.length === 0) {
      if (match?.status === "finished") {
        return {
          pair1Score: match.pair1_score ?? 0,
          pair2Score: match.pair2_score ?? 0,
          hasResult: true,
        };
      }
      return { pair1Score: 0, pair2Score: 0, hasResult: false };
    }

    const { score1, score2 } = getMatchScoresForStandings(match, matchGames);

    return {
      pair1Score: score1,
      pair2Score: score2,
      hasResult: true,
    };
  };

  const standingsMatches = useMemo(
    () =>
      matchesForStandingsTable(
        matches,
        tournamentId,
        championshipConfig
      ),
    [matches, tournamentId, championshipConfig]
  );

  // Clasificación por equipos solo si hay team_config real (reta por equipos); si no, tabla por parejas (round robin).
  const pairsWithStats = useMemo(
    () => computePairsWithStats(pairs, standingsMatches, games),
    [pairs, standingsMatches, games]
  );
  const teamStandings = useMemo(() => {
    if (!teamConfig?.teamNames?.length || !teamConfig.pairToTeam || Object.keys(teamConfig.pairToTeam).length === 0)
      return null;
    return computeTeamStandings(pairsWithStats, teamConfig);
  }, [teamConfig, pairsWithStats]);
  const winningTeamRow = useMemo(() => {
    if (!teamStandings?.length) return null;
    const targetName = winningTeamName ?? teamStandings[0]?.name;
    return (
      teamStandings.find((row) => row.name === targetName) ?? teamStandings[0]
    );
  }, [teamStandings, winningTeamName]);

  const teamWinnerCelebrateStats = useMemo(() => {
    if (!winningTeamRow) return undefined;
    return buildTeamWinnerCelebrateStatCards(
      teamStandingRowToWinnerStats(winningTeamRow)
    );
  }, [winningTeamRow]);

  const sortedPairs = useMemo(
    () => sortPairsForStandings(pairsWithStats, standingsMatches, games),
    [pairsWithStats, standingsMatches, games]
  );

  const standingRows = useMemo((): PublicRetaStandingRow[] => {
    if (teamStandings && teamStandings.length > 0) {
      return teamStandings.map((row) => ({
        id: `team-${row.teamIndex}`,
        name: row.name,
        pj: row.matchesPlayed,
        pg: row.pg,
        pp: row.pp,
        fav: row.points,
        con: row.pointsReceived,
        pts: row.puntosTorneo,
      }));
    }
    return sortedPairs.map((pair) => ({
      id: pair.id,
      name: `${pair.player1_name} / ${pair.player2_name}`,
      pj: pair.matchesPlayed,
      pg: pair.pg,
      pp: pair.pp,
      fav: pair.points,
      con: pair.pointsReceived,
      pts: pair.puntosTorneo,
    }));
  }, [teamStandings, sortedPairs]);

  const winnerAvatarEntries = useMemo((): PlayerAvatarLookupEntry[] => {
    if (!showWinner) return [];

    if (tournamentWinner?.pair) {
      const p = tournamentWinner.pair;
      return [
        { id: p.player1_id, name: p.player1_name },
        { id: p.player2_id, name: p.player2_name },
      ];
    }

    if (teamConfig?.pairToTeam && pairs.length > 0) {
      const teamName = winningTeamName ?? teamStandings?.[0]?.name;
      if (teamName && teamConfig.teamNames?.length) {
        const teamIdx = teamConfig.teamNames.indexOf(teamName);
        if (teamIdx >= 0) {
          const teamPair = pairs.find(
            (pair) => teamConfig.pairToTeam[pair.id] === teamIdx
          );
          if (teamPair) {
            return [
              { id: teamPair.player1_id, name: teamPair.player1_name },
              { id: teamPair.player2_id, name: teamPair.player2_name },
            ];
          }
        }
      }
    }

    return [];
  }, [
    showWinner,
    tournamentWinner,
    teamConfig,
    pairs,
    winningTeamName,
    teamStandings,
  ]);

  useEffect(() => {
    if (!showWinner || !organizadorId || winnerAvatarEntries.length === 0) {
      setWinnerAvatars([]);
      return;
    }
    let cancelled = false;
    void resolvePlayerAvatars(organizadorId, winnerAvatarEntries, {
      publicOnly: true,
    }).then((map) => {
      if (cancelled) return;
      setWinnerAvatars(
        winnerAvatarEntries.map((e) => ({
          name: e.name,
          fotoUrl: map[e.id] ?? null,
        }))
      );
    });
    return () => {
      cancelled = true;
    };
  }, [showWinner, organizadorId, winnerAvatarEntries]);

  useEffect(() => {
    const defaultTitle = formatTenantDocumentTitle(
      null,
      organizerName,
      "Retas y torneos de pádel"
    );
    document.title = formatTenantDocumentTitle(
      publicTournamentName,
      organizerName,
      "Retas y torneos de pádel"
    );
    return () => {
      document.title = defaultTitle;
    };
  }, [publicTournamentName, organizerName]);

  if (loading) {
    return (
      <PublicTorneoExpressShell
        className="te-public--reta te-public--reta-wide"
        organizadorId={organizadorId}
      >
        <div className="te-public-loading">
          <div className="te-public-loading__pulse" aria-hidden />
          <p>Cargando resultados de la reta…</p>
        </div>
      </PublicTorneoExpressShell>
    );
  }

  if (error) {
    return (
      <PublicTorneoExpressShell
        className="te-public--reta te-public--reta-wide"
        organizadorId={organizadorId}
      >
        <p className="te-public-error">{error}</p>
      </PublicTorneoExpressShell>
    );
  }

  const { regular: regularMatches, championship: championshipMatches } =
    partitionMatches(matches, tournamentId, championshipConfig);

  const matchesByRound = regularMatches.reduce((acc, match) => {
    const round = match.round || 1;
    if (!acc[round]) acc[round] = [];
    acc[round].push(match);
    return acc;
  }, {} as Record<number, Match[]>);

  const effectiveChampionshipConfig =
    championshipMatches.length > 0 || championshipConfig?.championshipEnabled
      ? enrichChampionshipConfigForPartition(matches, championshipConfig)
      : championshipConfig;

  const championshipByRound = groupChampionshipByRound(
    championshipMatches,
    effectiveChampionshipConfig?.regularRoundsMax
  );

  const remontadaActiva = Boolean(
    effectiveChampionshipConfig?.championshipEnabled ||
      championshipConfig?.championshipEnabled ||
      championshipMatches.length > 0
  );

  const formatKicker = teamStandings?.length
    ? "Dual meet"
    : remontadaActiva
      ? "Round Robin · Remontada final"
      : "Round Robin";

  const standingsScoringMode = resolveRetaStandingsHelpMode({
    hasTeamStandings: Boolean(teamStandings?.length),
    remontadaActiva,
  });

  // Calcular número de canchas desde los matches (el court más alto)
  const courts = matches.length > 0 
    ? Math.max(...matches.map(m => m.court || 1))
    : 1;

  return (
    <PublicTorneoExpressShell
      className="te-public--reta te-public--reta-wide"
      organizadorId={organizadorId}
    >
      {isPubDsV2Enabled ? (
        <PublicHero
          logoClub={
            showClubBranding ? (
              <ClubIdentity
                variant="compact"
                showTagline={false}
                logoSurface="dark"
                wordmarkOnly
                className="peds-hero__club-identity"
              />
            ) : undefined
          }
          estado={<StatusBadge variant="live">En vivo</StatusBadge>}
          nombreEvento={publicTournamentName || "Resultados en tiempo real"}
          club={organizerName}
          categoria={publicTournamentDescription}
          meta={formatKicker}
        />
      ) : (
        <RetaPublicHeader
          formatKicker={formatKicker}
          publicTournamentName={publicTournamentName}
          publicTournamentDescription={publicTournamentDescription}
          showClubBranding={showClubBranding}
        />
      )}

      <section className="te-public-section te-pub-fade-in">
        <h2 className="te-public-section__title">Partidos por ronda</h2>
        <div className="te-public-section__divider" aria-hidden />

        {Object.keys(matchesByRound)
          .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
          .map((roundKey, roundIdx) => {
            const roundNum = parseInt(roundKey, 10);
            const roundMatches = matchesByRound[roundNum];
            const roundInProgress = roundMatches.some(
              (m) => m.status !== "finished"
            );

            return (
              <div
                key={roundKey}
                className="te-public-round-block te-pub-fade-in-up"
                style={{ animationDelay: `${0.05 + roundIdx * 0.06}s` }}
              >
                <div className="te-public-round-head">
                  <h3 className="te-public-round-head__title">
                    <span className="te-public-round-head__num">
                      Ronda {roundNum}
                    </span>
                    {publicTournamentDescription ? (
                      <>
                        <span className="te-public-round-head__sep">·</span>
                        <span className="te-public-round-head__phase">
                          {publicTournamentDescription}
                        </span>
                      </>
                    ) : null}
                    {roundInProgress ? (
                      <span className="te-public-round-head__live">
                        <span className="te-pub-status__dot" aria-hidden />
                        en curso
                      </span>
                    ) : null}
                  </h3>
                </div>

                <div className="te-pub-matches-grid te-pub-matches-grid--wide">
                  {[...roundMatches]
                    .sort((a, b) => (a.court ?? 1) - (b.court ?? 1))
                    .map((match, matchIdx) =>
                      renderPublicMatchCard(match, matchIdx, {
                        encounterLabel: `Encuentro ${matchIdx + 1}`,
                      })
                    )}
                </div>

                <PublicRetaRestingPairsSection
                  pairs={pairs}
                  matches={matches}
                  round={roundNum}
                  courts={courts}
                />
              </div>
            );
          })}

        {remontadaActiva && (
          <div className="rr-championship rr-championship--public te-pub-fade-in-up">
            <header className="rr-championship__header">
              <span className="rr-championship__icon" aria-hidden>
                ⚡
              </span>
              <div>
                <h3 className="rr-championship__title">REMONTADA FINAL</h3>
                <p className="rr-championship__subtitle">
                  Una oportunidad más de demostrar tu potencial
                  {championshipMatches.length > 0
                    ? ` · ${championshipMatches.length} partido${
                        championshipMatches.length === 1 ? "" : "s"
                      }`
                    : ""}
                </p>
              </div>
            </header>
            {championshipMatches.length === 0 ? (
              <p className="rr-championship__pending-public">
                Se publicarán aquí los partidos de remontada al terminar el
                Round Robin.
              </p>
            ) : null}
            {championshipMatches.length > 0 &&
              Object.keys(championshipByRound)
              .sort((a, b) => Number(a) - Number(b))
              .map((roundKey, roundIdx) => {
                const idx = Number(roundKey);
                const roundMatches = championshipByRound[idx];
                const totalRounds =
                  effectiveChampionshipConfig?.championshipRounds ??
                  championshipConfig?.championshipRounds ??
                  idx;
                const semiMatches = championshipByRound[idx - 1] ?? [];
                const sortedRoundMatches = sortChampionshipRoundMatches(
                  roundMatches,
                  idx,
                  totalRounds,
                  semiMatches
                );
                const roundInProgress = roundMatches.some(
                  (m) => m.status !== "finished"
                );
                return (
                  <div
                    key={`champ-${roundKey}`}
                    className="te-public-round-block te-pub-fade-in-up"
                    style={{ animationDelay: `${0.05 + roundIdx * 0.06}s` }}
                  >
                    <div className="te-public-round-head">
                      <h3 className="te-public-round-head__title rr-championship__round-title">
                        <span className="rr-championship__round-label">
                          {championshipRoundLabel(idx, totalRounds)}
                        </span>
                        {roundInProgress ? (
                          <span className="te-public-round-head__live">
                            <span className="te-pub-status__dot" aria-hidden />
                            en curso
                          </span>
                        ) : null}
                      </h3>
                    </div>
                    <div className="te-pub-matches-grid te-pub-matches-grid--wide">
                      {sortedRoundMatches.map((match, matchIdx) =>
                        renderPublicMatchCard(match, matchIdx, {
                          remontadaRound: idx,
                          encounterLabel: championshipMatchEncounterLabel(
                            match,
                            idx,
                            totalRounds,
                            semiMatches
                          ),
                        })
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>

      <PublicRetaStandingsSection
        rows={standingRows}
        title={
          championshipConfig?.championshipEnabled
            ? "Clasificación (Round Robin)"
            : "Clasificación"
        }
        entityHeader={teamStandings?.length ? "EQUIPO" : "PAREJA"}
        scoringMode={standingsScoringMode}
      />

      {showWinner &&
        teamStandings &&
        teamStandings.length > 0 &&
        (winningTeamName || teamStandings[0]?.name) && (
          <PublicRetaWinnerSection
            title={winningTeamName || teamStandings[0]?.name}
            subtitle="Equipo ganador por games acumulados"
            torneoNombre={publicTournamentName ?? undefined}
            formatKicker="Dual meet"
            stats={teamWinnerCelebrateStats}
            shareable
          />
        )}

      {showWinner &&
        (!teamStandings || teamStandings.length === 0) &&
        tournamentWinner && (
          <RetaRoundRobinWinnerCelebrate
            pairLabel={`${tournamentWinner.pair.player1_name} / ${tournamentWinner.pair.player2_name}`}
            pairId={tournamentWinner.pair.id}
            torneoNombre={publicTournamentName ?? undefined}
            rankLabel={
              championshipConfig?.championshipEnabled
                ? "1.er lugar · Remontada Final"
                : "1.er lugar"
            }
            statsLayout={
              championshipConfig?.championshipEnabled ? "default" : "round-robin"
            }
            tournamentWinner={tournamentWinner}
            winners={winnerAvatars}
          />
        )}

      <footer className="te-public-sync-footer te-pub-fade-in" aria-live="polite">
        <p className="te-public-sync-footer__line">
          Actualización en tiempo real · Última actualización:{" "}
          {lastUpdate.toLocaleTimeString()}
        </p>
        <p className="te-public-sync-footer__line">
          Vista pública de resultados · solo lectura
        </p>
      </footer>
    </PublicTorneoExpressShell>
  );
};

export default PublicTournamentView;
