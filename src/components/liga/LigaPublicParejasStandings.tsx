import React from "react";
import type { LigaEquipo, LigaEquipoRankingItem } from "../../lib/liga/types";
import { LigaPublicParejaPlayers } from "./LigaPublicParejaFaces";

export type LigaPublicParejaStandingRow = {
  ranking: LigaEquipoRankingItem;
  equipo?: LigaEquipo;
  foto1: string | null;
  foto2: string | null;
};

interface LigaPublicParejasStandingsProps {
  rows: LigaPublicParejaStandingRow[];
}

function splitParejaNombre(nombre: string): [string, string] {
  const parts = nombre.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return [parts[0]!, parts[1]!];
  if (parts.length === 1) return [parts[0]!, ""];
  return ["?", "?"];
}

export const LigaPublicParejasStandings: React.FC<
  LigaPublicParejasStandingsProps
> = ({ rows }) => {
  if (!rows.length) {
    return <p className="liga-pantalla__loading">Sin puntos aún.</p>;
  }

  return (
    <ol className="liga-pub-standings" aria-label="Ranking por pareja">
      {rows.map(({ ranking, equipo, foto1, foto2 }) => {
        const name1 =
          equipo?.jugador1?.nombre?.trim() ||
          splitParejaNombre(ranking.nombre)[0];
        const name2 =
          equipo?.jugador2?.nombre?.trim() ||
          splitParejaNombre(ranking.nombre)[1] ||
          "?";
        const topClass =
          ranking.posicion === 1
            ? " liga-pub-standings__row--1"
            : ranking.posicion === 2
              ? " liga-pub-standings__row--2"
              : ranking.posicion === 3
                ? " liga-pub-standings__row--3"
                : "";
        const dif =
          ranking.diferencia_games >= 0
            ? `+${ranking.diferencia_games}`
            : String(ranking.diferencia_games);

        return (
          <li
            key={ranking.equipo_id}
            className={`liga-pub-standings__row${topClass}`}
          >
            <div
              className="liga-pub-standings__pos"
              aria-label={`Posición ${ranking.posicion}`}
            >
              <span className="liga-pub-standings__pos-num">{ranking.posicion}</span>
              <span className="liga-pub-standings__pos-suffix">°</span>
            </div>

            <div className="liga-pub-standings__players">
              <LigaPublicParejaPlayers
                name1={name1}
                name2={name2}
                foto1={foto1}
                foto2={foto2}
                size="md"
                win={ranking.posicion === 1}
              />
              <p className="liga-pub-standings__meta">
                {ranking.partidos_jugados} PJ · {ranking.partidos_ganados} PG ·{" "}
                DIF {dif}
              </p>
            </div>

            <div className="liga-pub-standings__pts-block">
              <span className="liga-pub-standings__pts">{ranking.puntos}</span>
              <span className="liga-pub-standings__pts-label">pts</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
};
