import React from "react";
import PublicAmericanoResultsBoard from "../PublicAmericanoResultsBoard";
import PublicTournamentView from "../PublicTournamentView";
import { Duelo2v2Publica } from "../duelo-2v2/Duelo2v2Publica";
import { LigaDetallePublica } from "../liga/LigaDetallePublica";
import { LigaJornadaPublica } from "../liga/LigaJornadaPublica";
import { VistaPublicaGeneral } from "../torneo-express/VistaPublicaGeneral";
import {
  parsePublicPantallaPath,
  type PublicPantallaMode,
} from "../../lib/publicPantalla";
import "./PublicPantallaRouter.css";

export { isPublicPantallaPath } from "../../lib/publicPantalla";

const MODE_LABELS: Record<PublicPantallaMode, string> = {
  americano: "Americano",
  duelo: "Duelo 2 vs 2",
  "duelo-2v2": "Duelo 2 vs 2",
  liga: "Liga",
  te: "Torneo Express",
  "torneo-express": "Torneo Express",
  reta: "Reta",
};

export const PublicPantallaRouter: React.FC<{ pathname: string }> = ({
  pathname,
}) => {
  const route = parsePublicPantallaPath(pathname);

  if (!route) {
    return (
      <div className="public-pantalla public-pantalla--error App--public-full-width ro-public-view">
        <p>Enlace de pantalla no válido.</p>
      </div>
    );
  }

  const { mode, id, jornada } = route;

  let content: React.ReactNode;
  switch (mode) {
    case "americano":
      content = <PublicAmericanoResultsBoard tournamentId={id} />;
      break;
    case "duelo":
    case "duelo-2v2":
      content = <Duelo2v2Publica dueloId={id} />;
      break;
    case "liga":
      content =
        jornada != null ? (
          <LigaJornadaPublica ligaId={id} numero={jornada} />
        ) : (
          <LigaDetallePublica ligaId={id} />
        );
      break;
    case "te":
    case "torneo-express":
      content = <VistaPublicaGeneral torneoId={id} />;
      break;
    case "reta":
      content = <PublicTournamentView tournamentId={id} />;
      break;
    default:
      content = (
        <p className="public-pantalla__error">
          Modo «{mode}» no disponible en pantalla.
        </p>
      );
  }

  return (
    <div
      className="public-pantalla App--public-full-width ro-public-view"
      data-pantalla-mode={mode}
    >
      <p className="public-pantalla__mode-label" aria-hidden>
        Riviera Open · {MODE_LABELS[mode]}
      </p>
      {content}
    </div>
  );
};
