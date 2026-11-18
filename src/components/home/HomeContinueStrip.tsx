import React from "react";
import { getRetaGameMode, getRetaId, getRetaName, type HomeRetaItem } from "../../lib/retasList";
import { TablerIcon } from "../ui/TablerIcon";
import { GAME_MODES } from "./gameModesConfig";

interface HomeContinueStripProps {
  items: HomeRetaItem[];
  onContinue: (item: HomeRetaItem) => void;
}

/** Solo se muestra cuando hay actividades reales en curso. */
export const HomeContinueStrip: React.FC<HomeContinueStripProps> = ({
  items,
  onContinue,
}) => {
  if (items.length === 0) return null;

  return (
    <section className="ops-section ops-live" aria-labelledby="ops-live-title">
      <h2 id="ops-live-title">En curso</h2>
      <div className="ops-live__list">
        {items.map((item) => {
          const mode = GAME_MODES.find((entry) => entry.id === getRetaGameMode(item));
          return (
            <button
              key={getRetaId(item)}
              type="button"
              className="ops-live__item"
              onClick={() => onContinue(item)}
            >
              <span className="ops-card__icon" aria-hidden>
                <TablerIcon name={mode?.tablerIcon ?? "ball-tennis"} size={18} />
              </span>
              <span className="ops-live__name">{getRetaName(item)}</span>
              <TablerIcon name="chevron-right" size={16} className="ops-card__go" />
            </button>
          );
        })}
      </div>
    </section>
  );
};
