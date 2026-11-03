import React from "react";
import { PublicSplitVsPlayerPanel } from "../../public/split-vs";

interface LigaJornadaMatchPlayerPanelProps {
  name: string;
  foto?: string | null;
  rating?: number | null;
}

/**
 * Panel de jugador a sangre para Liga jornada (wrapper del Split VS público).
 * Rating solo si existe valor real — nunca fingir 3.00 como marcador.
 */
export const LigaJornadaMatchPlayerPanel: React.FC<
  LigaJornadaMatchPlayerPanelProps
> = ({ name, foto, rating }) => (
  <PublicSplitVsPlayerPanel
    name={name}
    foto={foto}
    rating={rating}
    className="liga-jornada-match-player-panel"
  />
);
