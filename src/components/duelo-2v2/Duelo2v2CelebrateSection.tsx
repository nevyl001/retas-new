import React, { useState } from "react";
import {
  getDueloLoserCelebrateMessage,
  getDueloWinnerCelebrateMessage,
  getOrganizerCelebrateParticipantesNote,
  shouldShowMotherAttribution,
  useBranding,
} from "../../club-experience";
import { computeDueloScore } from "../../lib/duelo2v2/scoring";
import { createDuelo2v2SharePresentation } from "../../lib/duelo2v2/duelo2v2SharePresentation";
import { shareDuelo2v2Image } from "../../lib/duelo2v2/shareDuelo2v2Image";
import type { Duelo2v2SetDetalle } from "../../lib/duelo2v2/types";
import type { RatingMovimientoPartido } from "../../lib/rivieraJugadores/types";
import type { PublicRetaWinnerAvatar } from "../public/PublicRetaWinnerSection";
import { Duelo2v2ShareCard } from "./Duelo2v2ShareCard";

interface Duelo2v2CelebrateSectionProps {
  teamAName: string;
  teamBName: string;
  teamA: PublicRetaWinnerAvatar[];
  teamB: PublicRetaWinnerAvatar[];
  ganador: "a" | "b";
  setsA: number;
  setsB: number;
  detalle: Duelo2v2SetDetalle[];
  torneoNombre: string;
  finalizado: boolean;
  ratingByJugadorId?: Record<string, RatingMovimientoPartido>;
}

function enrichPlayers(
  players: PublicRetaWinnerAvatar[],
  ratingByJugadorId?: Record<string, RatingMovimientoPartido>,
): PublicRetaWinnerAvatar[] {
  return players.map((player) => ({
    ...player,
    rating:
      player.jugadorId && ratingByJugadorId?.[player.jugadorId]
        ? ratingByJugadorId[player.jugadorId].ratingDespues
        : player.rating,
  }));
}

export const Duelo2v2CelebrateSection: React.FC<Duelo2v2CelebrateSectionProps> = ({
  teamAName,
  teamBName,
  teamA,
  teamB,
  ganador,
  setsA,
  setsB,
  detalle,
  torneoNombre,
  finalizado,
  ratingByJugadorId,
}) => {
  const { nombre: organizerName, logoUrl, isClubBranded } = useBranding();
  const summary = computeDueloScore(detalle);
  const ganadorA = ganador === "a";
  const hasRating = Boolean(
    ratingByJugadorId && Object.keys(ratingByJugadorId).length > 0
  );

  const winners = enrichPlayers(ganadorA ? teamA : teamB, ratingByJugadorId);
  const losers = enrichPlayers(ganadorA ? teamB : teamA, ratingByJugadorId);
  const winnersName = ganadorA ? teamAName : teamBName;
  const losersName = ganadorA ? teamBName : teamAName;
  const setsWin = ganadorA ? setsA : setsB;
  const setsLoss = ganadorA ? setsB : setsA;
  const gamesWin = ganadorA ? summary.gamesTotalA : summary.gamesTotalB;
  const gamesLoss = ganadorA ? summary.gamesTotalB : summary.gamesTotalA;

  const winnerMessage = getDueloWinnerCelebrateMessage(
    finalizado,
    hasRating,
    organizerName
  );

  const loserMessage = getDueloLoserCelebrateMessage(
    finalizado,
    hasRating,
    organizerName
  );

  const shareBase = {
    detalle,
    setOutcomes: summary.setOutcomes,
    dueloNombre: torneoNombre,
    clubName: organizerName,
    clubLogoUrl: logoUrl,
    showMotherAttribution: shouldShowMotherAttribution(
      organizerName,
      isClubBranded,
    ),
  };

  const winnerPresentation = createDuelo2v2SharePresentation({
    place: "winner",
    teamName: winnersName,
    players: winners,
    setsWin,
    setsLoss,
    gamesWin,
    gamesLoss,
    message: winnerMessage,
    ...shareBase,
  });

  const runnerUpPresentation = createDuelo2v2SharePresentation({
    place: "runner-up",
    teamName: losersName,
    players: losers,
    setsWin: setsLoss,
    setsLoss: setsWin,
    gamesWin: gamesLoss,
    gamesLoss: gamesWin,
    message: loserMessage,
    ...shareBase,
  });

  const [sharingPlace, setSharingPlace] = useState<"winner" | "runner-up" | null>(
    null
  );

  const share = async (place: "winner" | "runner-up") => {
    if (sharingPlace) return;
    setSharingPlace(place);
    try {
      await shareDuelo2v2Image(
        place === "winner" ? winnerPresentation : runnerUpPresentation
      );
    } finally {
      setSharingPlace(null);
    }
  };

  return (
    <section
      className="duelo2v2-celebrate duelo2v2-celebrate--stories te-pub-fade-in"
      aria-label="Piezas de celebración del duelo 2 vs 2"
    >
      <div className="duelo2v2-celebrate__story-gallery">
        <Duelo2v2ShareCard presentation={winnerPresentation} />
        <Duelo2v2ShareCard presentation={runnerUpPresentation} />
      </div>

      <div className="duelo2v2-celebrate__share-toolbar" aria-label="Acciones de imagen">
        <button
          type="button"
          className="duelo2v2-celebrate__share-link"
          onClick={() => void share("winner")}
          disabled={sharingPlace !== null}
          aria-busy={sharingPlace === "winner"}
        >
          {sharingPlace === "winner" ? "Preparando imagen…" : "Descargar ganadores"}
        </button>
        <button
          type="button"
          className="duelo2v2-celebrate__share-link"
          onClick={() => void share("runner-up")}
          disabled={sharingPlace !== null}
          aria-busy={sharingPlace === "runner-up"}
        >
          {sharingPlace === "runner-up" ? "Preparando imagen…" : "Descargar 2.º lugar"}
        </button>
      </div>

      <p className="duelo2v2-celebrate__participantes-note">
        {getOrganizerCelebrateParticipantesNote(organizerName)}
      </p>
    </section>
  );
};
