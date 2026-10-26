import React, { useMemo, useState } from "react";
import type { AmericanoPlayer, AmericanoRound } from "../../lib/db/types";
import { computeAmericanoLiveStatsMap } from "../../lib/americanoLiveStandings";
import { StandingsDifCell } from "../standings/StandingsDifCell";
import { StandingsPtsCell } from "../standings/StandingsPtsCell";
import { computeStandingDif, formatStandingDif } from "../../utils/standingsDisplay";
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
import { RankingCard } from "../platform/RankingCard";
import "./LiveRanking.css";

interface LiveRankingProps {
  /** Clasificación ya calculada (FAV → DIF → PG). */
  ranked: AmericanoPlayer[];
  /** Plantilla en orden de registro (desempate estable). */
  roster: AmericanoPlayer[];
  rounds?: AmericanoRound[];
  /** Texto bajo el título (p. ej. aclarar que no entra la ronda en curso). */
  caption?: string;
}

const LEGEND = [
  ["PJ", "Partidos jugados"],
  ["PG", "Partidos ganados"],
  ["PP", "Partidos perdidos"],
  ["FAV", "Juegos a favor"],
  ["CON", "Juegos en contra"],
  ["DIF", "Diferencia de juegos"],
  ["PTS", "Puntos informativos de tabla"],
] as const;

export const LiveRanking: React.FC<LiveRankingProps> = ({
  ranked,
  roster,
  rounds = [],
  caption,
}) => {
  const [openId, setOpenId] = useState<string | null>(null);
  const statsMap = useMemo(
    () => computeAmericanoLiveStatsMap(roster, rounds),
    [roster, rounds]
  );

  return (
    <RankingCard title="Ranking en vivo" className="americano-ranking rv-card">
      {caption ? (
        <p className="americano-ranking__caption rv-muted">{caption}</p>
      ) : null}
      <StandingsScoringHelp compact mode="americano" />
      <ul className="americano-ranking__legend">
        {LEGEND.map(([key, label]) => (
          <li key={key}>
            <abbr title={label}>{key}</abbr>
            <span>{label}</span>
          </li>
        ))}
      </ul>
      {ranked.length === 0 ? (
        <p className="americano-ranking__empty">Aún no hay clasificación.</p>
      ) : (
        <>
          <div className="americano-ranking__mobile">
            {ranked.map((player, index) => {
              const st = statsMap.get(player.id);
              const ptsFav = st?.ptsFav ?? player.stats.pointsFor;
              const ptsCon = st?.ptsCon ?? player.stats.pointsAgainst;
              const open = openId === player.id;
              const dif = computeStandingDif(ptsFav, ptsCon);
              const difMod =
                dif > 0
                  ? "te-pub-dif--pos"
                  : dif < 0
                    ? "te-pub-dif--neg"
                    : "te-pub-dif--zero";
              return (
                <article
                  key={player.id}
                  className="americano-ranking__mobile-row"
                >
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() =>
                      setOpenId((current) =>
                        current === player.id ? null : player.id
                      )
                    }
                  >
                    <span className="americano-ranking__pos">{index + 1}</span>
                    <span className="americano-ranking__name">{player.name}</span>
                    <span className={`te-pub-dif ${difMod}`}>
                      {formatStandingDif(dif)}
                    </span>
                    <span className="americano-ranking__pts">{st?.puntos ?? 0}</span>
                  </button>
                  {open ? (
                    <dl>
                      <div>
                        <dt>PJ</dt>
                        <dd>{st?.pj ?? player.stats.gamesPlayed}</dd>
                      </div>
                      <div>
                        <dt>PG</dt>
                        <dd>{st?.pg ?? 0}</dd>
                      </div>
                      <div>
                        <dt>PP</dt>
                        <dd>{st?.pp ?? 0}</dd>
                      </div>
                      <div>
                        <dt>FAV</dt>
                        <dd>{ptsFav}</dd>
                      </div>
                      <div>
                        <dt>CON</dt>
                        <dd>{ptsCon}</dd>
                      </div>
                    </dl>
                  ) : null}
                </article>
              );
            })}
          </div>
          <div
            className={`${TABLA_WRAPPER_CLASS} standings-table-desktop rv-table-wrap`}
            style={
              {
                "--standings-sticky-bg": "var(--bg-card)",
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
                      <StandingsDifCell
                        ptsFav={ptsFav}
                        ptsCon={ptsCon}
                        className=""
                      />
                      <StandingsPtsCell pts={st?.puntos ?? 0} className="" />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </RankingCard>
  );
};
