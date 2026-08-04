import React from "react";
import type { Pair } from "../../lib/database";
import { Card, Input } from "../ui";
import "./DynamicLineupsConfigCard.css";

/** Sin config reutilizable de "minutos por ronda" en el proyecto — default documentado (mismo valor que usan los ejemplos del spec). */
const DEFAULT_MINUTES_PER_ROUND = 30;

function formatDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) return "—";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hora${hours === 1 ? "" : "s"}`;
  return `${hours}h ${minutes}min`;
}

interface TeamPreview {
  teamIndex: number;
  name: string;
  pairs: Pair[];
}

interface DynamicLineupsConfigCardProps {
  eligible: boolean;
  ineligibleReason?: string;
  /** Parejas originales por equipo (ambos equipos tienen la misma cantidad); indefinido si no es elegible. */
  pairsPerTeam?: number;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  totalRounds: number;
  onTotalRoundsChange: (next: number) => void;
  teamA: TeamPreview | null;
  teamB: TeamPreview | null;
  disabled?: boolean;
}

export const DynamicLineupsConfigCard: React.FC<DynamicLineupsConfigCardProps> = ({
  eligible,
  ineligibleReason,
  pairsPerTeam,
  enabled,
  onToggle,
  totalRounds,
  onTotalRoundsChange,
  teamA,
  teamB,
  disabled = false,
}) => {
  const minRounds = pairsPerTeam ?? 2;
  const roundsValid = totalRounds >= minRounds;
  const dynamicRounds = roundsValid ? Math.max(0, totalRounds - minRounds) : 0;
  const estimatedMinutes = roundsValid ? totalRounds * DEFAULT_MINUTES_PER_ROUND : 0;

  return (
    <Card variant="elevated" className="dynamic-lineups-card">
      <label className="dynamic-lineups-card__toggle">
        <input
          type="checkbox"
          checked={enabled && eligible}
          disabled={disabled || !eligible}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span>Activar alineación dinámica</span>
      </label>
      <p className="dynamic-lineups-card__hint">
        Las parejas cambian dentro de cada equipo después de completar el
        Round Robin inicial. El sistema forma nuevas alineaciones balanceadas
        según el rendimiento de los jugadores.
      </p>

      {!eligible ? (
        <p className="dynamic-lineups-card__ineligible" role="note">
          {ineligibleReason ??
            "Disponible solo con 2 equipos completos, con la misma cantidad de parejas (2 o más) cada uno."}
        </p>
      ) : null}

      {eligible && enabled ? (
        <div className="dynamic-lineups-card__config">
          <Input
            type="number"
            label="Número total de rondas"
            min={minRounds}
            value={totalRounds}
            disabled={disabled}
            error={
              !roundsValid
                ? `Se necesitan al menos ${minRounds} rondas para que todas las parejas originales enfrenten a todas las parejas del equipo rival.`
                : undefined
            }
            onChange={(e) => onTotalRoundsChange(parseInt(e.target.value || "0", 10))}
          />
          {roundsValid ? (
            <>
              <p className="dynamic-lineups-card__summary">
                {minRounds} pareja{minRounds === 1 ? "" : "s"} por equipo ·{" "}
                {minRounds} ronda{minRounds === 1 ? "" : "s"} de Round Robin
                inicial ·{" "}
                {dynamicRounds > 0
                  ? `${dynamicRounds} ronda${dynamicRounds === 1 ? "" : "s"} dinámica${dynamicRounds === 1 ? "" : "s"}`
                  : "sin rondas dinámicas"}{" "}
                · duración estimada: {formatDuration(estimatedMinutes)}
              </p>
              <p className="dynamic-lineups-card__contextual-help">
                {dynamicRounds > 0
                  ? "Al completar el Round Robin entre las parejas originales de ambos equipos, el sistema reorganizará a los jugadores dentro de su propio equipo y generará la siguiente ronda, una por una."
                  : "Con este número de rondas se juega únicamente el Round Robin inicial entre las parejas originales — no habrá rotación."}
              </p>
            </>
          ) : null}

          {teamA && teamB ? (
            <div className="dynamic-lineups-card__initial-pairs">
              <p className="riviera-label">Parejas originales (Round Robin inicial)</p>
              {[teamA, teamB].map((team) => (
                <div key={team.teamIndex} className="dynamic-lineups-card__team-block">
                  <span className="dynamic-lineups-card__team-name">{team.name}</span>
                  <ul>
                    {team.pairs.map((p) => (
                      <li key={p.id}>
                        {p.player1_name} / {p.player2_name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
};

export default DynamicLineupsConfigCard;
