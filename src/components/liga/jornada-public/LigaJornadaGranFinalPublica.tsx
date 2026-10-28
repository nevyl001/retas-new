import React, { useEffect, useRef, useState } from "react";
import {
  ligaGranFinalScoreLabel,
  ligaGranFinalSubtitle,
  ligaTemporadaLabelFromNombre,
  resolveLigaGranFinalPresentationState,
  type LigaGranFinalPresentationState,
} from "../../../lib/liga/ligaGranFinalPublic";
import { resolveLigaPublicPlayerRating } from "../../../lib/liga/ligaPublicPlayerRating";
import type { LigaPartido } from "../../../lib/liga/types";
import { partidoMatchWinnerSide } from "../../../lib/liga/publicDisplay";
import { JugadorRatingChip } from "../../jugadores/JugadorRatingChip";
import {
  isPhotographicSplitVsFoto,
  playerAvatarHashTone,
  splitPlayerDisplayName,
} from "./ligaJornadaMatchNames";
import "./liga-jornada-gran-final.css";

export type LigaGranFinalPlayer = {
  name: string;
  foto?: string | null;
  /** Rating original de inscripción (liga_jugadores.nivel). */
  nivel?: number | null;
  /** Rating actual Riviera cuando no hay nivel histórico. */
  rivieraRating?: number | null;
};

export type LigaGranFinalPair = {
  pairName: string;
  player1: LigaGranFinalPlayer;
  player2: LigaGranFinalPlayer;
};

export interface LigaJornadaGranFinalPublicaProps {
  ligaNombre: string;
  partido: LigaPartido;
  side1: LigaGranFinalPair;
  side2: LigaGranFinalPair;
  esParejasFijas: boolean;
  fechaHorarioText?: string | null;
}

function playerInitials(name: string): string {
  const { primary, secondary } = splitPlayerDisplayName(name);
  return `${primary.charAt(0)}${
    secondary?.charAt(0) ?? primary.charAt(1) ?? ""
  }`.toUpperCase();
}

