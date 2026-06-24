import React, { useEffect } from "react";
import { buildMarketingOfficialRankingsUrl } from "../../lib/rivieraOfficialSite";
import type { RivieraJugadorGenero } from "../../lib/rivieraJugadores/genero";
import { JugadoresPublicShell } from "./JugadoresPublicShell";
import "./riviera-jugadores-public-ranking.css";

interface RankingOfficialOutboundProps {
  organizadorId?: string;
  genero?: RivieraJugadorGenero;
}

/** Redirige al ranking canónico en www.rivieraopen.com (no hay ranking en appriviera). */
export const RankingOfficialOutbound: React.FC<RankingOfficialOutboundProps> = ({
  organizadorId,
  genero = "M",
}) => {
  const targetUrl = buildMarketingOfficialRankingsUrl(organizadorId, genero);

  useEffect(() => {
    window.location.replace(targetUrl);
  }, [targetUrl]);

  return (
    <JugadoresPublicShell variant="ranking">
      <div className="rjp-ranking">
        <header className="rjp-ranking-header">
          <p className="rjp-ranking-header__brand">Riviera Open</p>
          <h1 className="rjp-ranking-header__title">Ranking oficial</h1>
          <p className="rjp-ranking-header__sub">
            El ranking público vive en el sitio oficial de Riviera Open. Te
            redirigimos automáticamente…
          </p>
          <a className="rjp-ranking-header__cta" href={targetUrl}>
            Ver ranking en rivieraopen.com
          </a>
        </header>
      </div>
    </JugadoresPublicShell>
  );
};
