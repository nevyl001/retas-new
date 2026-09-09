import React, { useEffect, useRef, useState } from "react";
import type { ParejaJornadaMatchLine } from "../../../lib/liga/jornadaStats";
import { formatSignedPoints } from "../../../lib/liga/jornadaStats";
import { LigaMotionValue } from "../LigaMotionValue";
import {
  isPhotographicSplitVsFoto,
  playerAvatarHashTone,
  splitPlayerDisplayName,
} from "./ligaJornadaMatchNames";

interface StandingsPhotoHalfProps {
  name: string;
  foto?: string | null;
  side: "left" | "right";
}

function playerInitials(name: string): string {
  const { primary, secondary } = splitPlayerDisplayName(name);
  return `${primary.charAt(0)}${
    secondary?.charAt(0) ?? primary.charAt(1) ?? ""
  }`.toUpperCase();
}

const StandingsPhotoHalf: React.FC<StandingsPhotoHalfProps> = ({
  name,
  foto,
  side,
}) => {
  const tone = playerAvatarHashTone(name);
  const { primary, secondary } = splitPlayerDisplayName(name);
  // Misma regla laxa que el Split VS temporal: cualquier URL de foto válida.
  const candidateFoto = isPhotographicSplitVsFoto(foto) ? foto!.trim() : null;
  const [photoFailed, setPhotoFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const showPhoto = Boolean(candidateFoto) && !photoFailed;

  useEffect(() => {
    setPhotoFailed(false);
  }, [candidateFoto]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !candidateFoto) return;
    if (img.complete && img.naturalWidth === 0) {
      setPhotoFailed(true);
    }
  }, [candidateFoto]);

  return (
    <div
      className={`liga-jornada-standings-row__photo-half liga-jornada-standings-row__photo-half--${side}${
        showPhoto ? " has-photo" : ""
      }`}
      style={
        {
          ["--liga-standings-bg" as string]: tone.background,
          ["--liga-standings-fg" as string]: tone.color,
        } as React.CSSProperties
      }
    >
      <span className="liga-jornada-standings-row__photo-texture" aria-hidden />
      <span
        className="liga-jornada-standings-row__photo-watermark"
        aria-hidden
      >
        {playerInitials(name)}
      </span>
      {candidateFoto && !photoFailed ? (
        <img
          ref={imgRef}
          className="liga-jornada-standings-row__photo-img is-visible"
          src={candidateFoto}
          alt=""
          loading="eager"
          decoding="async"
          onError={() => setPhotoFailed(true)}
        />
      ) : null}
      <span className="liga-jornada-standings-row__photo-scrim" aria-hidden />
      <span className="liga-jornada-standings-row__player-name">
        <span className="liga-jornada-standings-row__player-given">
          {primary}
        </span>
        {secondary ? (
          <span className="liga-jornada-standings-row__player-family">
            {secondary}
          </span>
        ) : null}
      </span>
    </div>
  );
};

export interface LigaJornadaStandingsRowProps {
  rankIndex: number;
  posicion: number;
  parejaId: string;
  name1: string;
  name2: string;
  foto1?: string | null;
  foto2?: string | null;
  puntos: number;
  victorias: number;
  derrotas: number;
  gamesFavor: number;
  gamesContra: number;
  matchLines: ParejaJornadaMatchLine[];
  rankingInView: boolean;
}

