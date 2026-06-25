import React from "react";
import {
  buildMarketingOfficialRankingsUrl,
  getOfficialRankingsPageUrl,
} from "../../lib/rivieraOfficialSite";

interface RankingInternoDisclaimerProps {
  organizadorId?: string | null;
  className?: string;
}

/** Aviso: ranking interno del club vs sitio oficial (rivieraopen.com/rankings). */
export const RankingInternoDisclaimer: React.FC<RankingInternoDisclaimerProps> = ({
  organizadorId,
  className = "rjp-ranking-header__sub",
}) => {
  const officialHref = buildMarketingOfficialRankingsUrl(organizadorId);
  const officialLabel = getOfficialRankingsPageUrl();

  return (
    <p className={className}>
      Ranking interno de tu club. Todos los jugadores activos aparecen aquí.
      Solo los seleccionados aparecen en el sitio oficial:{" "}
      <a
        className="rjp-ranking-header__official-link"
        href={officialHref}
        target="_blank"
        rel="noopener noreferrer"
      >
        {officialLabel}
      </a>
      .
    </p>
  );
};
