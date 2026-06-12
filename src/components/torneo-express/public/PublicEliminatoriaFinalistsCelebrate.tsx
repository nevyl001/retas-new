import React from "react";
import type { PublicFinalistEntry } from "../../../lib/torneoExpress/publicBracketModel";
import { JugadorAvatar } from "../../jugadores/JugadorAvatar";
import "../../jugadores/riviera-jugadores.css";
import type { PublicRetaPairPlayer } from "../../public/PublicRetaPairSide";
import { PublicRivieraSocialBar } from "../../public/PublicRivieraSocialBar";

function parsePairLabel(label: string): [string, string] {
  const parts = label.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
  return [parts[0] ?? "?", parts[1] ?? "?"];
}

function FinalistPairShowcase({
  entry,
  players,
}: {
  entry: PublicFinalistEntry;
  players?: PublicRetaPairPlayer[];
}) {
  const [name1, name2] = parsePairLabel(entry.label);
  const p1: PublicRetaPairPlayer = players?.[0] ?? {
    id: `${entry.parejaId ?? entry.label}-1`,
    name: name1,
  };
  const p2: PublicRetaPairPlayer = players?.[1] ?? {
    id: `${entry.parejaId ?? entry.label}-2`,
    name: name2,
  };

  return (
    <div className="te-elim-finalists-pair">
      <div className="te-elim-finalists-pair__avatars" aria-hidden>
        <div className="te-elim-finalists-pair__avatar-ring">
          <JugadorAvatar
            fotoUrl={p1.fotoUrl}
            nombre={p1.name}
            size="lg"
            className="te-elim-finalists-pair__avatar"
          />
        </div>
        <div className="te-elim-finalists-pair__avatar-ring te-elim-finalists-pair__avatar-ring--front">
          <JugadorAvatar
            fotoUrl={p2.fotoUrl}
            nombre={p2.name}
            size="lg"
            className="te-elim-finalists-pair__avatar"
          />
        </div>
      </div>
      <p className="te-elim-finalists-pair__label">
        <span>{p1.name}</span>
        <span className="te-elim-finalists-pair__sep" aria-hidden>
          /
        </span>
        <span>{p2.name}</span>
      </p>
    </div>
  );
}

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
            <FinalistPairShowcase
              entry={top}
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
            <FinalistPairShowcase
              entry={bottom}
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
