import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  getPairs,
  getMatches,
  getGames,
  updateMatch,
  getTournamentById,
  getTournamentPublicConfig,
  Match,
  Game,
  Pair,
} from "../lib/database";
import {
  computePairsWithStats,
  computeTeamStandings,
  getTeamConfigFromStorage,
  inferTeamConfigFromPairs,
  sortPairsForStandings,
} from "../lib/standingsUtils";
import { matchesForStandingsTable } from "../lib/resolveTournamentOutcome";
import {
  loadChampionshipConfig,
} from "../lib/roundRobinChampionship";
import { useRealtimeSubscription } from "../hooks/useRealtimeSubscription";
import { StandingsDifCell } from "./standings/StandingsDifCell";
import { StandingsPtsCell } from "./standings/StandingsPtsCell";
import { StandingsScoringHelp } from "./standings/StandingsScoringHelp";
import { StandingsTableHeader } from "./standings/StandingsTableHeader";
import {
  COL_CON,
  COL_ENTITY,
  COL_FAV,
  COL_PG,
  COL_PJ,
  COL_POS,
  COL_PP,
  TABLA_RANKING_CLASS,
  TABLA_WRAPPER_CLASS,
} from "./standings/standingsTableColumns";
import "./ModernStandingsTable.css";
import "./torneo-express/public/torneo-express-public.css";

export interface TeamConfig {
  teamNames: string[];
  pairToTeam: Record<string, number>;
}

interface RealTimeStandingsTableProps {
  tournamentId: string;
  forceRefresh: number;
  teamConfig?: TeamConfig | null;
}

