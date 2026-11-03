import React, { useEffect, useRef } from "react";
import type { PublicRondaEstadoItem } from "../../../lib/liga/jornadaTemporal";

function rondaEstadoHint(estado: PublicRondaEstadoItem["estado"]): string {
  if (estado === "live") return "En curso";
  if (estado === "done") return "Completada";
  return "Pendiente";
}

export interface LigaJornadaPublicRoundSelectorProps {
  rondas: ReadonlyArray<PublicRondaEstadoItem>;
  selectedRonda: number;
  onSelect: (ronda: number) => void;
}

/**
 * Pills horizontales premium para navegar rondas en la jornada pública.
 * Solo UI de selección; no altera emparejamientos ni resultados.
 */
export const LigaJornadaPublicRoundSelector: React.FC<
  LigaJornadaPublicRoundSelectorProps
> = ({ rondas, selectedRonda, onSelect }) => {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const active = activeRef.current;
    if (!scroller || !active) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const offset =
      activeRect.left -
      scrollerRect.left -
      (scrollerRect.width - activeRect.width) / 2;
    scroller.scrollBy({ left: offset, behavior: "smooth" });
  }, [selectedRonda, rondas]);

  if (rondas.length === 0) return null;

  return (
    <div className="liga-pub-round-selector" role="navigation" aria-label="Rondas">
      <div
        ref={scrollerRef}
        className="liga-pub-round-selector__track"
        role="tablist"
        aria-label="Seleccionar ronda"
      >
        {rondas.map(({ ronda, estado }) => {
          const selected = ronda === selectedRonda;
          return (
            <button
              key={ronda}
              ref={selected ? activeRef : undefined}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`liga-pub-ronda-panel-${ronda}`}
              id={`liga-pub-ronda-tab-${ronda}`}
              title={rondaEstadoHint(estado)}
              className={`liga-pub-round-selector__pill${
                selected ? " is-selected" : ""
              }${estado === "live" ? " is-live" : ""}${
                estado === "done" ? " is-done" : ""
              }`}
              onClick={() => onSelect(ronda)}
            >
              <span className="liga-pub-round-selector__pill-label">
                Ronda {ronda}
              </span>
              {estado === "live" ? (
                <span className="liga-pub-round-selector__dot" aria-hidden />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
};
