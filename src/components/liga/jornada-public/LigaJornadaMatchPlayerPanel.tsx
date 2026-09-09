import React from "react";
import { PublicSplitVsPlayerPanel } from "../../public/split-vs";

interface LigaJornadaMatchPlayerPanelProps {
  name: string;
  foto?: string | null;
}

/**
 * Panel de jugador a sangre para Liga jornada (wrapper del Split VS público).
 */
export const LigaJornadaMatchPlayerPanel: React.FC<
  LigaJornadaMatchPlayerPanelProps
> = ({ name, foto }) => (
  <PublicSplitVsPlayerPanel
    name={name}
    foto={foto}
    className="liga-jornada-match-player-panel"
  />
);
