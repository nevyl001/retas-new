import React from "react";
import type { RivieraJugadorGenero } from "../../lib/rivieraJugadores/genero";
import { RIVIERA_GENERO_LABELS } from "../../lib/rivieraJugadores/genero";

export const JugadoresGeneroTabs: React.FC<{
  genero: RivieraJugadorGenero;
  onChange: (genero: RivieraJugadorGenero) => void;
  className?: string;
}> = ({ genero, onChange, className = "" }) => (
  <div
    className={`rj-genero-tabs${className ? ` ${className}` : ""}`}
    role="tablist"
    aria-label="Modalidad del registro"
  >
    {(["M", "F"] as const).map((g) => {
      const active = genero === g;
      return (
        <button
          key={g}
          type="button"
          role="tab"
          aria-selected={active}
          className={`rj-genero-tabs__btn${active ? " rj-genero-tabs__btn--active" : ""}`}
          onClick={() => onChange(g)}
        >
          {RIVIERA_GENERO_LABELS[g]}
        </button>
      );
    })}
  </div>
);
