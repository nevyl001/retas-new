import React, { useMemo } from "react";
import { PodiumCard } from "../torneo-express/public/PodiumCard";
import type { PublicRetaPairPlayer } from "../public/PublicRetaPairSide";
import type { PublicRetaWinnerAvatar } from "../public/PublicRetaWinnerSection";
import type { PublicEliminatoriaPodiumStats } from "../../lib/torneoExpress/publicEliminatoriaPodiumStats";
import "./liga-pareja-victoria-celebrate.css";

const VICTORIA_COPY = {
  badge: "VICTORIA",
  title: "¡Felicidades!",
  message:
    "Dejaron todo en la cancha. Así se compite en Riviera Open.",
};

function parsePairLabel(label: string): [string, string] {
  const parts = label.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
  return [parts[0] ?? "?", parts[1] ?? "?"];
}

function buildPairPlayersById(
  pairLabel: string,
  pairId: string,
  winners: PublicRetaWinnerAvatar[] | undefined
): Record<string, PublicRetaPairPlayer[]> {
  const [name1, name2] = parsePairLabel(pairLabel);

  const players: PublicRetaPairPlayer[] = [
    winners?.[0]
      ? {
          id: winners[0].jugadorId ?? `${pairId}-1`,
          name: winners[0].name,
          fotoUrl: winners[0].fotoUrl,
        }
      : { id: `${pairId}-1`, name: name1 },
    winners?.[1]
      ? {
          id: winners[1].jugadorId ?? `${pairId}-2`,
          name: winners[1].name,
          fotoUrl: winners[1].fotoUrl,
        }
      : { id: `${pairId}-2`, name: name2 },
  ];

  return { [pairId]: players };
}

export const LigaParejaVictoriaCelebrate: React.FC<{
  pairId: string;
  pairLabel: string;
  torneoNombre: string;
  rankLabel?: string;
  stats: PublicEliminatoriaPodiumStats;
  winners?: PublicRetaWinnerAvatar[];
}> = ({
  pairId,
  pairLabel,
  torneoNombre,
  rankLabel,
  stats,
  winners,
}) => {
  const pairPlayersById = useMemo(
    () => buildPairPlayersById(pairLabel, pairId, winners),
    [pairLabel, pairId, winners]
  );

  const copyOverrides = useMemo(
    () => ({
      ...VICTORIA_COPY,
      ...(rankLabel ? { rank: rankLabel } : {}),
    }),
    [rankLabel]
  );

  return (
    <PodiumCard
      position={1}
      entry={{ label: pairLabel, parejaId: pairId }}
      categoria={null}
      torneoNombre={torneoNombre}
      pairPlayersById={pairPlayersById}
      stats={stats}
      copyOverrides={copyOverrides}
      className="liga-pareja-victoria-celebrate__podium"
    />
  );
};
