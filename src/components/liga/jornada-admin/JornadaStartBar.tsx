import React from "react";

export interface JornadaStartBarProps {
  puedeIniciar: boolean;
  busy?: boolean;
  hint?: string;
  onStart: () => void;
}

export const JornadaStartBar: React.FC<JornadaStartBarProps> = ({
  puedeIniciar,
  busy,
  hint,
  onStart,
}) => (
  <section className="jornada-start-bar" aria-label="Iniciar jornada">
    <div className="jornada-start-bar__copy">
      <p className="jornada-start-bar__lead">Todo listo para comenzar la jornada</p>
      {hint ? <p className="jornada-start-bar__hint">{hint}</p> : null}
      {!puedeIniciar ? (
        <p className="jornada-start-bar__warn">Se requieren al menos 3 parejas.</p>
      ) : null}
    </div>
    <button
      type="button"
      className="jornada-start-bar__btn"
      disabled={!puedeIniciar || busy}
      onClick={onStart}
    >
      Iniciar jornada
    </button>
  </section>
);
