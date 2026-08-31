import React from "react";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import "../jugadores/riviera-jugadores.css";

interface PublicAmericanoPodiumCardProps {
  rank: 1 | 2 | 3;
  name: string;
  fotoUrl?: string | null;
  animationDelay?: string;
}

const RANK_META: Record<
  1 | 2 | 3,
  { place: string; medal: string; cardClass: string; avatarSize: "md" | "lg" }
> = {
  1: {
    place: "1er lugar",
    medal: "1",
    cardClass: "te-public-podium__card--gold",
    avatarSize: "lg",
  },
  2: {
    place: "2do lugar",
    medal: "2",
    cardClass: "te-public-podium__card--silver",
    avatarSize: "md",
  },
  3: {
    place: "3er lugar",
    medal: "3",
    cardClass: "te-public-podium__card--bronze",
    avatarSize: "md",
  },
};

export const PublicAmericanoPodiumCard: React.FC<
  PublicAmericanoPodiumCardProps
> = ({ rank, name, fotoUrl, animationDelay }) => {
  const meta = RANK_META[rank];
  return (
    <article
      data-rank={rank}
      className={`te-public-podium__card ${meta.cardClass} te-pub-fade-in-up`}
      style={animationDelay ? { animationDelay } : undefined}
    >
      <span className="te-public-podium__medal" aria-hidden>
        {meta.medal}
      </span>
      <div className="te-public-podium__avatar">
        <JugadorAvatar
          fotoUrl={fotoUrl}
          nombre={name}
          size={meta.avatarSize}
          className="te-public-podium__avatar-img"
        />
      </div>
      <span className="te-public-podium__place">{meta.place}</span>
      <span className="te-public-podium__name" title={name}>
        {name}
      </span>
    </article>
  );
};
