import React from "react";
import type { Pair } from "../../../lib/db/types";
import { Input } from "../../ui";
import { TeamLogoUploader } from "./TeamLogoUploader";

export type TeamsOrganizerPreviewTeam = {
  teamIndex: number;
  pairs: Pair[];
};

type RetaEquiposOrganizerCardsProps = {
  tournamentId: string;
  organizadorId: string | null;
  teamsCount: number;
  maxTeams: number;
  teamNames: string[];
  teamLogos: (string | null)[];
  teamsPreview: TeamsOrganizerPreviewTeam[];
  pairToTeam: Record<string, number>;
  loading?: boolean;
  onTeamsCountChange: (n: number) => void;
  onTeamNameChange: (teamIndex: number, name: string) => void;
  onTeamLogoChange: (teamIndex: number, url: string | null) => void;
  onPairTeamChange: (pairId: string, teamIndex: number) => void;
};

function displayTeamName(names: string[], index: number): string {
  return names[index]?.trim() || `Equipo ${index + 1}`;
}

/**
 * Admin: Team Cards premium (identidad + parejas) sin cambiar payloads deportivos.
 */
export const RetaEquiposOrganizerCards: React.FC<RetaEquiposOrganizerCardsProps> = ({
  tournamentId,
  organizadorId,
  teamsCount,
  maxTeams,
  teamNames,
  teamLogos,
  teamsPreview,
  pairToTeam,
  loading = false,
  onTeamsCountChange,
  onTeamNameChange,
  onTeamLogoChange,
  onPairTeamChange,
}) => {
  return (
    <div className="reta-eq-org">
      <header className="reta-eq-org__head">
        <p className="riviera-label">Organiza tus equipos</p>
        <p className="reta-eq-org__sub">
          Identidad, logo y alineación por equipo. La lógica de enfrentamientos no cambia.
        </p>
      </header>

      <div className="start-tournament-section__teams-toolbar reta-eq-org__toolbar">
        <Input
          type="number"
          label="Número de equipos"
          className="start-tournament-section__teams-count"
          min={2}
          max={Math.max(2, maxTeams)}
          value={teamsCount}
          onChange={(e) =>
            onTeamsCountChange(parseInt(e.target.value || "2", 10))
          }
          disabled={loading}
        />
      </div>

      <div className="reta-eq-org__grid">
        {teamsPreview.map((t) => {
          const name = displayTeamName(teamNames, t.teamIndex);
          const playersCount = t.pairs.length * 2;
          return (
            <article
              key={t.teamIndex}
              className="reta-eq-team-card"
              data-team-index={t.teamIndex}
            >
              <div className="reta-eq-team-card__identity">
                {organizadorId ? (
                  <TeamLogoUploader
                    organizadorId={organizadorId}
                    tournamentId={tournamentId}
                    teamIndex={t.teamIndex}
                    teamName={name}
                    logoUrl={teamLogos[t.teamIndex] ?? null}
                    disabled={loading}
                    onLogoChange={(url) => onTeamLogoChange(t.teamIndex, url)}
                  />
                ) : (
                  <p className="reta-eq-org__warn">
                    Inicia sesión para subir el logo del equipo.
                  </p>
                )}
                <Input
                  type="text"
                  label="Nombre del equipo"
                  value={teamNames[t.teamIndex] ?? ""}
                  placeholder={`Equipo ${t.teamIndex + 1}`}
                  onChange={(e) => onTeamNameChange(t.teamIndex, e.target.value)}
                  disabled={loading}
                />
                <p className="reta-eq-team-card__stats">
                  {playersCount} jugador{playersCount === 1 ? "" : "es"}
                  <span aria-hidden> · </span>
                  {t.pairs.length} pareja{t.pairs.length === 1 ? "" : "s"}
                </p>
              </div>

              <ul className="reta-eq-team-card__pairs">
                {t.pairs.map((p, pairIdx) => (
                  <li key={p.id} className="reta-eq-team-card__pair">
                    <div className="reta-eq-team-card__pair-copy">
                      <span className="reta-eq-team-card__pair-label">
                        Pareja {String(pairIdx + 1).padStart(2, "0")}
                      </span>
                      <span className="reta-eq-team-card__pair-names">
                        {p.player1_name} / {p.player2_name}
                      </span>
                    </div>
                    <label className="reta-eq-team-card__move">
                      <span className="visually-hidden">Mover a equipo</span>
                      <select
                        className="riviera-input start-tournament-section__pair-move"
                        value={pairToTeam[p.id] ?? t.teamIndex}
                        onChange={(e) =>
                          onPairTeamChange(p.id, parseInt(e.target.value, 10))
                        }
                        disabled={loading}
                      >
                        {teamsPreview.map((other) => (
                          <option key={other.teamIndex} value={other.teamIndex}>
                            {displayTeamName(teamNames, other.teamIndex)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </div>
  );
};
