import React, { useMemo } from "react";
import type { AmericanoPlayer, AmericanoRound } from "../../lib/db/types";
import { computeAmericanoLiveStatsMap } from "../../lib/americanoLiveStandings";
import { StandingsDifCell } from "../standings/StandingsDifCell";
import { StandingsPtsCell } from "../standings/StandingsPtsCell";
import { StandingsScoringHelp } from "../standings/StandingsScoringHelp";
import { StandingsTableHeader } from "../standings/StandingsTableHeader";
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
} from "../standings/standingsTableColumns";
import {
  StandingsMobileCards,
  type StandingsMobileCardRow,
} from "../standings/StandingsMobileCards";
import { RankingCard } from "../platform/RankingCard";
import "./LiveRanking.css";
import "../../styles/standings-mobile-cards.css";

interface LiveRankingProps {
  /** Clasificación ya calculada (FAV → DIF → H2H → PG). */
  ranked: AmericanoPlayer[];
  /** Plantilla en orden de registro (desempate estable). */
  roster: AmericanoPlayer[];
  rounds?: AmericanoRound[];
  /** Texto bajo el título (p. ej. aclarar que no entra la ronda en curso). */
  caption?: string;
}

export const LiveRanking: React.FC<LiveRankingProps> = ({
  ranked,
  roster,
  rounds = [],
  caption,
}) => {
  const statsMap = useMemo(
    () => computeAmericanoLiveStatsMap(roster, rounds),
    [roster, rounds]
  );

  const mobileRows = useMemo((): StandingsMobileCardRow[] => {
    return ranked.map((player, index) => {
      const st = statsMap.get(player.id);
      const ptsFav = st?.ptsFav ?? player.stats.pointsFor;
      const ptsCon = st?.ptsCon ?? player.stats.pointsAgainst;
      return {
        key: player.id,
        position: index + 1,
        label: player.name,
        matchesPlayed: st?.pj ?? player.stats.gamesPlayed,
        pg: st?.pg ?? 0,
        pp: st?.pp ?? 0,
        points: ptsFav,
        pointsReceived: ptsCon,
        puntosTorneo: st?.puntos ?? 0,
      };
    });
  }, [ranked, statsMap]);

  return (
    <RankingCard title="Ranking en vivo" className="americano-ranking rv-card">
      {caption ? <p className="americano-ranking__caption rv-muted">{caption}</p> : null}
      <StandingsScoringHelp compact />
      <StandingsMobileCards rows={mobileRows} />
      <div
        className={`${TABLA_WRAPPER_CLASS} standings-table-desktop rv-table-wrap`}
        style={
          {
            "--standings-sticky-bg": "#181818",
            "--standings-sticky-bg-leader": "var(--ro-gold-dim)",
          } as React.CSSProperties
        }
      >
        <table className={`${TABLA_RANKING_CLASS} rv-table`}>
          <thead>
            <StandingsTableHeader entity="jugador" />
          </thead>
          <tbody>
            {ranked.map((player, index) => {
              const st = statsMap.get(player.id);
              const ptsFav = st?.ptsFav ?? player.stats.pointsFor;
              const ptsCon = st?.ptsCon ?? player.stats.pointsAgainst;
              return (
                <tr
                  key={player.id}
                  className={index === 0 ? "americano-ranking__leader" : ""}
                >
                  <td className={COL_POS}>{index + 1}</td>
                  <td className={COL_ENTITY}>{player.name}</td>
                  <td className={COL_PJ}>
                    {st?.pj ?? player.stats.gamesPlayed}
                  </td>
                  <td className={COL_PG}>{st?.pg ?? 0}</td>
                  <td className={COL_PP}>{st?.pp ?? 0}</td>
                  <td className={COL_FAV}>{ptsFav}</td>
                  <td className={COL_CON}>{ptsCon}</td>
                  <StandingsDifCell ptsFav={ptsFav} ptsCon={ptsCon} className="" />
                  <StandingsPtsCell pts={st?.puntos ?? 0} className="" />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </RankingCard>
  );
};
