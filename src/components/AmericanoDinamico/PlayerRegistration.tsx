import React, { useState } from "react";
import type { AmericanoPlayer } from "../../lib/db/types";
import type { Player } from "../../lib/database";
import "./PlayerRegistration.css";

interface PlayerRegistrationProps {
  players: AmericanoPlayer[];
  availablePlayers: Player[];
  onRemovePlayer: (id: string) => void;
  onToggleExistingPlayer: (player: Player) => void;
  onStartTournament: (totalRounds: number, courts: number) => void;
}

export const PlayerRegistration: React.FC<PlayerRegistrationProps> = ({
  players,
  availablePlayers,
  onRemovePlayer,
  onToggleExistingPlayer,
  onStartTournament,
}) => {
  const [totalRounds, setTotalRounds] = useState(3);
  const [courts, setCourts] = useState(1);

  const benchPerRound = players.length % 4 !== 0 ? players.length % 4 : 0;

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
        <h4>Registro Riviera Open</h4>
        <p className="americano-registration__hint">
          Toca un jugador para seleccionarlo o deseleccionarlo.
        </p>
        {availablePlayers.length === 0 ? (
          <p className="americano-registration__empty">
            No hay jugadores en el registro. Créalos en Registro Riviera Open.
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
          Las canchas rotan cada ronda para repartir mejor los partidos.
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
