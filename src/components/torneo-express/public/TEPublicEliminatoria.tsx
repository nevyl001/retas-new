import React, { useEffect, useMemo, useRef, useState } from "react";
import { formatTorneoExpressCategoria } from "../../../lib/torneoExpress/formatCategoria";
import { buildPublicBracketViewModel } from "../../../lib/torneoExpress/publicBracketModel";
import { buildBracketPresentationModel } from "../../../lib/torneoExpress/publicBracketPresentation";
import {
  buildPublicPodiumStatsForPair,
  type PublicEliminatoriaPodiumStats,
} from "../../../lib/torneoExpress/publicEliminatoriaPodiumStats";
import type { TorneoExpressBundle } from "../../../lib/torneoExpress/types";
import { useClubExperience } from "../../../club-experience";
import { useTorneoPublicDisplayNombre } from "../../../hooks/useTorneoPublicDisplayNombre";
import { Badge, Button } from "../../ui";
import { TEPublicBracketVisual } from "./TEPublicBracketVisual";
import { usePublicBracketPairPlayers } from "../../../hooks/usePublicBracketPairPlayers";
import "./te-public-grupos.css";
import "./torneo-express-public.css";
import "./te-public-eliminatoria.css";
import "./te-public-eliminatoria-v2.css";

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
          Math.floor((Date.now() - lastRefreshedAt.getTime()) / 1000),
        ),
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
        {realtimeConnected ? "En vivo" : `Actualizado hace ${secondsAgo}s`}
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
    [bundle, labelMap],
  );

  const pairPlayersById = usePublicBracketPairPlayers(
    bundle.torneo.organizador_id,
    model.allBracketCards,
  );

  const categoria = formatTorneoExpressCategoria(bundle.torneo.categoria);
  const displayNombre =
    useTorneoPublicDisplayNombre(bundle.torneo) || bundle.torneo.nombre;
  const { branding, manifest, isClubBranded, isScopeBrandingReady } =
    useClubExperience();
  const clubName =
    isScopeBrandingReady && manifest.displayName.trim()
      ? manifest.displayName.trim()
      : isScopeBrandingReady && branding.nombre.trim()
        ? branding.nombre.trim()
        : "Riviera Open";
  const clubLogoUrl = isScopeBrandingReady ? branding.logoUrl : null;
  const closingPairStatsById = useMemo(() => {
    const pairIds = [
      model.championCelebrate?.parejaId,
      model.runnerUpCelebrate?.parejaId,
      model.thirdPlaceCelebrate?.parejaId,
    ].filter((pairId): pairId is string => Boolean(pairId));

    return pairIds.reduce<Record<string, PublicEliminatoriaPodiumStats | null>>(
      (statsById, pairId) => {
        statsById[pairId] = buildPublicPodiumStatsForPair(bundle, pairId);
        return statsById;
      },
      {},
    );
  }, [bundle, model]);

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

  const presentation = useMemo(
    () =>
      buildBracketPresentationModel(
        model.allBracketCards,
        model.totalRondas,
        model.activeRonda,
      ),
    [model.activeRonda, model.allBracketCards, model.totalRondas],
  );
  const visibleStage = presentation.visibleRound;
  const isChampionStage = Boolean(
    visibleStage?.isFinalRound && visibleStage.isCompleted,
  );
  const phaseLine = visibleStage
    ? isChampionStage
      ? "Torneo finalizado"
      : visibleStage.isFinalRound
        ? "Gran Final"
        : visibleStage.title.charAt(0) +
          visibleStage.title.slice(1).toLowerCase()
    : null;
  const hasVisibleLiveMatch = Boolean(
    visibleStage?.matches.some((match) => match.status === "live"),
  );

  return (
    <div className="te-grupos-page te-elim-public">
      <header className="te-elim-public__header te-pub-fade-in">
        <div className="te-elim-public__header-top">
          <div>
            <h1 className="te-elim-public__title">
              {categoria ? `${displayNombre} · ${categoria}` : displayNombre}
            </h1>
            {phaseLine || hasVisibleLiveMatch ? (
              <p className="te-elim-public__subtitle">
                {phaseLine}
                {phaseLine && hasVisibleLiveMatch ? " · " : null}
                {hasVisibleLiveMatch ? (
                  <span className="te-elim-public__live">
                    <Badge variant="live">EN VIVO</Badge>
                  </span>
                ) : null}
              </p>
            ) : null}
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
      </header>

      <section className="te-elim-public-bracket-wrap te-pub-fade-in">
        <TEPublicBracketVisual
          allCards={model.allBracketCards}
          totalRondas={model.totalRondas}
          activeRonda={model.activeRonda}
          pairPlayersById={pairPlayersById}
          tournamentName={displayNombre}
          category={categoria}
          clubName={clubName}
          clubLogoUrl={clubLogoUrl}
          showMotherAttribution={isScopeBrandingReady && isClubBranded}
          pairStatsById={closingPairStatsById}
        />
      </section>

      <RefreshFooter
        lastRefreshedAt={lastRefreshedAt}
        spinning={spinning}
        realtimeConnected={realtimeConnected}
      />
    </div>
  );
};
