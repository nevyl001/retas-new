import React from "react";
import type { StandingRowExpress } from "../../../lib/torneoExpress/types";

const DEFAULT_MOTIVATIONAL =
  "Así se juega en Riviera." as const;

function leaderFromRows(rows: StandingRowExpress[]): StandingRowExpress | null {
  if (!rows.length) return null;
  const leader = rows[0];
  const hasActivity = rows.some((r) => r.pj > 0);
  if (!hasActivity) return null;
  return leader;
}

function formatDif(dif: number): string {
  if (dif > 0) return `+${dif}`;
  return String(dif);
}

export const PublicGrupoLeaderCelebrate: React.FC<{
  grupoNombre: string;
  rows: StandingRowExpress[];
  torneoNombre?: string;
  /** Frase corta entre el nombre y el lugar (p. ej. "Dominaron la cancha.") */
  fraseMotivacional?: string;
}> = ({
  grupoNombre,
  rows,
  torneoNombre,
  fraseMotivacional = DEFAULT_MOTIVATIONAL,
}) => {
  const leader = leaderFromRows(rows);
  if (!leader) return null;

  const grupoUpper = grupoNombre.trim().toUpperCase();

  return (
    <aside
      className="te-pub-grupo-celebrate te-pub-fade-in"
      aria-label={`Felicitación al líder de ${grupoNombre}`}
    >
      <div className="te-pub-grupo-celebrate__inner">
        <header className="te-pub-grupo-celebrate__brand">
          <div className="te-divider-gold te-divider-gold--wide" aria-hidden />
          <p className="te-pub-grupo-celebrate__wordmark">
            <span>R I V I E R A</span>
            <span className="te-pub-grupo-celebrate__wordmark-sep" aria-hidden>
              ·
            </span>
            <span>O P E N</span>
          </p>
          <p className="te-pub-grupo-celebrate__brand-tagline">
            Donde el pádel se vive en grande
          </p>
          <div className="te-divider-gold te-divider-gold--wide" aria-hidden />
        </header>

        <div className="te-divider-gold" aria-hidden />

        <h2 className="te-pub-grupo-celebrate__headline">¡Felicidades!</h2>
        <p className="te-pub-grupo-celebrate__names">{leader.parejaLabel}</p>
        <p className="te-pub-grupo-celebrate__motivational">
          {fraseMotivacional}
        </p>
        <p className="te-pub-grupo-celebrate__rank">
          1er lugar · {grupoUpper}
        </p>

        {torneoNombre ? (
          <footer className="te-pub-grupo-celebrate__footer">
            <div className="te-divider-gold" aria-hidden />
            <p className="te-pub-grupo-celebrate__torneo">{torneoNombre}</p>
            <p className="te-pub-grupo-celebrate__closing">Vive Riviera Open</p>
          </footer>
        ) : null}

        <div className="te-pub-grupo-celebrate__stats">
          <div className="te-pub-grupo-celebrate__stat">
            <span className="te-pub-grupo-celebrate__stat-label">Pts</span>
            <span className="te-pub-grupo-celebrate__stat-value">
              {leader.puntos}
            </span>
          </div>
          <div className="te-pub-grupo-celebrate__stat">
            <span className="te-pub-grupo-celebrate__stat-label">Partidos</span>
            <span className="te-pub-grupo-celebrate__stat-value">
              {leader.pg}G-{leader.pp}P
            </span>
          </div>
          <div className="te-pub-grupo-celebrate__stat">
            <span className="te-pub-grupo-celebrate__stat-label">Dif</span>
            <span className="te-pub-grupo-celebrate__stat-value">
              {formatDif(leader.dif)}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
