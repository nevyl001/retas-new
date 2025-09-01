import React, { useState, useEffect, useMemo } from "react";
import {
  getPairs,
  getMatches,
  getGames,
  updateMatch,
  Match,
  Game,
  Pair,
} from "../lib/database";
import "./ModernStandingsTable.css";

interface PairWithStats {
  id: string;
  tournament_id: string;
  player1_id: string;
  player2_id: string;
  player1_name: string;
  player2_name: string;
  created_at: string;
  // Estadísticas calculadas en tiempo real
  gamesWon: number;
  setsWon: number;
  points: number;
  matchesPlayed: number;
  player1?: {
    id: string;
    name: string;
  };
  player2?: {
    id: string;
    name: string;
  };
}

interface RealTimeStandingsTableProps {
  tournamentId: string;
  forceRefresh: number;
}

const RealTimeStandingsTable: React.FC<RealTimeStandingsTableProps> = ({
  tournamentId,
  forceRefresh,
}) => {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [allGames, setAllGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (tournamentId) {
      loadTournamentData();
    }
  }, [tournamentId, forceRefresh]);

  const loadTournamentData = async () => {
    if (!tournamentId) return;

    try {
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

      // Detectar partidos finalizados sin scores y mostrar aviso
      const finishedWithoutScores = matchesData.filter(
        (m) => m.status === "finished" && !m.pair1_score && !m.pair2_score
      );

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
    }
  };

  // Función para calcular estadísticas de un partido
  const calculateMatchStats = (match: Match, games: Game[]) => {
    let pair1GamesWon = 0;
    let pair2GamesWon = 0;
    let pair1SetsWon = 0;
    let pair2SetsWon = 0;
    let pair1TotalPoints = 0;
    let pair2TotalPoints = 0;

    games.forEach((game) => {
      if (game.is_tie_break) {
        // Para tie-breaks
        if (game.tie_break_pair1_points > game.tie_break_pair2_points) {
          pair1GamesWon++;
        } else if (game.tie_break_pair2_points > game.tie_break_pair1_points) {
          pair2GamesWon++;
        }
        pair1TotalPoints += game.tie_break_pair1_points || 0;
        pair2TotalPoints += game.tie_break_pair2_points || 0;
      } else {
        // Para juegos normales
        if (game.pair1_games > game.pair2_games) {
          pair1GamesWon++;
        } else if (game.pair2_games > game.pair1_games) {
          pair2GamesWon++;
        }
        pair1TotalPoints += game.pair1_games;
        pair2TotalPoints += game.pair2_games;

        // Verificar si alguna pareja llegó a 6 puntos en este juego (gana 1 set)
        if (game.pair1_games >= 6) {
          pair1SetsWon++;
        }
        if (game.pair2_games >= 6) {
          pair2SetsWon++;
        }
      }
    });

    return {
      pair1GamesWon,
      pair2GamesWon,
      pair1SetsWon,
      pair2SetsWon,
      pair1TotalPoints,
      pair2TotalPoints,
    };
  };

  // Calcular estadísticas en tiempo real
  const pairsWithStats = useMemo((): PairWithStats[] => {
    if (!pairs.length) {
      return [];
    }

    if (!matches.length) {
      return pairs.map((pair) => ({
        ...pair,
        gamesWon: 0,
        setsWon: 0,
        points: 0,
        matchesPlayed: 0,
      }));
    }

    // Crear mapa de estadísticas por pareja
    const pairStats = new Map<
      string,
      {
        gamesWon: number;
        setsWon: number;
        points: number;
        matchesPlayed: number;
      }
    >();

    // Inicializar estadísticas para todas las parejas
    pairs.forEach((pair) => {
      pairStats.set(pair.id, {
        gamesWon: 0,
        setsWon: 0,
        points: 0,
        matchesPlayed: 0,
      });
    });

    // Procesar partidos finalizados
    matches.forEach((match) => {
      if (match.status === "finished") {
        // Obtener juegos de este partido específico
        const matchGames = allGames.filter(
          (game) => game.match_id === match.id
        );

        const pair1Stats = pairStats.get(match.pair1_id);
        const pair2Stats = pairStats.get(match.pair2_id);

        if (pair1Stats && pair2Stats) {
          // Incrementar partidos jugados
          pair1Stats.matchesPlayed += 1;
          pair2Stats.matchesPlayed += 1;

          if (matchGames.length > 0) {
            // Usar datos detallados de juegos si están disponibles
            const matchStats = calculateMatchStats(match, matchGames);

            pair1Stats.gamesWon += matchStats.pair1GamesWon;
            pair1Stats.setsWon += matchStats.pair1SetsWon;
            pair1Stats.points += matchStats.pair1TotalPoints;

            pair2Stats.gamesWon += matchStats.pair2GamesWon;
            pair2Stats.setsWon += matchStats.pair2SetsWon;
            pair2Stats.points += matchStats.pair2TotalPoints;
          } else {
            // Usar datos básicos del match si no hay juegos detallados
            const pair1Score = match.pair1_score || 0;
            const pair2Score = match.pair2_score || 0;

            // Acumular puntos básicos
            pair1Stats.points += pair1Score;
            pair2Stats.points += pair2Score;

            // Determinar ganador de sets basado en marcador
            if (pair1Score > pair2Score) {
              pair1Stats.setsWon += 1;
              pair1Stats.gamesWon += 1;
            } else if (pair2Score > pair1Score) {
              pair2Stats.setsWon += 1;
              pair2Stats.gamesWon += 1;
            }
          }
        }
      }
    });

    // Convertir a array con estadísticas
    return pairs.map((pair) => {
      const stats = pairStats.get(pair.id) || {
        gamesWon: 0,
        setsWon: 0,
        points: 0,
        matchesPlayed: 0,
      };

      return {
        ...pair,
        ...stats,
      };
    });
  }, [pairs, matches, allGames]);

  // Ordenar parejas por ranking
  const sortedPairs = useMemo(() => {
    return [...pairsWithStats].sort((a, b) => {
      // Primero por puntos (descendente)
      if (b.points !== a.points) {
        return b.points - a.points;
      }
      // Luego por sets ganados (descendente)
      if (b.setsWon !== a.setsWon) {
        return b.setsWon - a.setsWon;
      }
      // Finalmente por juegos ganados (descendente)
      if (b.gamesWon !== a.gamesWon) {
        return b.gamesWon - a.gamesWon;
      }
      // Si todo es igual, ordenar alfabéticamente
      const nameA = `${a.player1_name}/${a.player2_name}`;
      const nameB = `${b.player1_name}/${b.player2_name}`;
      return nameA.localeCompare(nameB);
    });
  }, [pairsWithStats]);

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

    const finishedMatches = matches.filter(
      (m) => m.status === "finished" && !m.pair1_score && !m.pair2_score
    );

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
      <div className="new-standings-container">
        <div className="new-standings-header">
          <h2>📊 Clasificación</h2>
        </div>
        <div className="new-loading-state">
          <div className="new-loading-spinner"></div>
          <p>Cargando clasificación...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="new-standings-container">
      <div className="new-standings-header">
        <h2>📊 Clasificación</h2>
        <button
          onClick={recalculateStatistics}
          className="new-recalculate-button"
          disabled={loading}
        >
          🔄 Recalcular
        </button>
      </div>

      <div className="new-standings-table-wrapper">
        <table className="new-standings-table">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Pareja</th>
              <th>Sets</th>
              <th>Partidos</th>
              <th>Puntos</th>
            </tr>
          </thead>
          <tbody>
            {sortedPairs.map((pair, index) => (
              <tr
                key={pair.id}
                className={
                  index === 0
                    ? "new-first-place"
                    : index === 1
                    ? "new-second-place"
                    : index === 2
                    ? "new-third-place"
                    : "new-normal-place"
                }
              >
                <td className="new-position-cell">
                  <span className="new-position-number">{index + 1}</span>
                  <span className="new-position-icon">
                    {getPositionIcon(index + 1)}
                  </span>
                </td>
                <td className="new-team-cell">
                  {pair.player1_name} / {pair.player2_name}
                </td>
                <td className="new-stats-cell">{pair.setsWon}</td>
                <td className="new-stats-cell">{pair.matchesPlayed}</td>
                <td className="new-points-cell">{pair.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sortedPairs.length === 0 && (
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