export const LigaJornadaStandingsRow: React.FC<LigaJornadaStandingsRowProps> = ({
  rankIndex,
  posicion,
  parejaId,
  name1,
  name2,
  foto1,
  foto2,
  puntos,
  victorias,
  derrotas,
  gamesFavor,
  gamesContra,
  matchLines,
  rankingInView,
}) => {
  const gamesDif = gamesFavor - gamesContra;
  const gamesDifLabel = gamesDif >= 0 ? `+${gamesDif}` : String(gamesDif);
  const podium =
    posicion === 1 || posicion === 2 || posicion === 3
      ? (posicion as 1 | 2 | 3)
      : undefined;
  const topClass =
    posicion === 1
      ? " liga-pub-standings__row--1"
      : posicion === 2
        ? " liga-pub-standings__row--2"
        : posicion === 3
          ? " liga-pub-standings__row--3"
          : "";

  return (
    <li
      data-flip-key={parejaId}
      className={`liga-pub-standings__row liga-jornada-standings-row${topClass}${
        rankingInView ? " is-revealing" : ""
      }`}
      style={
        {
          ["--liga-rank-i" as string]: rankIndex,
        } as React.CSSProperties
      }
    >
      <div className="liga-jornada-standings-row__faces">
        <div className="liga-jornada-standings-row__photos" aria-hidden={false}>
          <StandingsPhotoHalf name={name1} foto={foto1} side="left" />
          <StandingsPhotoHalf name={name2} foto={foto2} side="right" />
        </div>

        <div
          className="liga-jornada-standings-row__badge liga-jornada-standings-row__badge--pos"
          aria-label={`Posición ${posicion}`}
        >
          {podium === 1 ? (
            <span className="liga-pub-standings__medal" aria-hidden>
              🥇
            </span>
          ) : podium === 2 ? (
            <span className="liga-pub-standings__medal" aria-hidden>
              🥈
            </span>
          ) : podium === 3 ? (
            <span className="liga-pub-standings__medal" aria-hidden>
              🥉
            </span>
          ) : (
            <>
              <span className="liga-pub-standings__pos-num">
                <LigaMotionValue morphKey={posicion} value={posicion} />
              </span>
              <span className="liga-pub-standings__pos-suffix">°</span>
            </>
          )}
        </div>

        <div className="liga-jornada-standings-row__badge liga-jornada-standings-row__badge--pts">
          <span className="liga-pub-standings__pts">
            <LigaMotionValue morphKey={puntos} value={puntos} />
          </span>
          <span className="liga-pub-standings__pts-label">pts</span>
        </div>
      </div>

      <div className="liga-jornada-standings-row__summary">
        <div className="liga-jornada-standings-row__stats">
          <span className="liga-jornada-standings-row__stat">
            <LigaMotionValue
              morphKey={`${victorias}-${derrotas}`}
              value={`${victorias} PG · ${derrotas} PP`}
            />
          </span>
          <span
            className="liga-jornada-standings-row__stat liga-jornada-standings-row__stat--dif"
            aria-label={`Diferencia de games ${gamesDifLabel}`}
          >
            <LigaMotionValue
              morphKey={`${gamesFavor}-${gamesContra}`}
              value={`${gamesFavor} GF · ${gamesContra} GC · DIF ${gamesDifLabel}`}
            />
          </span>
        </div>

        {matchLines.length > 0 ? (
          <ul
            className="liga-jornada-standings-row__matches"
            aria-label="Desglose de puntos por partido"
          >
            {matchLines.map((line, lineIndex) => (
              <li
                key={line.partidoId}
                className="liga-jornada-standings-row__match"
                style={
                  {
                    ["--liga-line-i" as string]: lineIndex,
                  } as React.CSSProperties
                }
              >
                {line.opponentLabel ? (
                  <span className="liga-jornada-standings-row__match-vs">
                    vs {line.opponentLabel}
                  </span>
                ) : (
                  <span className="liga-jornada-standings-row__match-vs">
                    Partido
                  </span>
                )}
                <span className="liga-jornada-standings-row__match-score">
                  {line.scoreLabel}
                </span>
                <span
                  className={`liga-jornada-standings-row__match-pts${
                    line.points > 0
                      ? " liga-jornada-standings-row__match-pts--pos"
                      : line.points < 0
                        ? " liga-jornada-standings-row__match-pts--neg"
                        : " liga-jornada-standings-row__match-pts--zero"
                  }`}
                  aria-label={`${formatSignedPoints(line.points)} puntos`}
                >
                  {formatSignedPoints(line.points)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
};
