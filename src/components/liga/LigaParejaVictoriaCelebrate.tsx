import React, { useMemo } from "react";
import { useBranding } from "../../club-experience";
import {
  buildLigaCampeonatoCelebrateCopy,
  buildLigaCampeonatoCelebrateHeadline,
  type LigaCelebratePlacement,
} from "../../lib/liga/jornadaCelebrate";
import {
  formatSignedPoints,
  type ParejaJornadaMatchLine,
} from "../../lib/liga/jornadaStats";
import { PodiumCard } from "../torneo-express/public/PodiumCard";
import type { PublicRetaPairPlayer } from "../public/PublicRetaPairSide";
import type { PublicRetaWinnerAvatar } from "../public/PublicRetaWinnerSection";
import type { PublicEliminatoriaPodiumStats } from "../../lib/torneoExpress/publicEliminatoriaPodiumStats";
import { LigaParejaVictoriaCelebrateDesktop } from "./LigaParejaVictoriaCelebrateDesktop";
import "./liga-pareja-victoria-celebrate.css";
import "./liga-pareja-victoria-celebrate-desktop.css";

function parsePairLabel(label: string): [string, string] {
  const parts = label.split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
  return [parts[0] ?? "?", parts[1] ?? "?"];
}

function shortOpponent(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length <= 34) return trimmed;
  return `${trimmed.slice(0, 32)}…`;
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
  matchLines?: ParejaJornadaMatchLine[];
  stats: PublicEliminatoriaPodiumStats;
  winners?: PublicRetaWinnerAvatar[];
  /** Campeonato de liga (Gran Final / última jornada) vs ganador de jornada. */
  placement?: LigaCelebratePlacement | "jornada";
}> = ({
  pairId,
  pairLabel,
  torneoNombre,
  jornadaNumero,
  matchLines = [],
  stats,
  winners,
  placement = "jornada",
}) => {
  const { nombre: organizerName } = useBranding();
  const pairPlayersById = useMemo(
    () => buildPairPlayersById(pairLabel, pairId, winners),
    [pairLabel, pairId, winners]
  );
  const isLigaFinal =
    placement === "campeones" || placement === "subcampeones";
  const podiumPosition = placement === "subcampeones" ? 2 : 1;

  const headline = useMemo(() => {
    const liga =
      (torneoNombre || "").trim() ||
      (organizerName || "").trim() ||
      "Riviera Open";
    if (isLigaFinal) {
      return buildLigaCampeonatoCelebrateHeadline(
        liga,
        placement as LigaCelebratePlacement
      );
    }
    if (jornadaNumero != null && Number.isFinite(jornadaNumero)) {
      return `Ganadores · Jornada ${jornadaNumero} · ${liga}`;
    }
    return `Ganadores · ${liga}`;
  }, [isLigaFinal, placement, jornadaNumero, torneoNombre, organizerName]);

  const copyOverrides = useMemo(() => {
    if (isLigaFinal) {
      return buildLigaCampeonatoCelebrateCopy(
        (torneoNombre || "").trim() ||
          (organizerName || "").trim() ||
          "Riviera Open",
        placement as LigaCelebratePlacement
      );
    }
    const rankLine =
      matchLines.length > 0
        ? `${matchLines.length} enfrentamiento${
            matchLines.length === 1 ? "" : "s"
          } · ${stats.victorias} PG · DIF ${
            stats.dif >= 0 ? `+${stats.dif}` : String(stats.dif)
          }`
        : undefined;
    return {
      badge: "1.ER LUGAR",
      title: "¡Felicidades!",
      message: "",
      ...(rankLine ? { rank: rankLine } : {}),
    };
  }, [
    isLigaFinal,
    placement,
    torneoNombre,
    organizerName,
    matchLines.length,
    stats.victorias,
    stats.dif,
  ]);

  const criteriaNote = (
    <p className="liga-celebrate-shell__criteria">
      {isLigaFinal
        ? "Resumen de toda la liga · puntos → diferencia → partidos ganados"
        : "Criterio de victoria · games acumulados → diferencia → partidos ganados"}
    </p>
  );

  const players = useMemo(
    () => pairPlayersById[pairId] ?? [],
    [pairPlayersById, pairId]
  );

  const ambient = (
    <div className="liga-celebrate-ambient">
      <span className="liga-celebrate-ball liga-celebrate-ball--a" />
      <span className="liga-celebrate-ball liga-celebrate-ball--b" />
      <span className="liga-celebrate-ball liga-celebrate-ball--c" />
    </div>
  );

  const matchesBlock =
    !isLigaFinal && matchLines.length > 0 ? (
      <div
        className="liga-celebrate-matches"
        aria-label="Resultados contra rivales"
      >
        <p className="liga-celebrate-matches__title">Enfrentamientos</p>
        <ul className="liga-celebrate-matches__list">
          {matchLines.map((line) => (
            <li key={line.partidoId} className="liga-celebrate-matches__row">
              <div className="liga-celebrate-matches__rival">
                <span className="liga-celebrate-matches__vs">vs</span>
                <span
                  className="liga-celebrate-matches__name"
                  title={line.opponentLabel}
                >
                  {shortOpponent(line.opponentLabel ?? "Rival")}
                </span>
                {line.cancha != null ? (
                  <span className="liga-celebrate-matches__cancha">
                    C{line.cancha}
                  </span>
                ) : null}
              </div>
              <div className="liga-celebrate-matches__result">
                <span className="liga-celebrate-matches__score">
                  {line.scoreLabel}
                </span>
                <span className="liga-celebrate-matches__pts">
                  {formatSignedPoints(line.points)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div
      className={`liga-celebrate-shell${
        isLigaFinal ? ` liga-celebrate-shell--${placement}` : ""
      }`}
    >
      {criteriaNote}
      <div className="liga-celebrate-shell__mobile">
        <PodiumCard
          position={podiumPosition}
          entry={{ label: pairLabel, parejaId: pairId }}
          categoria={null}
          torneoNombre={headline || torneoNombre}
          pairPlayersById={pairPlayersById}
          stats={stats}
          statsLayout="liga-jornada"
          photoFormat="panel"
          copyOverrides={copyOverrides}
          className="liga-pareja-victoria-celebrate__podium"
          ambient={ambient}
          afterStats={matchesBlock}
        />
      </div>
      <div className="liga-celebrate-shell__desktop">
        <LigaParejaVictoriaCelebrateDesktop
          headline={headline || torneoNombre}
          copy={copyOverrides}
          players={players as PublicRetaPairPlayer[]}
          stats={stats}
          matchLines={isLigaFinal ? [] : matchLines}
          ambient={ambient}
          statsLabel={
            isLigaFinal ? "Resumen de toda la liga" : "Resumen de jornada"
          }
        />
      </div>
    </div>
  );
};
