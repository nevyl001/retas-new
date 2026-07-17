import React from "react";
import type { Tournament } from "../../lib/database";
import { isAmericanoTournament } from "../../lib/gameModeMapping";
import { loadChampionshipConfig } from "../../lib/roundRobinChampionship";
import { useConvocatoriaOriginName } from "../../club-experience";
import { buildTournamentConvocatoriaContext } from "../../lib/retaAbierta/adapters";
import { ConvocatoriaWhatsAppPanel } from "./ConvocatoriaWhatsAppPanel";

interface Props {
  tournament: Tournament;
  /** Forzar modo cuando el torneo aún no está marcado como americano. */
  modeOverride?: "reta" | "americano";
  /** Vista compacta (sidebar / resumen). */
  compact?: boolean;
}

/**
 * Thin adapter: tournament → contexto del servicio común Convocatoria Riviera.
 * Round Robin / Remontada Final / Reta por Equipos → mode_type `reta`.
 */
export const RetaAbiertaOrganizerPanel: React.FC<Props> = ({
  tournament,
  modeOverride,
  compact = false,
}) => {
  const clubName = useConvocatoriaOriginName();
  const mode =
    modeOverride ??
    (isAmericanoTournament(tournament) ? "americano" : "reta");

  const championshipEnabled = Boolean(
    loadChampionshipConfig(tournament.id)?.championshipEnabled
  );

  return (
    <ConvocatoriaWhatsAppPanel
      compact={compact}
      context={buildTournamentConvocatoriaContext({
        mode,
        tournamentId: tournament.id,
        name: tournament.name,
        locationLabel: tournament.lugar?.trim() || clubName,
        includeLugar: tournament.mostrar_lugar !== false,
        canchaLabel: tournament.cancha ?? undefined,
        scheduledAt: tournament.programado_en ?? null,
        scheduledUntil: tournament.programado_hasta ?? null,
        tournamentFormat: tournament.format,
        championshipEnabled,
        clubName,
      })}
    />
  );
};

export default RetaAbiertaOrganizerPanel;
