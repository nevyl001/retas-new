import React, { useMemo, useEffect } from "react";
import { Tournament, upsertTournamentPublicConfig } from "../lib/database";
import "../styles/public-link-section.css";

const TEAM_CONFIG_KEY = "rivieraapp_teams_";

function getTeamConfig(tournament: Tournament): { teamNames: string[]; pairToTeam: Record<string, number> } | null {
  if (tournament.format === "teams" && tournament.team_config?.teamNames?.length && tournament.team_config?.pairToTeam)
    return tournament.team_config;
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(`${TEAM_CONFIG_KEY}${tournament.id}`) : null;
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.teamNames?.length && data?.pairToTeam && typeof data.pairToTeam === "object") return data;
    return null;
  } catch {
    return null;
  }
}

interface PublicLinkSectionProps {
  tournament: Tournament;
  onCopyPublicLink: (tournamentId: string, teamConfig?: { teamNames: string[]; pairToTeam: Record<string, number> } | null) => void;
  generatePublicLink: (tournamentId: string, teamConfig?: { teamNames: string[]; pairToTeam: Record<string, number> } | null) => string;
}

export const PublicLinkSection: React.FC<PublicLinkSectionProps> = ({
  tournament,
  onCopyPublicLink,
  generatePublicLink,
}) => {
  const teamConfig = useMemo(() => getTeamConfig(tournament), [tournament]);

  // Sincronizar nombres de equipos al servidor para que la vista pública muestre los nombres reales (no "Equipo 1" / "Equipo 2")
  useEffect(() => {
    if (!tournament.id || !teamConfig?.teamNames?.length || !teamConfig?.pairToTeam) return;
    upsertTournamentPublicConfig(tournament.id, "teams", teamConfig).catch(() => {});
  }, [tournament.id, teamConfig]);

  if (!tournament.is_started) return null;

  return (
    <div className="public-link-section">
      <h3>Enlace público</h3>
      <div className="public-link-info">
        <p>Comparte el enlace para ver resultados en vivo (solo lectura).</p>
      </div>
      <div className="public-link-actions">
        <button
          className="public-link-button"
          onClick={() => onCopyPublicLink(tournament.id, teamConfig)}
        >
          📋 Copiar Enlace
        </button>
        <a
          href={generatePublicLink(tournament.id, teamConfig)}
          target="_blank"
          rel="noopener noreferrer"
          className="public-link-preview"
        >
          Ver vista pública
        </a>
      </div>
    </div>
  );
};

export default PublicLinkSection;
