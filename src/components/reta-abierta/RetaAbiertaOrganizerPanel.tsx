import React, { useMemo } from "react";
import type { Tournament } from "../../lib/database";
import { isAmericanoTournament } from "../../lib/gameModeMapping";
import { loadChampionshipConfig } from "../../lib/roundRobinChampionship";
import { useConvocatoriaOriginName } from "../../club-experience";
import { buildTournamentConvocatoriaContext } from "../../lib/retaAbierta/adapters";
import {
  ConvocatoriaWhatsAppPanel,
  type ConvocatoriaLiveSnapshot,
} from "./ConvocatoriaWhatsAppPanel";

interface Props {
  tournament: Tournament;
  /** Forzar modo cuando el torneo aún no está marcado como americano. */
  modeOverride?: "reta" | "americano";
  /** Vista compacta (sidebar / resumen). */
  compact?: boolean;
  /** Strip en Detalles: lanzar / copiar / ver / admin sin duplicar sede. */
  embedded?: boolean;
  onLiveChange?: (snapshot: ConvocatoriaLiveSnapshot) => void;
}

/**
 * Thin adapter: tournament → contexto del servicio común Convocatoria Riviera.
 * Round Robin / Remontada Final / Reta por Equipos → mode_type `reta`.
 */
export const RetaAbiertaOrganizerPanel: React.FC<Props> = ({
  tournament,
  modeOverride,
  compact = false,
  embedded = false,
  onLiveChange,
}) => {
  const clubName = useConvocatoriaOriginName();
  const mode =
    modeOverride ??
    (isAmericanoTournament(tournament) ? "americano" : "reta");

  const championshipEnabled = Boolean(
    loadChampionshipConfig(tournament.id)?.championshipEnabled
  );

  const context = useMemo(
    () =>
      buildTournamentConvocatoriaContext({
        mode,
        tournamentId: tournament.id,
        name: tournament.name,
        locationLabel: tournament.lugar?.trim() || clubName,
        includeLugar: tournament.mostrar_lugar !== false,
        canchaLabel: tournament.cancha ?? undefined,
        costo: tournament.costo ?? null,
        includeCosto:
          tournament.mostrar_costo === true ||
          Boolean(tournament.costo?.trim()),
        premio: tournament.premio ?? null,
        includePremio:
          tournament.mostrar_premio === true ||
          Boolean(tournament.premio?.trim()),
        rama: tournament.rama ?? null,
        description: tournament.description ?? null,
        scheduledAt: tournament.programado_en ?? null,
        scheduledUntil: tournament.programado_hasta ?? null,
        tournamentFormat: tournament.format,
        championshipEnabled,
        clubName,
        categoryLabel: tournament.nivel?.trim() || undefined,
      }),
    [
      mode,
      tournament.id,
      tournament.name,
      tournament.lugar,
      tournament.mostrar_lugar,
      tournament.cancha,
      tournament.costo,
      tournament.mostrar_costo,
      tournament.premio,
      tournament.mostrar_premio,
      tournament.rama,
      tournament.description,
      tournament.programado_en,
      tournament.programado_hasta,
      tournament.format,
      tournament.nivel,
      championshipEnabled,
      clubName,
    ]
  );

  return (
    <ConvocatoriaWhatsAppPanel
      compact={compact}
      embedded={embedded}
      onLiveChange={onLiveChange}
      context={context}
    />
  );
};

export default RetaAbiertaOrganizerPanel;
