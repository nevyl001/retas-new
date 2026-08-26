import React, { useMemo } from "react";
import { getLigaVictoriaCelebrateMessage, useBranding } from "../../club-experience";
import { PodiumCard } from "../torneo-express/public/PodiumCard";
import type { PublicRetaPairPlayer } from "../public/PublicRetaPairSide";
import type { PublicRetaWinnerAvatar } from "../public/PublicRetaWinnerSection";
import type { PublicEliminatoriaPodiumStats } from "../../lib/torneoExpress/publicEliminatoriaPodiumStats";
import "./liga-pareja-victoria-celebrate.css";

function parsePairLabel(label: string): [string, string] {
  const parts = label.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
  return [parts[0] ?? "?", parts[1] ?? "?"];
}

function jornadaOrdinalLabel(numero: number): string {
  const labels: Record<number, string> = {
    1: "Primera jornada",
    2: "Segunda jornada",
    3: "Tercera jornada",
    4: "Cuarta jornada",
    5: "Quinta jornada",
    6: "Sexta jornada",
    7: "Séptima jornada",
    8: "Octava jornada",
    9: "Novena jornada",
    10: "Décima jornada",
  };
  return labels[numero] ?? `Jornada ${numero}`;
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
  jornadaNumero?: number;
  rankLabel?: string;
  stats: PublicEliminatoriaPodiumStats;
  winners?: PublicRetaWinnerAvatar[];
}> = ({
  pairId,
  pairLabel,
  torneoNombre,
  jornadaNumero,
  rankLabel,
  stats,
  winners,
}) => {
  const { nombre: organizerName } = useBranding();
  const pairPlayersById = useMemo(
    () => buildPairPlayersById(pairLabel, pairId, winners),
    [pairLabel, pairId, winners]
  );

  const headline = useMemo(() => {
    const jornadaPart =
      jornadaNumero != null
        ? jornadaOrdinalLabel(jornadaNumero)
        : "Jornada";
    const club = (organizerName || "").trim() || "Riviera Open";
    return `Ganadores · ${jornadaPart} · ${club} by Riviera Open`;
  }, [jornadaNumero, organizerName]);

  const copyOverrides = useMemo(
    () => ({
      badge: "1.ER LUGAR",
      title: "¡Felicidades!",
      message: getLigaVictoriaCelebrateMessage(organizerName),
      ...(rankLabel ? { rank: rankLabel } : {}),
    }),
    [organizerName, rankLabel]
  );

  return (
    <PodiumCard
      position={1}
      entry={{ label: pairLabel, parejaId: pairId }}
      categoria={null}
      torneoNombre={headline || torneoNombre}
      pairPlayersById={pairPlayersById}
      stats={stats}
      copyOverrides={copyOverrides}
      className="liga-pareja-victoria-celebrate__podium"
    />
  );
};
