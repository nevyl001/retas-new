import React from "react";
import { PublicTorneoExpressShell } from "./PublicTorneoExpressShell";
import {
  AVISO_CUADRO_PARRAFOS,
  AVISO_CUADRO_TITULO,
} from "./avisoCuadroCopy";
import "./te-public-eliminatoria.css";

export const VistaAvisoCuadro: React.FC = () => {
  return (
    <PublicTorneoExpressShell className="te-public--eliminatoria">
      <article className="te-elim-aviso-page">
        <p className="te-elim-aviso-page__kicker">Aviso de la organización</p>
        <h1 className="te-elim-aviso-page__title">{AVISO_CUADRO_TITULO}</h1>
        <div className="te-elim-aviso-page__body">
          {AVISO_CUADRO_PARRAFOS.map((parrafo) => (
            <p key={parrafo}>{parrafo}</p>
          ))}
        </div>
      </article>
    </PublicTorneoExpressShell>
  );
};
