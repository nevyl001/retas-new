import React, { useState, useEffect, useMemo } from "react";
import { getPairs, getMatches, Match } from "../lib/database";
import { MatchResultCalculator } from "./MatchResultCalculator";

interface PairWithPlayers {
  id: string;
  tournament_id: string;
  player1_id: string;
  player2_id: string;
  sets_won: number;
  games_won: number;
  points: number;
  matches_played: number;
  created_at: string;
  updated_at: string;
  player1?: {
    id: string;
    name: string;
  };
  player2?: {
    id: string;
    name: string;
  };
}

interface StandingsTableProps {
  tournamentId: string;
  forceRefresh: number;
}

const StandingsTable: React.FC<StandingsTableProps> = ({
  tournamentId,
  forceRefresh,
}) => {
  const [pairs, setPairs] = useState<PairWithPlayers[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Cargar datos cuando cambie el tournamentId o forceRefresh
  useEffect(() => {
    if (tournamentId) {
      console.log(
        `🔄 StandingsTable: Cargando datos para torneo ${tournamentId}, forceRefresh: ${forceRefresh}`
      );
      loadTournamentData();
    }
  }, [tournamentId, forceRefresh]);

  const loadTournamentData = async () => {
    if (!tournamentId) return;

    try {
      setLoading(true);
      setError("");

      console.log("🔄 Cargando datos para tabla de clasificación...");

      // Cargar parejas y partidos en paralelo
      const [pairsData, matchesData] = await Promise.all([
        getPairs(tournamentId),
        getMatches(tournamentId),
      ]);

      setPairs(pairsData);
      setMatches(matchesData);

      console.log(
        `✅ Datos cargados: ${pairsData.length} parejas, ${matchesData.length} partidos`
      );
    } catch (error) {
      console.error("❌ Error cargando datos:", error);
      setError("Error al cargar los datos de la reta");
    } finally {
      setLoading(false);
    }
  };

  // Recalcular todas las estadísticas
  const recalculateAllStatistics = async () => {
    try {
      console.log("🔄 Recalculando todas las estadísticas...");
      setLoading(true);
      setError("");

      // Usar la nueva función de recálculo completo
      if (!tournamentId) return;
      const result = await MatchResultCalculator.recalculateAllStatistics(
        tournamentId
      );

      if (result.success) {
        console.log("✅ Estadísticas recalculadas exitosamente");
        // Recargar datos después del recálculo
        await loadTournamentData();
      } else {
        console.error("❌ Error en recálculo:", result.message);
        setError(result.message);
      }
    } catch (error) {
      console.error("❌ Error recalculando estadísticas:", error);
      setError("Error al recalcular estadísticas");
    } finally {
      setLoading(false);
    }
  };

  // Ordenar parejas usando PUNTOS TOTALES como criterio principal
  const sortedPairs = useMemo(() => {
    return [...pairs].sort((a, b) => {
      // Criterio 1: Puntos totales (descendente) - CRITERIO PRINCIPAL
      if (b.points !== a.points) {
        return b.points - a.points;
      }
      // Criterio 2: Sets ganados (descendente) - CRITERIO DE DESEMPATE
      if (b.sets_won !== a.sets_won) {
        return b.sets_won - a.sets_won;
      }
      // Criterio 3: Juegos ganados (descendente)
      if (b.games_won !== a.games_won) {
        return b.games_won - a.games_won;
      }
      // Criterio 4: Menos partidos jugados (mejor eficiencia)
      return a.matches_played - b.matches_played;
    });
  }, [pairs]);

  // Detectar empates en partidos
  const detectTies = () => {
    const ties: { matchId: string; pair1: string; pair2: string }[] = [];

    matches.forEach((match) => {
      if (match.is_finished && !match.winner_id) {
        ties.push({
          matchId: match.id,
          pair1: `${match.pair1?.player1?.name} / ${match.pair1?.player2?.name}`,
          pair2: `${match.pair2?.player1?.name} / ${match.pair2?.player2?.name}`,
        });
      }
    });

    return ties;
  };

  const ties = detectTies();

  if (loading) {
    return (
      <div className="modern-standings-section">
        <div className="modern-standings-header">
          <div className="modern-standings-title">
            <h3>📊 Clasificación</h3>
          </div>
        </div>
        <div className="modern-match-loading">
          <div className="modern-loading-spinner"></div>
          <p>⏳ Cargando clasificación...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="modern-standings-section">
        <div className="modern-standings-header">
          <div className="modern-standings-title">
            <h3>📊 Clasificación</h3>
          </div>
        </div>
        <div className="modern-match-error">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="modern-standings-section">
      <div className="modern-standings-header">
        <div className="modern-standings-title">
          <h3>📊 Clasificación</h3>
        </div>
        <button
          onClick={recalculateAllStatistics}
          className="modern-recalculate-btn"
          disabled={loading}
        >
          🔄 Recalcular Estadísticas
        </button>
      </div>

      <div className="table-container">
        <table className="modern-standings-table">
          <thead>
            <tr>
              <th>POS</th>
              <th>PAREJA</th>
              <th>SETS</th>
              <th>PARTIDOS</th>
              <th>PUNTOS</th>
            </tr>
          </thead>
          <tbody>
            {sortedPairs.map((pair, index) => (
              <tr key={pair.id} className={`position-${index + 1}`}>
                <td>
                  {index + 1}
                  {index === 0 && "🥇"}
                  {index === 1 && "🥈"}
                  {index === 2 && "🥉"}
                </td>
                <td>
                  {pair.player1?.name} / {pair.player2?.name}
                </td>
                <td>{pair.sets_won}</td>
                <td>{pair.matches_played}</td>
                <td>{pair.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sortedPairs.length === 0 && (
        <div className="modern-match-error">
          <p>📝 No hay parejas registradas en esta reta</p>
        </div>
      )}
    </div>
  );
};

export default StandingsTable;
