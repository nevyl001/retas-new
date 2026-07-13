import React, { useEffect, useState } from "react";
import {
  getRegistryEmptyMessage,
  getRegistrySectionLabel,
  useBranding,
} from "../../club-experience";
import type { AmericanoPlayer } from "../../lib/db/types";
import type { Player } from "../../lib/database";
import "./PlayerRegistration.css";

interface PlayerRegistrationProps {
  players: AmericanoPlayer[];
  availablePlayers: Player[];
  onRemovePlayer: (id: string) => void;
  onToggleExistingPlayer: (player: Player) => void;
  onStartTournament: (totalRounds: number, courts: number) => void;
  /** Canchas ya definidas al crear la reta (QuickStart / DB). */
  initialCourts?: number;
}

export const PlayerRegistration: React.FC<PlayerRegistrationProps> = ({
  players,
  availablePlayers,
  onRemovePlayer,
  onToggleExistingPlayer,
  onStartTournament,
  initialCourts = 1,
}) => {
  const [totalRounds, setTotalRounds] = useState(3);
  const [courts, setCourts] = useState(() =>
    Math.min(20, Math.max(1, Math.floor(initialCourts) || 1))
  );
  const { nombre: organizerName } = useBranding();
  const registryTitle = getRegistrySectionLabel(organizerName);

  // Cuando llega el valor de DB (async), alinear el input si el usuario no lo cambió.
  useEffect(() => {
    const next = Math.min(20, Math.max(1, Math.floor(initialCourts) || 1));
    setCourts(next);
  }, [initialCourts]);

  const maxMatches = Math.min(Math.floor(players.length / 4), courts);
  const benchPerRound = Math.max(0, players.length - maxMatches * 4);

  return (
    <section className="americano-registration">
      <p className="americano-registration__format-note" role="note">
        Formato americano equilibrado: las parejas se rotan automáticamente para
        evitar repetir compañero y repartir rivales. El ranking solo muestra
        posiciones; no forma partidos.
      </p>

      <div className="americano-registration__meta card">
        <p>
          <strong>Total jugadores:</strong> {players.length}
        </p>
        <p>
          <strong>Partidos por ronda:</strong> {maxMatches}
        </p>
        <p>
          <strong>Descansan por ronda:</strong> {benchPerRound}
        </p>
      </div>

      <div className="card">
        <h4>Jugadores seleccionados</h4>
        <ul className="americano-registration__list">
          {players.length === 0 ? (
            <li className="americano-registration__empty">Aun no has seleccionado jugadores.</li>
          ) : (
            players.map((player) => (
              <li key={player.id}>
                <span>{player.name}</span>
                <button
                  className="americano-btn americano-btn--danger"
                  onClick={() => onRemovePlayer(player.id)}
                >
                  Quitar
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="americano-registration__db card">
        <h4>{registryTitle}</h4>
        <p className="americano-registration__hint">
          Toca un jugador para seleccionarlo o deseleccionarlo.
        </p>
        {availablePlayers.length === 0 ? (
          <p className="americano-registration__empty">
            {getRegistryEmptyMessage(organizerName)}
          </p>
        ) : null}
        <div className="americano-registration__db-grid">
          {availablePlayers.map((player) => {
            const selected = players.some((p) => p.id === player.id);
            return (
              <button
                type="button"
                key={player.id}
                className={`americano-registration__db-item${
                  selected ? " selected" : ""
                }`}
                onClick={() => onToggleExistingPlayer(player)}
              >
                {selected ? "✓ " : ""}{player.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="americano-registration__start card">
        <div className="americano-registration__start-row">
          <label>
            Rondas:
            <input
              type="number"
              min={1}
              value={totalRounds}
              onChange={(e) =>
                setTotalRounds(Math.max(1, Number(e.target.value) || 1))
              }
            />
          </label>
          <label>
            Canchas:
            <input
              type="number"
              min={1}
              max={20}
              value={courts}
              onChange={(e) =>
                setCourts(Math.min(20, Math.max(1, Number(e.target.value) || 1)))
              }
            />
          </label>
        </div>
        <p className="americano-registration__courts-hint">
          Solo hay tantos partidos simultáneos como canchas. Con 1 cancha juega
          un partido y el resto descansa; con 2 canchas, dos partidos (Cancha 1 y
          2), y así sucesivamente. Las canchas rotan entre rondas.
        </p>
        <button
          className="americano-btn americano-btn--primary americano-registration__start-btn"
          onClick={() => onStartTournament(totalRounds, courts)}
          disabled={players.length < 4}
        >
          Iniciar torneo
        </button>
      </div>
    </section>
  );
};
