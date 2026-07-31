import React from "react";
import { getRetaId, type HomeRetaItem } from "../../lib/retasList";
import type { GameModeConfig } from "./gameModesConfig";
import { RecentRetaCard } from "./RecentRetaCard";
import { ModeHeader } from "../platform/ModeHeader";
import { Button } from "../ui";
import { TablerIcon } from "../ui/TablerIcon";

interface HomeModeDetailProps {
  mode: GameModeConfig;
  items: HomeRetaItem[];
  onContinue: (item: HomeRetaItem) => void;
  onCreateNew: () => void;
  onBack: () => void;
}

export const HomeModeDetail: React.FC<HomeModeDetailProps> = ({
  mode,
  items,
  onContinue,
  onCreateNew,
  onBack,
}) => (
  <section className="home-mode-detail" aria-label={`${mode.title} activas`}>
    <button
      type="button"
      className="home-mode-detail__back"
      onClick={onBack}
      aria-label="Volver a modos de juego"
    >
      <TablerIcon name="chevron-left" size={18} aria-hidden />
      Modos de juego
    </button>
    <ModeHeader
      className="home-mode-detail__header rv-mode-header rv-mode-header--entry"
      eyebrow={mode.typeLabel}
      title={mode.title}
      subtitle="Continúa una reta en curso o crea una nueva."
    />
    <div className="home-mode-detail__list">
      {items.map((item) => (
        <RecentRetaCard
          key={getRetaId(item)}
          item={item}
          variant="featured"
          onContinue={() => onContinue(item)}
        />
      ))}
    </div>
    <Button
      type="button"
      variant="primary"
      size="lg"
      className="home-mode-detail__create"
      onClick={onCreateNew}
    >
      + Crear nueva {mode.title.toLowerCase()}
    </Button>
  </section>
);
