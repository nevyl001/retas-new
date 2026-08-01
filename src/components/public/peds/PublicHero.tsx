import React from "react";
import "../../../styles/riviera-peds-hero.css";

export interface PublicHeroProps {
  logoClub?: React.ReactNode;
  estado?: React.ReactNode;
  nombreEvento: React.ReactNode;
  club?: React.ReactNode;
  /** Categoría libre (ej. Reta Prueba). */
  categoria?: React.ReactNode;
  /** Nivel / fuerza (ej. 5ta Fuerza). */
  nivel?: React.ReactNode;
  fecha?: React.ReactNode;
  /** Lugar / sede cuando se muestra al público. */
  lugar?: React.ReactNode;
  /** Formato del juego (Round Robin, Americano, Duelo…). Sin color de marca. */
  meta?: React.ReactNode;
  className?: string;
}

/** Hero público PEDS — solo presentación. Sin lógica ni conocimiento de modo. */
export const PublicHero: React.FC<PublicHeroProps> = ({
  logoClub,
  estado,
  nombreEvento,
  club,
  categoria,
  nivel,
  fecha,
  lugar,
  meta,
  className = "",
}) => {
  const hasMetaRow =
    Boolean(categoria) || Boolean(nivel) || Boolean(fecha) || Boolean(lugar);

  return (
    <header className={`peds-hero te-pub-fade-in ${className}`.trim()}>
      {logoClub ? <div className="peds-hero__logo">{logoClub}</div> : null}
      {estado ? <div className="peds-hero__estado">{estado}</div> : null}
      <h1 className="peds-hero__evento">{nombreEvento}</h1>
      {club ? <p className="peds-hero__club">{club}</p> : null}
      {hasMetaRow ? (
        <div className="peds-hero__meta-row">
          {categoria ? (
            <span className="peds-hero__categoria">{categoria}</span>
          ) : null}
          {nivel ? <span className="peds-hero__nivel">{nivel}</span> : null}
          {fecha ? <span className="peds-hero__fecha">{fecha}</span> : null}
          {lugar ? <span className="peds-hero__lugar">{lugar}</span> : null}
        </div>
      ) : null}
      {meta ? <p className="peds-hero__meta">{meta}</p> : null}
      <div className="peds-hero__divider" aria-hidden />
    </header>
  );
};
