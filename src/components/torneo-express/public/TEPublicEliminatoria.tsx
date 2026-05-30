import React, { useEffect, useMemo, useRef, useState } from "react";
import { formatTorneoExpressCategoria } from "../../../lib/torneoExpress/formatCategoria";
import { buildPublicBracketViewModel } from "../../../lib/torneoExpress/publicBracketModel";
import type { TorneoExpressBundle } from "../../../lib/torneoExpress/types";
import { Badge, Button } from "../../ui";
import { TEPublicBracketVisual } from "./TEPublicBracketVisual";
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

function PublicEliminatoriaFinalistsCelebrate({
  finalistLabels,
  categoria,
}: {
  finalistLabels: string[];
  categoria: string | null;
}) {
  const [top, bottom] = finalistLabels;

  return (
    <section
      className="te-pub-grupo-celebrate te-pub-fade-in te-elim-public-celebrate te-elim-public-celebrate--finalists"
      aria-label="Felicitación a finalistas"
    >
      <div className="te-pub-grupo-celebrate__inner te-elim-public-celebrate__inner">
        <h2 className="te-elim-finalists-headline">¡Felicidades finalistas!</h2>

        {categoria ? (
          <p className="te-elim-celebrate__categoria">
            Categoría · {categoria.toUpperCase()}
          </p>
        ) : null}

        <div className="te-elim-finalists-duel" aria-label="Finalistas">
          {top ? (
            <p className="te-elim-finalist-name">{top}</p>
          ) : null}
          <p className="te-elim-finalists-vs" aria-hidden>
            <span className="te-elim-finalists-vs__line" />
            <span className="te-elim-finalists-vs__text">vs</span>
            <span className="te-elim-finalists-vs__line" />
          </p>
          {bottom ? (
            <p className="te-elim-finalist-name">{bottom}</p>
          ) : null}
        </div>

        <p className="te-elim-finalists-message">
          En Riviera Open vivimos el pádel como ustedes: con pasión, esfuerzo y
          ganas de mejorar cada semana. Los esperamos en la cancha. Que gane el
          mejor.
        </p>
      </div>
    </section>
  );
}

function PublicEliminatoriaCelebrate({
  championLabel,
  torneoNombre,
  categoria,
}: {
  championLabel: string;
  torneoNombre: string;
  categoria: string | null;
}) {
  return (
    <section
      className="te-pub-grupo-celebrate te-pub-fade-in te-elim-public-celebrate"
      aria-label="Campeones del torneo"
    >
      <div className="te-pub-grupo-celebrate__inner">
        <header className="te-pub-grupo-celebrate__brand">
          <div className="te-divider-gold te-divider-gold--wide" aria-hidden />
          <p className="te-pub-grupo-celebrate__wordmark">
            RIVIERA
            <span className="te-pub-grupo-celebrate__wordmark-sep" aria-hidden>
              {" "}
              ·{" "}
            </span>
            OPEN
          </p>
        </header>

        <div className="te-divider-gold" aria-hidden />

        <h2 className="te-pub-grupo-celebrate__headline">¡Campeones!</h2>
        <p className="te-pub-grupo-celebrate__riviera-line">Riviera Open</p>
        {categoria ? (
          <p className="te-elim-celebrate__categoria">
            Categoría · {categoria.toUpperCase()}
          </p>
        ) : null}
        <p className="te-elim-finalist-name te-elim-finalist-name--champion">
          {championLabel}
        </p>
        <p className="te-pub-grupo-celebrate__motivational">
          Una final inolvidable. Gracias por dejarlo todo en la cancha y elevar el torneo.
        </p>

        <footer className="te-pub-grupo-celebrate__footer">
          <div className="te-divider-gold" aria-hidden />
          <p className="te-pub-grupo-celebrate__torneo">{torneoNombre}</p>
          <p className="te-pub-grupo-celebrate__closing">Vive Riviera Open</p>
        </footer>
      </div>
    </section>
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

  const categoria = formatTorneoExpressCategoria(bundle.torneo.categoria);

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
          categoria={categoria}
        />
      </section>

      {model.finalistsCelebrate && !model.championLabel ? (
        <>
          <div
            className="te-elim-public-bracket-divider"
            aria-hidden
          />
          <PublicEliminatoriaFinalistsCelebrate
            finalistLabels={model.finalistsCelebrate.labels}
            categoria={categoria}
          />
        </>
      ) : null}

      {model.championLabel ? (
        <PublicEliminatoriaCelebrate
          championLabel={model.championLabel}
          torneoNombre={bundle.torneo.nombre}
          categoria={categoria}
        />
      ) : null}

      <RefreshFooter lastRefreshedAt={lastRefreshedAt} spinning={spinning} />
    </div>
  );
};
