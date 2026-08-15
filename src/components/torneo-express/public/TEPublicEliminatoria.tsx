import React, { useEffect, useMemo, useRef, useState } from "react";
import { buildPublicPodiumStatsForPair } from "../../../lib/torneoExpress/publicEliminatoriaPodiumStats";
import { formatTorneoExpressCategoria } from "../../../lib/torneoExpress/formatCategoria";
import { buildPublicBracketViewModel } from "../../../lib/torneoExpress/publicBracketModel";
import type { TorneoExpressBundle } from "../../../lib/torneoExpress/types";
import { useTorneoPublicDisplayNombre } from "../../../hooks/useTorneoPublicDisplayNombre";
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
  realtimeConnected,
}: {
  lastRefreshedAt: Date | null;
  spinning: boolean;
  realtimeConnected?: boolean;
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
        RIVIERA OPEN · Vista pública ·{" "}
        {realtimeConnected
          ? "En vivo"
          : `Actualizado hace ${secondsAgo}s`}
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
  /** Enlace secundario a grupos (siempre accesible tras generar eliminatoria). */
  gruposHref?: string;
  /** true si el canal Realtime está SUBSCRIBED; si no, se degrada a "Actualizado hace Ns". */
  realtimeConnected?: boolean;
}

export const TEPublicEliminatoria: React.FC<TEPublicEliminatoriaProps> = ({
  bundle,
  labelMap,
  lastRefreshedAt,
  onCopyLink,
  copyMsg,
  gruposHref,
  realtimeConnected,
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
  const displayNombre =
    useTorneoPublicDisplayNombre(bundle.torneo) || bundle.torneo.nombre;

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

  const phaseSubtitle = model.currentPhaseUpper
    .replace(/DE FINAL\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const phaseLine = phaseSubtitle
    ? phaseSubtitle.charAt(0) + phaseSubtitle.slice(1).toLowerCase()
    : null;

  return (
    <div className="te-grupos-page te-elim-public">
      <header className="te-elim-public__header te-pub-fade-in">
        <div className="te-elim-public__header-top">
          <div>
            <h1 className="te-elim-public__title">
              {categoria
                ? `${displayNombre} · ${categoria}`
                : displayNombre}
            </h1>
            {phaseLine || model.hasLiveMatch ? (
              <p className="te-elim-public__subtitle">
                {phaseLine}
                {phaseLine && model.hasLiveMatch ? " · " : null}
                {model.hasLiveMatch ? (
                  <span className="te-elim-public__live">
                    <Badge variant="live">EN VIVO</Badge>
                  </span>
                ) : null}
              </p>
            ) : null}
            <p className="te-elim-tagline">{model.motivationalMessage}</p>
          </div>
          {onCopyLink || gruposHref ? (
            <div className="te-elim-public__actions">
              {gruposHref ? (
                <a href={gruposHref} className="te-public-phase-nav-link">
                  Ver grupos
                </a>
              ) : null}
              {onCopyLink ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onCopyLink}
                >
                  Copiar enlace
                </Button>
              ) : null}
              {copyMsg ? (
                <p className="te-elim-public__copy-msg">{copyMsg}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {model.championLabel ? (
          <p className="te-elim-champion">
            <span className="te-elim-champion__icon" aria-hidden>
              🏆
            </span>
            <span className="te-elim-champion__label">Campeones:</span>
            <strong className="te-elim-champion__names">
              {model.championLabel}
            </strong>
          </p>
        ) : null}
      </header>

      <section className="te-elim-public-bracket-wrap te-pub-fade-in">
        <TEPublicBracketVisual
          allCards={model.allBracketCards}
          totalRondas={model.totalRondas}
          activeRonda={model.activeRonda}
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

      {model.sharedSemifinalists && model.sharedSemifinalists.length > 0 ? (
        <>
          <div className="te-elim-public-bracket-divider" aria-hidden />
          <section
            className="te-elim-shared-semis"
            aria-label="Semifinalistas"
          >
            <h2 className="te-elim-shared-semis__title">Semifinalistas</h2>
            <ul className="te-elim-shared-semis__list">
              {model.sharedSemifinalists.map((entry) => (
                <li key={entry.parejaId ?? entry.label} className="te-elim-shared-semis__item">
                  {entry.label}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      <RefreshFooter
        lastRefreshedAt={lastRefreshedAt}
        spinning={spinning}
        realtimeConnected={realtimeConnected}
      />
    </div>
  );
};