const GranFinalPortrait: React.FC<{ player: LigaGranFinalPlayer }> = ({
  player,
}) => {
  const tone = playerAvatarHashTone(player.name);
  const photosStillResolving = player.foto === undefined;
  const candidate =
    !photosStillResolving && isPhotographicSplitVsFoto(player.foto)
      ? player.foto!.trim()
      : null;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const showPhoto = Boolean(candidate) && !failed && loaded;

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [candidate]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !candidate) return;
    if (img.complete) {
      if (img.naturalWidth === 0) setFailed(true);
      else setLoaded(true);
    }
  }, [candidate]);

  const rating = resolveLigaPublicPlayerRating(
    player.nivel ?? null,
    player.rivieraRating ?? null
  );
  const showRating = rating.value != null;

  return (
    <figure
      className={`liga-gran-final__portrait${
        showPhoto ? " liga-gran-final__portrait--has-photo" : ""
      }`}
    >
      <div
        className="liga-gran-final__portrait-fallback"
        style={{ color: tone.color }}
        aria-hidden
      >
        {playerInitials(player.name)}
      </div>
      {candidate ? (
        <img
          ref={imgRef}
          className={`liga-gran-final__portrait-photo${
            showPhoto ? " is-visible" : ""
          }`}
          src={candidate}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
      <div className="liga-gran-final__portrait-scrim" aria-hidden />
      <figcaption className="liga-gran-final__portrait-identity">
        <span className="liga-gran-final__portrait-name">{player.name}</span>
        {showRating ? (
          <JugadorRatingChip
            rating={rating.value}
            className="liga-gran-final__portrait-rating"
          />
        ) : null}
      </figcaption>
    </figure>
  );
};

function PairBlock({
  pair,
  role,
  highlight,
}: {
  pair: LigaGranFinalPair;
  role: "finalista" | "campeon" | "subcampeon";
  highlight: "winner" | "runner" | "equal";
}) {
  const label =
    role === "campeon"
      ? "Campeones"
      : role === "subcampeon"
        ? "Subcampeones"
        : "Finalistas";
  return (
    <div
      className={`liga-gran-final__pair${
        highlight === "winner"
          ? " liga-gran-final__pair--winner"
          : highlight === "runner"
            ? " liga-gran-final__pair--runner"
            : ""
      }`}
    >
      <p className="liga-gran-final__pair-label">{label}</p>
      <div className="liga-gran-final__portraits">
        <GranFinalPortrait player={pair.player1} />
        <GranFinalPortrait player={pair.player2} />
      </div>
    </div>
  );
}

function headerTitle(
  state: LigaGranFinalPresentationState,
  temporada: string | null
): React.ReactNode {
  if (state === "live") {
    return (
      <>
        Gran Final <span className="liga-gran-final__title-live">· En juego</span>
      </>
    );
  }
  if (state === "champions") {
    return <>Campeones{temporada ? ` · ${temporada}` : ""}</>;
  }
  return <>Gran Final</>;
}

/**
 * Presentación especial de Gran Final (pública).
 * Solo lectura: no escribe en Supabase ni altera lógica deportiva.
 */
export const LigaJornadaGranFinalPublica: React.FC<
  LigaJornadaGranFinalPublicaProps
> = ({
  ligaNombre,
  partido,
  side1,
  side2,
  esParejasFijas,
  fechaHorarioText,
}) => {
  const state = resolveLigaGranFinalPresentationState(partido, esParejasFijas);
  const winnerSide = partidoMatchWinnerSide(partido, esParejasFijas);
  const score = ligaGranFinalScoreLabel(partido, esParejasFijas);
  const subtitle = ligaGranFinalSubtitle(ligaNombre);
  const temporada = ligaTemporadaLabelFromNombre(ligaNombre);
  const canchaLabel =
    typeof partido.cancha === "number" ? `Cancha ${partido.cancha}` : null;
  const horario = fechaHorarioText?.trim() || null;

  const estadoLabel =
    state === "live"
      ? "En juego"
      : state === "champions"
        ? "Finalizada"
        : "Pendiente";

  const winnerPair =
    winnerSide === 1 ? side1 : winnerSide === 2 ? side2 : null;
  const runnerPair =
    winnerSide === 1 ? side2 : winnerSide === 2 ? side1 : null;

  return (
    <section
      className={`liga-gran-final liga-gran-final--${state}`}
      aria-label="Gran Final"
    >
      <header className="liga-gran-final__header">
        <p className="liga-gran-final__eyebrow">Riviera Open</p>
        <h2 className="liga-gran-final__title">
          {headerTitle(state, temporada)}
        </h2>
        <p className="liga-gran-final__subtitle">{subtitle}</p>

        {state === "pending" || state === "live" ? (
          <>
            <p className="liga-gran-final__congrats">
              ¡Felicidades a nuestros finalistas!
            </p>
            <p className="liga-gran-final__copy">
              El esfuerzo, la constancia y cada partido los trajeron hasta aquí.
              Dos parejas, un solo objetivo: convertirse en campeones.
            </p>
            <p className="liga-gran-final__tagline">
              Compite. Juega limpio. Vive Riviera Open.
            </p>
          </>
        ) : null}

        <ul className="liga-gran-final__meta">
          {canchaLabel ? (
            <li className="liga-gran-final__meta-dot">{canchaLabel}</li>
          ) : null}
          <li className="liga-gran-final__meta-dot">{estadoLabel}</li>
          {horario ? (
            <li className="liga-gran-final__meta-dot">{horario}</li>
          ) : null}
        </ul>
      </header>

      <div className="liga-gran-final__stage">
        <PairBlock
          pair={side1}
          role={
            state === "champions"
              ? winnerSide === 1
                ? "campeon"
                : "subcampeon"
              : "finalista"
          }
          highlight={
            state === "champions"
              ? winnerSide === 1
                ? "winner"
                : "runner"
              : "equal"
          }
        />

        <div className="liga-gran-final__vs" aria-hidden="true">
          <span className="liga-gran-final__vs-badge">VS</span>
          {score ? <p className="liga-gran-final__score">{score}</p> : null}
        </div>

        <PairBlock
          pair={side2}
          role={
            state === "champions"
              ? winnerSide === 2
                ? "campeon"
                : "subcampeon"
              : "finalista"
          }
          highlight={
            state === "champions"
              ? winnerSide === 2
                ? "winner"
                : "runner"
              : "equal"
          }
        />
      </div>

      {state === "champions" && winnerPair && runnerPair ? (
        <div className="liga-gran-final__result">
          <h3 className="liga-gran-final__result-title">
            Campeones{temporada ? ` · ${temporada}` : ""}
          </h3>
          <p className="liga-gran-final__result-pair">{winnerPair.pairName}</p>
          <p className="liga-gran-final__result-sub">
            Subcampeones · {runnerPair.pairName}
            {score ? ` · ${score}` : ""}
          </p>
          <p className="liga-gran-final__result-copy">
            ¡Felicidades a nuestros campeones! Una temporada de esfuerzo,
            constancia y grandes partidos que culmina con este título.
          </p>
        </div>
      ) : null}
    </section>
  );
};
