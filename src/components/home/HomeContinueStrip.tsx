import React from "react";
import { getRetaGameMode, getRetaId, getRetaName, type HomeRetaItem } from "../../lib/retasList";
import { TablerIcon } from "../ui/TablerIcon";
import { GAME_MODES } from "./gameModesConfig";

interface HomeContinueStripProps {
  items: HomeRetaItem[];
  onContinue: (item: HomeRetaItem) => void;
}

/** Franja superior: muestra retas activas primero para continuar o gestionarlas. */
export const HomeContinueStrip: React.FC<HomeContinueStripProps> = ({
  items,
  onContinue,
}) => {
  if (items.length === 0) return null;

  return (
    <section className="home-pending" aria-label="Retas activas">
      <div className="home-pending__header">
        <h2 className="home-pending__title">Activas</h2>
        <p className="home-pending__hint">Continúa o gestiona lo que tienes en curso</p>
      </div>
      <div className="home-pending__list">
        {items.map((item) => {
          const mode = GAME_MODES.find((m) => m.id === getRetaGameMode(item));
          return (
            <button
              key={getRetaId(item)}
              type="button"
              className="home-pending-card"
              onClick={() => onContinue(item)}
            >
              <span className="home-pending-card__icon" aria-hidden>
                <TablerIcon name={mode?.tablerIcon ?? "ball-tennis"} size={18} />
              </span>
              <span className="home-pending-card__name">{getRetaName(item)}</span>
              <TablerIcon name="chevron-right" size={16} className="home-pending-card__go" />
            </button>
          );
        })}
      </div>
    </section>
  );
};
