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
        <span className="te-elim-aviso-page__rule" aria-hidden />
        <div className="te-elim-aviso-page__body">
          {AVISO_CUADRO_PARRAFOS.map((parrafo) => (
            <p key={parrafo}>{parrafo}</p>
          ))}
        </div>
        <footer className="te-elim-aviso-page__close">
          <p className="te-elim-aviso-page__close-kicker">A todos los que compiten</p>
          <p className="te-elim-aviso-page__close-line">
            Gracias por participar. Cada punto cuenta: compite con todo,
            disfruta el camino y demuestra que eres el mejor.
          </p>
        </footer>
      </article>
    </PublicTorneoExpressShell>
  );
};
