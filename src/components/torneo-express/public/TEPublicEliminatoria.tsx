import React, { useEffect, useMemo, useRef, useState } from "react";
import { formatTorneoExpressCategoria } from "../../../lib/torneoExpress/formatCategoria";
import {
  buildPublicBracketViewModel,
  type PublicBracketScheduleProjection,
} from "../../../lib/torneoExpress/publicBracketModel";
import { buildBracketPresentationModel } from "../../../lib/torneoExpress/publicBracketPresentation";
import {
  buildPublicPodiumStatsForPair,
  type PublicEliminatoriaPodiumStats,
} from "../../../lib/torneoExpress/publicEliminatoriaPodiumStats";
import { isRondaTercerLugar } from "../../../lib/torneoExpress/bracketRounds";
import type { TorneoExpressBundle } from "../../../lib/torneoExpress/types";
import { useClubExperience } from "../../../club-experience";
import { useOrganizerDisplayName } from "../../../club-experience/useOrganizerDisplayName";
import {
  isRivieraOwnAccountName,
  RIVIERA_PRODUCT_NAME,
} from "../../../club-experience/motherBrand";
import { useTorneoPublicEventoNav } from "../../../hooks/useTorneoPublicDisplayNombre";
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
  /** Enlace al hub del Evento (todas las categorías). */
  eventoHref?: string | null;
  /** true si el canal Realtime está SUBSCRIBED; si no, se degrada a "Actualizado hace Ns". */
  realtimeConnected?: boolean;
  /** Horarios posibles del evento (proyección; no genera el cuadro). */
  schedule?: React.ReactNode;
  /** Horario del evento cuando el partido aún no tiene programado_en. */
  scheduleProjection?: PublicBracketScheduleProjection;
}

export const TEPublicEliminatoria: React.FC<TEPublicEliminatoriaProps> = ({
  bundle,
  labelMap,
  lastRefreshedAt,
  onCopyLink,
  copyMsg,
  gruposHref,
  eventoHref,
  realtimeConnected,
  schedule,
  scheduleProjection,
}) => {
  const [spinning, setSpinning] = useState(false);
  const prevRefreshRef = useRef<Date | null>(null);

  const model = useMemo(
    () => buildPublicBracketViewModel(bundle, labelMap, scheduleProjection),
    [bundle, labelMap, scheduleProjection],
  );

  const pairPlayersById = usePublicBracketPairPlayers(
    bundle.torneo.organizador_id,
    model.allBracketCards,
  );

  const categoria = formatTorneoExpressCategoria(bundle.torneo.categoria);
  const displayNombre =
    useTorneoPublicEventoNav(bundle.torneo).displayNombre || bundle.torneo.nombre;
  const { branding, isScopeBrandingReady } = useClubExperience();
  const organizerName = useOrganizerDisplayName(
    bundle.torneo.organizador_id
  ).trim();
  const clubName = organizerName || RIVIERA_PRODUCT_NAME;
  const clubLogoUrl = isScopeBrandingReady ? branding.logoUrl : null;
  const closingPairStatsById = useMemo(() => {
    const pairIds = new Set<string>();
    for (const pairId of [
      model.championCelebrate?.parejaId,
      model.runnerUpCelebrate?.parejaId,
      model.thirdPlaceCelebrate?.parejaId,
    ]) {
      if (pairId) pairIds.add(pairId);
    }
    for (const card of model.allBracketCards) {
      const isFinalCard = card.ronda === model.totalRondas;
      if (!isFinalCard && !isRondaTercerLugar(card.ronda)) continue;
      if (card.local.parejaId) pairIds.add(card.local.parejaId);
      if (card.visit.parejaId) pairIds.add(card.visit.parejaId);
    }

    return Array.from(pairIds).reduce<
      Record<string, PublicEliminatoriaPodiumStats | null>
    >((statsById, pairId) => {
      statsById[pairId] = buildPublicPodiumStatsForPair(bundle, pairId);
      return statsById;
    }, {});
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
  const openingStage = useMemo(() => {
    if (presentation.visibleRound) return presentation.visibleRound;
    return (
      buildBracketPresentationModel(
        model.allBracketCards,
        model.totalRondas,
        model.activeRonda,
        {},
        { includePendingSlots: true },
      ).rounds[0] ?? null
    );
  }, [model.activeRonda, model.allBracketCards, model.totalRondas, presentation.visibleRound]);
  const visibleStage = openingStage;
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
        {eventoHref ? (
          <a
            href={eventoHref}
            className="te-grupos-back-evento"
            aria-label="Volver al evento y ver todas las categorías"
          >
            ← Volver al evento
          </a>
        ) : null}
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
      {schedule}

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
          showMotherAttribution={!isRivieraOwnAccountName(clubName)}
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
