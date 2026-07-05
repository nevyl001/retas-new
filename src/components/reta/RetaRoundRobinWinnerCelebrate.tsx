import React, { useMemo } from "react";
import { PodiumCard } from "../torneo-express/public/PodiumCard";
import type { PublicRetaPairPlayer } from "../public/PublicRetaPairSide";
import type { PublicRetaWinnerAvatar } from "../public/PublicRetaWinnerSection";
import type { PublicEliminatoriaPodiumStats } from "../../lib/torneoExpress/publicEliminatoriaPodiumStats";
import {
  tournamentWinnerToPodiumStats,
  type TournamentWinner,
} from "../../lib/tournamentWinner";
import "./reta-rr-winner-celebrate.css";

const RR_WINNER_COPY = {
  badge: "GANADORES",
  title: "¡Ganadores!",
  rank: "1.er lugar",
  message:
    "Dejaron huella en cada partido. La cancha lo confirma: la reta es suya.",
};

function parsePairLabel(label: string): [string, string] {
  const parts = label.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
  return [parts[0] ?? "?", parts[1] ?? "?"];
}

function buildPairPlayersById(
  pairLabel: string,
  pairId: string | undefined,
  winners: PublicRetaWinnerAvatar[] | undefined,
  pairPlayers?: PublicRetaPairPlayer[]
): Record<string, PublicRetaPairPlayer[]> {
  const key = pairId ?? pairLabel;
  if (pairPlayers && pairPlayers.length >= 2) {
    return { [key]: pairPlayers };
  }

  const [name1, name2] = parsePairLabel(pairLabel);

  const players: PublicRetaPairPlayer[] = [
    winners?.[0]
      ? {
          id: winners[0].jugadorId ?? `${key}-1`,
          name: winners[0].name,
          fotoUrl: winners[0].fotoUrl,
          rating: winners[0].rating,
        }
      : { id: `${key}-1`, name: name1 },
    winners?.[1]
      ? {
          id: winners[1].jugadorId ?? `${key}-2`,
          name: winners[1].name,
          fotoUrl: winners[1].fotoUrl,
          rating: winners[1].rating,
        }
      : { id: `${key}-2`, name: name2 },
  ];

  return { [key]: players };
}

export const RetaRoundRobinWinnerCelebrate: React.FC<{
  pairLabel: string;
  pairId?: string;
  torneoNombre?: string;
  categoria?: string | null;
  rankLabel?: string;
  fraseMotivacional?: string;
  tournamentWinner?: TournamentWinner | null;
  podiumStats?: PublicEliminatoriaPodiumStats | null;
  /** Round robin sin remontada: muestra GAF/GEC como la tabla de clasificación. */
  statsLayout?: "default" | "round-robin";
  winners?: PublicRetaWinnerAvatar[];
  pairPlayers?: PublicRetaPairPlayer[];
  className?: string;
}> = ({
  pairLabel,
  pairId,
  torneoNombre,
  categoria = null,
  rankLabel,
  fraseMotivacional,
  tournamentWinner,
  podiumStats,
  statsLayout = "default",
  winners,
  pairPlayers,
  className = "",
}) => {
  const pairPlayersById = useMemo(
    () => buildPairPlayersById(pairLabel, pairId, winners, pairPlayers),
    [pairLabel, pairId, winners, pairPlayers]
  );

  const stats = useMemo(
    () =>
      podiumStats ??
      (tournamentWinner ? tournamentWinnerToPodiumStats(tournamentWinner) : null),
    [podiumStats, tournamentWinner]
  );

  const copyOverrides = useMemo(
    () => ({
      ...RR_WINNER_COPY,
      ...(rankLabel ? { rank: rankLabel } : {}),
      ...(fraseMotivacional ? { message: fraseMotivacional } : {}),
    }),
    [rankLabel, fraseMotivacional]
  );

  return (
    <div
      className={`reta-rr-celebrate ${className}`.trim()}
      aria-label="Ganadores de la reta Round Robin"
    >
      <PodiumCard
        id="reta-winner-celebrate"
        position={1}
        entry={{ label: pairLabel, parejaId: pairId ?? null }}
        categoria={categoria}
        torneoNombre={torneoNombre ?? ""}
        pairPlayersById={pairPlayersById}
        stats={stats}
        statsLayout={statsLayout}
        copyOverrides={copyOverrides}
        className="reta-rr-celebrate__podium"
      />
    </div>
  );
};

export default RetaRoundRobinWinnerCelebrate;