const RealTimeStandingsTable: React.FC<RealTimeStandingsTableProps> = ({
  tournamentId,
  forceRefresh,
  teamConfig: teamConfigProp,
}) => {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [allGames, setAllGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isLoadingRef = useRef(false); // Prevenir múltiples recargas simultáneas

  // Resolver teamConfig: usar el del padre o cargar desde BD/localStorage (vista pública/móvil a veces no recibe el prop a tiempo)
  const [resolvedTeamConfig, setResolvedTeamConfig] = useState<TeamConfig | null>(teamConfigProp ?? null);
  useEffect(() => {
    if (teamConfigProp != null) setResolvedTeamConfig(teamConfigProp);
  }, [teamConfigProp]);
  // Fallback: misma fuente que la vista pública (tournament_public_config) + torneo + localStorage.
  // Evita que en "main" se vea tabla por parejas si la reta es por equipos pero el estado del padre no trae team_config.
  useEffect(() => {
    if (teamConfigProp != null || !tournamentId) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      (async () => {
        try {
          const [publicCfg, t] = await Promise.all([
            getTournamentPublicConfig(tournamentId),
            getTournamentById(tournamentId),
          ]);
          if (cancelled) return;
          const fromPublic =
            publicCfg?.format === "teams" &&
            publicCfg?.team_config?.teamNames?.length &&
            publicCfg?.team_config?.pairToTeam
              ? publicCfg.team_config
              : null;
          const fromTournament =
            t?.format === "teams" &&
            t?.team_config?.teamNames?.length &&
            t?.team_config?.pairToTeam
              ? t.team_config
              : null;
          const config =
            fromPublic ?? fromTournament ?? getTeamConfigFromStorage(tournamentId);
          if (!cancelled) setResolvedTeamConfig(config || null);
        } catch {
          if (!cancelled) setResolvedTeamConfig(getTeamConfigFromStorage(tournamentId) || null);
        }
      })();
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [tournamentId, teamConfigProp]);
  // Si no hay config guardada, inferir equipos por nombres (ej. alva vs hack) para mostrar tabla por equipos
  const teamConfig = resolvedTeamConfig;
  const effectiveTeamConfig = useMemo(
    () => teamConfig ?? (pairs.length >= 2 ? inferTeamConfigFromPairs(pairs) : null),
    [teamConfig, pairs]
  );

  const loadTournamentData = useCallback(async () => {
    if (!tournamentId) return;

    // Prevenir múltiples recargas simultáneas
    if (isLoadingRef.current) {
      console.log("⏳ Ya hay una recarga en progreso en RealTimeStandingsTable, ignorando...");
      return;
    }

    try {
      isLoadingRef.current = true;
      setLoading(true);
      setError("");

      const [pairsData, matchesData] = await Promise.all([
        getPairs(tournamentId),
        getMatches(tournamentId),
      ]);

      console.log("🔍 Datos cargados:");
      console.log("- Parejas:", pairsData.length);
      console.log("- Partidos:", matchesData.length);
      console.log(
        "- Partidos finalizados:",
        matchesData.filter((m) => m.status === "finished").length
      );

      setPairs(pairsData);
      setMatches(matchesData);

      // Cargar todos los juegos de todos los partidos
      const gamesPromises = matchesData.map((match) => getGames(match.id));
      const gamesArrays = await Promise.all(gamesPromises);
      const allGamesData = gamesArrays.flat();
      setAllGames(allGamesData);

      console.log("- Juegos cargados:", allGamesData.length);

      // Log de algunos partidos para debug
      matchesData.forEach((match, index) => {
        if (index < 3) {
          // Solo primeros 3 para no saturar log
          console.log(`Partido ${index + 1}:`, {
            id: match.id,
            status: match.status,
            pair1_score: match.pair1_score,
            pair2_score: match.pair2_score,
            games_count: allGamesData.filter((g) => g.match_id === match.id)
              .length,
          });
        }
      });

      // Partidos "sin marcador" solo si no hay sets en la fila del partido Y no hay juegos guardados.
      // (!pair1_score && !pair2_score) es incorrecto: 0 es un marcador válido y los juegos pueden tener el resultado aunque la fila tenga 0-0.
      const finishedWithoutScores = matchesData.filter((m) => {
        if (m.status !== "finished") return false;
        const gamesFor = allGamesData.filter((g) => g.match_id === m.id);
        if (gamesFor.length > 0) return false;
        const s1 = m.pair1_score;
        const s2 = m.pair2_score;
        return s1 == null && s2 == null;
      });

      if (finishedWithoutScores.length > 0) {
        console.log(
          `⚠️ ENCONTRADOS ${finishedWithoutScores.length} partidos finalizados sin marcador final`
        );
        console.log("💡 Usa el botón 'Actualizar Scores' para corregir esto");
      }
    } catch (error) {
      console.error("Error cargando datos:", error);
      setError("Error al cargar los datos de la reta");
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, [tournamentId]);

  // Suscripción en tiempo real (con polling como fallback)
  // IMPORTANTE: Debe ir DESPUÉS de la definición de loadTournamentData
  useRealtimeSubscription({
    tournamentId,
    onUpdate: loadTournamentData,
    enabled: true,
  });

  useEffect(() => {
    if (!tournamentId) return;

    // Cargar al montar
    loadTournamentData();

    // Auto-refresh cada 60s como fallback (si Realtime falla o no está disponible)
    // Con Realtime activo, esto solo se usará como respaldo
    const interval = setInterval(() => {
      console.log("⏰ Polling de respaldo (60s) - Realtime debería actualizar antes");
      loadTournamentData();
    }, 60000); // Aumentado a 60s ya que Realtime debería actualizar antes

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]); // Solo recargar cuando cambia el torneo

  // Recargar cuando cambia forceRefresh con debounce para evitar múltiples recargas
  useEffect(() => {
    if (!tournamentId || forceRefresh === 0) return;

    // Debounce: esperar 500ms después de que cambia forceRefresh para agrupar actualizaciones
    const timeoutId = setTimeout(() => {
      loadTournamentData();
    }, 500);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceRefresh]); // loadTournamentData es estable

  const champConfig = useMemo(() => {
    if (!tournamentId) return null;
    // forceRefresh: re-leer localStorage tras sync de remontada en loadTournamentData
    void forceRefresh;
    return loadChampionshipConfig(tournamentId);
  }, [tournamentId, forceRefresh]);

  const standingsMatches = useMemo(
    () => matchesForStandingsTable(matches, tournamentId, champConfig),
    [matches, tournamentId, champConfig]
  );

  const pairsWithStats = useMemo(
    () => computePairsWithStats(pairs, standingsMatches, allGames),
    [pairs, standingsMatches, allGames]
  );

  const sortedPairs = useMemo(
    () => sortPairsForStandings(pairsWithStats, standingsMatches, allGames),
    [pairsWithStats, standingsMatches, allGames]
  );

  const teamStandings = useMemo(() => {
    if (
      !effectiveTeamConfig?.teamNames?.length ||
      !effectiveTeamConfig.pairToTeam ||
      Object.keys(effectiveTeamConfig.pairToTeam).length === 0
    ) {
      return null;
    }
    return computeTeamStandings(pairsWithStats, effectiveTeamConfig);
  }, [pairsWithStats, effectiveTeamConfig]);

  const getPositionIcon = (position: number) => {
    switch (position) {
      case 1:
        return "🥇";
      case 2:
        return "🥈";
      case 3:
        return "🥉";
      default:
        return "";
    }
  };

  const recalculateStatistics = async () => {
    await loadTournamentData();
  };

  // Función para actualizar marcadores de partidos finalizados que no tienen pair1_score/pair2_score
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const updateFinishedMatchScores = async () => {
    console.log("🔄 Actualizando marcadores de partidos finalizados...");

    const finishedMatches = matches.filter((m) => {
      if (m.status !== "finished") return false;
      const g = allGames.filter((x) => x.match_id === m.id);
      if (g.length === 0) return false;
      if (m.pair1_score != null && m.pair2_score != null) return false;
      return true;
    });

    for (const match of finishedMatches) {
      const matchGames = allGames.filter((g) => g.match_id === match.id);

      if (matchGames.length > 0) {
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

        console.log(
          `📊 Actualizando partido ${match.id}: ${pair1FinalScore} - ${pair2FinalScore}`
        );

        // Actualizar el match con los scores
        await updateMatch(match.id, {
          pair1_score: pair1FinalScore,
          pair2_score: pair2FinalScore,
        });
      }
    }

    // Recargar datos después de actualizar
    await loadTournamentData();
  };

  if (loading) {
    return (
      <div className="new-standings-container riviera-standings te-public-section">
        <div className="new-standings-header riviera-standings__header">
          <h2 className="te-public-section__title">Clasificación</h2>
        </div>
        <div className="new-loading-state">
          <div className="new-loading-spinner"></div>
          <p>Cargando clasificación...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="new-standings-container riviera-standings te-public-section te-pub-fade-in">
      <div className="new-standings-header riviera-standings__header">
        <h2 className="te-public-section__title">Clasificación</h2>
        <button
          onClick={recalculateStatistics}
          className="new-recalculate-button riviera-standings__recalc"
          disabled={loading}
        >
          Recalcular
        </button>
      </div>

      <div className="te-public-section__divider" aria-hidden />

      <StandingsScoringHelp />

      {/* Modo equipos: tabla por equipos (suma de puntos por equipo) */}
      {teamStandings && teamStandings.length > 0 ? (
        <div
          className={`new-standings-table-wrapper te-pub-standings-table-wrap rv-table-wrap ${TABLA_WRAPPER_CLASS}`}
          style={
            {
              "--standings-sticky-bg": "var(--bg-card)",
              "--standings-sticky-bg-leader": "var(--ro-accent-dim)",
            } as React.CSSProperties
          }
        >
            <table className={`new-standings-table te-pub-standings-table rv-table ${TABLA_RANKING_CLASS}`}>
            <thead>
              <StandingsTableHeader entity="equipo" />
            </thead>
            <tbody>
              {teamStandings.map((row, index) => (
                <tr
                  key={row.teamIndex}
                  className={`te-pub-standings-row te-pub-fade-in-up${index === 0 ? " te-pub-standings-row--leader" : ""}`}
                >
                  <td className={`te-pub-standings-row__pos ${COL_POS}`}>
                    <span className="te-pub-standings-row__pos-num">{index + 1}</span>
                    <span className="new-position-icon">{getPositionIcon(index + 1)}</span>
                  </td>
                  <td className={`te-pub-standings-row__name ${COL_ENTITY}`}>{row.name}</td>
                  <td className={COL_PJ}>{row.matchesPlayed}</td>
                  <td className={COL_PG}>{row.pg}</td>
                  <td className={COL_PP}>{row.pp}</td>
                  <td className={COL_FAV}>{row.points}</td>
                  <td className={COL_CON}>{row.pointsReceived}</td>
                  <StandingsDifCell
                    ptsFav={row.points}
                    ptsCon={row.pointsReceived}
                  />
                  <StandingsPtsCell pts={row.puntosTorneo} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Modo round robin: tabla por parejas */
        <div
          className={`new-standings-table-wrapper te-pub-standings-table-wrap rv-table-wrap ${TABLA_WRAPPER_CLASS}`}
          style={
            {
              "--standings-sticky-bg": "var(--bg-card)",
              "--standings-sticky-bg-leader": "var(--ro-accent-dim)",
            } as React.CSSProperties
          }
        >
          <table className={`new-standings-table te-pub-standings-table rv-table ${TABLA_RANKING_CLASS}`}>
          <thead>
            <StandingsTableHeader entity="pareja" />
          </thead>
          <tbody>
            {sortedPairs.map((pair, index) => (
              <tr
                key={pair.id}
                className={`te-pub-standings-row te-pub-fade-in-up${index === 0 ? " te-pub-standings-row--leader" : ""}`}
              >
                <td className={`te-pub-standings-row__pos ${COL_POS}`}>
                  <span className="te-pub-standings-row__pos-num">{index + 1}</span>
                  <span className="new-position-icon">
                    {getPositionIcon(index + 1)}
                  </span>
                </td>
                <td className={`te-pub-standings-row__name ${COL_ENTITY}`}>
                  {pair.player1_name} / {pair.player2_name}
                </td>
                <td className={COL_PJ}>{pair.matchesPlayed}</td>
                <td className={COL_PG}>{pair.pg}</td>
                <td className={COL_PP}>{pair.pp}</td>
                <td className={COL_FAV}>{pair.points}</td>
                <td className={COL_CON}>{pair.pointsReceived}</td>
                <StandingsDifCell
                  ptsFav={pair.points}
                  ptsCon={pair.pointsReceived}
                />
                <StandingsPtsCell pts={pair.puntosTorneo} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {sortedPairs.length === 0 && !teamStandings?.length && (
        <div className="new-empty-state">
          <p>📝 No hay parejas registradas en esta reta</p>
        </div>
      )}

      {error && (
        <div className="new-error-state">
          <p>❌ {error}</p>
        </div>
      )}
    </div>
  );
};

export default RealTimeStandingsTable;
