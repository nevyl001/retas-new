import React from "react";
import type { PublicFinalistEntry } from "../../../lib/torneoExpress/publicBracketModel";
import type { PublicRetaPairPlayer } from "../../public/PublicRetaPairSide";
import { PublicRivieraSocialBar } from "../../public/PublicRivieraSocialBar";
import { PublicEliminatoriaPairShowcase } from "./PublicEliminatoriaPairShowcase";

export const PublicEliminatoriaFinalistsCelebrate: React.FC<{
  finalists: PublicFinalistEntry[];
  categoria: string | null;
  torneoNombre: string;
  pairPlayersById: Record<string, PublicRetaPairPlayer[]>;
}> = ({ finalists, categoria, torneoNombre, pairPlayersById }) => {
  const [top, bottom] = finalists;

  return (
    <section
      className="te-pub-grupo-celebrate te-pub-fade-in te-elim-public-celebrate te-elim-public-celebrate--finalists te-elim-finalists-share"
      aria-label="Felicitación a finalistas"
    >
      <div className="te-elim-finalists-share__glow" aria-hidden />
      <div className="te-pub-grupo-celebrate__inner te-elim-public-celebrate__inner te-elim-finalists-share__inner">
        <header className="te-elim-finalists-brand">
          <div className="te-divider-gold te-divider-gold--wide" aria-hidden />
          <p className="te-pub-grupo-celebrate__wordmark">
            RIVIERA
            <span className="te-pub-grupo-celebrate__wordmark-sep" aria-hidden>
              {" "}
              ·{" "}
            </span>
            OPEN
          </p>
        </header>

        <div className="te-divider-gold te-elim-finalists-brand__divider" aria-hidden />

        <div className="te-elim-finalists-share__badge-wrap">
          <p className="te-elim-finalists-share__badge">Finalistas</p>
        </div>
        <h2 className="te-elim-finalists-headline">¡Felicidades finalistas!</h2>

        {categoria ? (
          <p className="te-elim-celebrate__categoria">
            Categoría · {categoria.toUpperCase()}
          </p>
        ) : null}

        <div className="te-elim-finalists-faceoff" aria-label="Finalistas">
          {top ? (
            <PublicEliminatoriaPairShowcase
              label={top.label}
              parejaId={top.parejaId}
              players={
                top.parejaId ? pairPlayersById[top.parejaId] : undefined
              }
            />
          ) : null}

          <div className="te-elim-finalists-faceoff__vs" aria-hidden>
            <span className="te-elim-finalists-faceoff__vs-line" />
            <span className="te-elim-finalists-faceoff__vs-text">VS</span>
            <span className="te-elim-finalists-faceoff__vs-line" />
          </div>

          {bottom ? (
            <PublicEliminatoriaPairShowcase
              label={bottom.label}
              parejaId={bottom.parejaId}
              players={
                bottom.parejaId ? pairPlayersById[bottom.parejaId] : undefined
              }
            />
          ) : null}
        </div>

        <p className="te-elim-finalists-message">
          En Riviera Open vivimos el pádel como ustedes: con pasión, esfuerzo y
          ganas de mejorar cada semana. Los esperamos en la cancha. Que gane el
          mejor.
        </p>

        <footer className="te-elim-finalists-share__footer">
          <p className="te-elim-finalists-share__torneo">{torneoNombre}</p>
          <p className="te-elim-finalists-share__tagline">Vive Riviera Open</p>
          <PublicRivieraSocialBar compact />
        </footer>
      </div>
    </section>
  );
};
