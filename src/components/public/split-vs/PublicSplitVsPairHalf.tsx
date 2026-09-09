import React from "react";
import { PublicSplitVsPlayerPanel } from "./PublicSplitVsPlayerPanel";

export type PublicSplitVsPairPlayer = {
  name: string;
  foto?: string | null;
};

export interface PublicSplitVsPairHalfProps {
  player1: PublicSplitVsPairPlayer;
  player2?: PublicSplitVsPairPlayer | null;
  label?: string;
  tone?: "win" | "loss" | "neutral";
  showWinnerBadge?: boolean;
  className?: string;
}

/** Mitad de pareja: 1–2 paneles Split VS lado a lado. */
export const PublicSplitVsPairHalf: React.FC<PublicSplitVsPairHalfProps> = ({
  player1,
  player2,
  label,
  tone = "neutral",
  showWinnerBadge = false,
  className,
}) => {
  const pairLabel =
    label ??
    (player2 ? `${player1.name} / ${player2.name}` : player1.name);

  return (
    <div
      className={[
        "pub-split-vs-pair",
        `pub-split-vs-pair--${tone}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={pairLabel}
    >
      {showWinnerBadge && tone === "win" ? (
        <span className="pub-split-vs-pair__badge" aria-label="Ganador">
          <span className="pub-split-vs-pair__badge-icon" aria-hidden>
            ♔
          </span>
        </span>
      ) : null}
      <div
        className={`pub-split-vs-pair__grid${
          player2 ? "" : " pub-split-vs-pair__grid--solo"
        }`}
      >
        <PublicSplitVsPlayerPanel name={player1.name} foto={player1.foto} />
        {player2 ? (
          <PublicSplitVsPlayerPanel name={player2.name} foto={player2.foto} />
        ) : null}
      </div>
    </div>
  );
};
