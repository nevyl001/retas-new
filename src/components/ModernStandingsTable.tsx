import React, { useState, useEffect, useMemo } from "react";
import { getPairs, getMatches, Match } from "../lib/database";
import { MatchResultCalculator } from "./MatchResultCalculator";
import "./ModernStandingsTable.css";

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

interface ModernStandingsTableProps {
  tournamentId: string;
  forceRefresh: number;
}

const ModernStandingsTable: React.FC<ModernStandingsTableProps> = ({
  tournamentId,
  forceRefresh,
}) => {
  const [pairs, setPairs] = useState<PairWithPlayers[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
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

      setPairs(pairsData);
      setMatches(matchesData);
    } catch (error) {
      console.error("Error cargando datos:", error);
      setError("Error al cargar los datos de la reta");
    } finally {
      setLoading(false);
    }
  };

  const recalculateAllStatistics = async () => {
    try {
      setLoading(true);
      setError("");

      if (!tournamentId) return;
      const result = await MatchResultCalculator.recalculateAllStatistics(
        tournamentId
      );

      if (result.success) {
        await loadTournamentData();
      } else {
        setError(result.message);
      }
    } catch (error) {
      console.error("Error recalculando estadísticas:", error);
      setError("Error al recalcular estadísticas");
    } finally {
      setLoading(false);
    }
  };

  const sortedPairs = useMemo(() => {
    return [...pairs].sort((a, b) => {
      if (b.points !== a.points) {
        return b.points - a.points;
      }
      if (b.sets_won !== a.sets_won) {
        return b.sets_won - a.sets_won;
      }
      if (b.games_won !== a.games_won) {
        return b.games_won - a.games_won;
      }
      return a.matches_played - b.matches_played;
    });
  }, [pairs]);

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
          onClick={recalculateAllStatistics}
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
                  {pair.player1?.name} / {pair.player2?.name}
                </td>
                <td className="new-stats-cell">{pair.sets_won}</td>
                <td className="new-stats-cell">{pair.matches_played}</td>
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

export default ModernStandingsTable;
