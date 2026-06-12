import React, { useEffect, useMemo, useRef, useState } from "react";
import { buildPublicPodiumStatsForPair } from "../../../lib/torneoExpress/publicEliminatoriaPodiumStats";
import { formatTorneoExpressCategoria } from "../../../lib/torneoExpress/formatCategoria";
import { buildPublicBracketViewModel } from "../../../lib/torneoExpress/publicBracketModel";
import type { TorneoExpressBundle } from "../../../lib/torneoExpress/types";
import { Badge, Button } from "../../ui";
import { TEPublicBracketVisual } from "./TEPublicBracketVisual";
import { PodiumCard } from "./PodiumCard";
import { PublicEliminatoriaFinalistsCelebrate } from "./PublicEliminatoriaFinalistsCelebrate";
import { usePublicBracketPairPlayers } from "../../../hooks/usePublicBracketPairPlayers";
import "./te-public-grupos.css";
import "./torneo-express-public.css";
import "./te-public-eliminatoria.css";

function RefreshFooter({
  lastRefreshedAt,
  spinning,
}: {
  lastRefreshedAt: Date | null;
  spinning: boolean;
}) {
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    if (!lastRefreshedAt) return;
    const tick = () => {
      setSecondsAgo(
        Math.max(
          0,
          Math.floor((Date.now() - lastRefreshedAt.getTime()) / 1000)
        )
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [lastRefreshedAt]);

  return (
    <footer className="te-elim-public-footer" aria-live="polite">
      <span
        className={`te-elim-public-footer__icon${
          spinning ? " is-spinning" : ""
        }`}
        aria-hidden
      >
        ↻
      </span>
      <span>
        RIVIERA OPEN · Vista pública · Actualizado hace {secondsAgo}s
      </span>
    </footer>
  );
}

export interface TEPublicEliminatoriaProps {
  bundle: TorneoExpressBundle;
  labelMap: Record<string, string>;
  lastRefreshedAt: Date | null;
  onCopyLink?: () => void;
  copyMsg?: string;
}

export const TEPublicEliminatoria: React.FC<TEPublicEliminatoriaProps> = ({
  bundle,
  labelMap,
  lastRefreshedAt,
  onCopyLink,
  copyMsg,
}) => {
  const [spinning, setSpinning] = useState(false);
  const prevRefreshRef = useRef<Date | null>(null);

  const model = useMemo(
    () => buildPublicBracketViewModel(bundle, labelMap),
    [bundle, labelMap]
  );

  const pairPlayersById = usePublicBracketPairPlayers(
    bundle.torneo.organizador_id,
    model.allBracketCards
  );

  const categoria = formatTorneoExpressCategoria(bundle.torneo.categoria);

  const championStats = useMemo(
    () =>
      buildPublicPodiumStatsForPair(
        bundle,
        model.championCelebrate?.parejaId
      ),
    [bundle, model.championCelebrate?.parejaId]
  );

  const runnerUpStats = useMemo(
    () =>
      buildPublicPodiumStatsForPair(bundle, model.runnerUpCelebrate?.parejaId),
    [bundle, model.runnerUpCelebrate?.parejaId]
  );

  const thirdPlaceStats = useMemo(
    () =>
      buildPublicPodiumStatsForPair(
        bundle,
        model.thirdPlaceCelebrate?.parejaId
      ),
    [bundle, model.thirdPlaceCelebrate?.parejaId]
  );

  useEffect(() => {
    if (!lastRefreshedAt) return;
    if (
      prevRefreshRef.current !== null &&
      prevRefreshRef.current.getTime() !== lastRefreshedAt.getTime()
    ) {
      setSpinning(true);
      const t = window.setTimeout(() => setSpinning(false), 700);
      prevRefreshRef.current = lastRefreshedAt;
      return () => window.clearTimeout(t);
    }
    prevRefreshRef.current = lastRefreshedAt;
  }, [lastRefreshedAt]);

  return (
    <div className="te-grupos-page te-elim-public">
      <header className="te-grupos-hero te-pub-fade-in">
        <div className="te-grupos-hero__top">
          <div>
            <p className="te-grupos-eyebrow">RIVIERA OPEN</p>
            <h1 className="te-grupos-title">{bundle.torneo.nombre}</h1>
            <p className="te-elim-tagline">{model.motivationalMessage}</p>
          </div>
          {onCopyLink ? (
            <div className="te-grupos-hero__actions">
              <Button type="button" variant="secondary" size="sm" onClick={onCopyLink}>
                Copiar enlace
              </Button>
              {copyMsg ? (
                <p className="te-grupos-copy-msg">{copyMsg}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="te-public-header__meta">
          {categoria ? (
            <span className="te-public-header__categoria-pill">{categoria}</span>
          ) : null}
          <span className="te-public-header__grupo-pill">
            {model.currentPhaseUpper}
          </span>
          {model.hasLiveMatch ? (
            <Badge variant="live">EN VIVO</Badge>
          ) : null}
        </div>

        {model.championLabel ? (
          <p className="te-elim-champion">
            <span className="te-elim-champion__icon" aria-hidden>
              🏆
            </span>
            <span className="te-elim-champion__label">Campeones:</span>
            <strong className="te-elim-champion__names">{model.championLabel}</strong>
          </p>
        ) : null}
      </header>

      <section className="te-elim-public-bracket-wrap te-pub-fade-in">
        <TEPublicBracketVisual
          allCards={model.allBracketCards}
          totalRondas={model.totalRondas}
          activeRonda={model.activeRonda}
          categoria={categoria}
          fase={bundle.torneo.fase_eliminacion}
          pairPlayersById={pairPlayersById}
        />
      </section>

      {model.finalistsCelebrate && !model.championLabel ? (
        <>
          <div
            className="te-elim-public-bracket-divider"
            aria-hidden
          />
          <PublicEliminatoriaFinalistsCelebrate
            finalists={model.finalistsCelebrate.finalists}
            categoria={categoria}
            torneoNombre={bundle.torneo.nombre}
            pairPlayersById={pairPlayersById}
          />
        </>
      ) : null}

      {model.championCelebrate ? (
        <>
          <div className="te-elim-public-bracket-divider" aria-hidden />
          <PodiumCard
            position={1}
            entry={model.championCelebrate}
            categoria={categoria}
            torneoNombre={bundle.torneo.nombre}
            pairPlayersById={pairPlayersById}
            stats={championStats}
          />
        </>
      ) : null}

      {model.runnerUpCelebrate ? (
        <>
          <div className="te-elim-public-bracket-divider" aria-hidden />
          <PodiumCard
            position={2}
            entry={model.runnerUpCelebrate}
            categoria={categoria}
            torneoNombre={bundle.torneo.nombre}
            pairPlayersById={pairPlayersById}
            stats={runnerUpStats}
          />
        </>
      ) : null}

      {model.thirdPlaceCelebrate ? (
        <>
          <div className="te-elim-public-bracket-divider" aria-hidden />
          <PodiumCard
            position={3}
            entry={model.thirdPlaceCelebrate}
            categoria={categoria}
            torneoNombre={bundle.torneo.nombre}
            pairPlayersById={pairPlayersById}
            stats={thirdPlaceStats}
          />
        </>
      ) : null}

      <RefreshFooter lastRefreshedAt={lastRefreshedAt} spinning={spinning} />
    </div>
  );
};
