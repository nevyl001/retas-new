import React from "react";
import type { Tournament } from "../../lib/database";
import { isAmericanoTournament } from "../../lib/gameModeMapping";
import { loadChampionshipConfig } from "../../lib/roundRobinChampionship";
import { buildTournamentConvocatoriaContext } from "../../lib/retaAbierta/adapters";
import { ConvocatoriaWhatsAppPanel } from "./ConvocatoriaWhatsAppPanel";

interface Props {
  tournament: Tournament;
  /** Forzar modo cuando el torneo aún no está marcado como americano. */
  modeOverride?: "reta" | "americano";
}

/**
 * Thin adapter: tournament → contexto del servicio común Convocatoria Riviera.
 * Round Robin / Remontada Final / Reta por Equipos → mode_type `reta`.
 */
export const RetaAbiertaOrganizerPanel: React.FC<Props> = ({
  tournament,
  modeOverride,
}) => {
  const mode =
    modeOverride ??
    (isAmericanoTournament(tournament) ? "americano" : "reta");

  const championshipEnabled = Boolean(
    loadChampionshipConfig(tournament.id)?.championshipEnabled
  );

  return (
    <ConvocatoriaWhatsAppPanel
      context={buildTournamentConvocatoriaContext({
        mode,
        tournamentId: tournament.id,
        name: tournament.name,
        tournamentFormat: tournament.format,
        championshipEnabled,
      })}
    />
  );
};

export default RetaAbiertaOrganizerPanel;
