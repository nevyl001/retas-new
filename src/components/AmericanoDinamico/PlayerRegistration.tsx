import React, { useEffect, useState } from "react";
import {
  getRegistryEmptyMessage,
  getRegistrySectionLabel,
  useBranding,
} from "../../club-experience";
import type { AmericanoPlayer } from "../../lib/db/types";
import type { Player } from "../../lib/database";
import {
  QuickModeAccordion,
  QuickModeAccordionItem,
  QuickModeHero,
  QuickModePrimaryCta,
} from "../platform/quickMode";
import "./PlayerRegistration.css";

interface PlayerRegistrationProps {
  players: AmericanoPlayer[];
  availablePlayers: Player[];
  onRemovePlayer: (id: string) => void;
  onToggleExistingPlayer: (player: Player) => void;
  onStartTournament: (totalRounds: number, courts: number) => void;
  /** Canchas ya definidas al crear la reta (QuickStart / DB). */
  initialCourts?: number;
  convocatoriaSlot?: React.ReactNode;
  eventTitle?: string;
  eventSubtitle?: string | null;
  eyebrow?: string | null;
}

export const PlayerRegistration: React.FC<PlayerRegistrationProps> = ({
  players,
  availablePlayers,
  onRemovePlayer,
  onToggleExistingPlayer,
  onStartTournament,
  initialCourts = 1,
  convocatoriaSlot,
  eventTitle = "Americano",
  eventSubtitle = "Parejas rotativas y ranking por puntos. Prepara el registro e inicia.",
  eyebrow,
}) => {
  const [totalRounds, setTotalRounds] = useState(3);
  const [courts, setCourts] = useState(() =>
    Math.min(20, Math.max(1, Math.floor(initialCourts) || 1))
  );
  const { nombre: organizerName } = useBranding();
  const registryTitle = getRegistrySectionLabel(organizerName);

  useEffect(() => {
    const next = Math.min(20, Math.max(1, Math.floor(initialCourts) || 1));
    setCourts(next);
  }, [initialCourts]);

  const maxMatches = Math.min(Math.floor(players.length / 4), courts);
  const benchPerRound = Math.max(0, players.length - maxMatches * 4);

  return (
    <section className="americano-registration qm-prep">
      <QuickModeHero
        eyebrow={eyebrow}
        title={eventTitle}
        subtitle={eventSubtitle}
        statusLabel="Preparación"
        stats={[
          { label: "Jugadores", value: players.length },
          { label: "Partidos/ronda", value: maxMatches },
          { label: "Canchas", value: courts },
          { label: "Descansan", value: benchPerRound },
        ]}
      />

      <QuickModePrimaryCta
        label="Iniciar"
        disabled={players.length < 4}
        hint={
          players.length < 4
            ? "Selecciona al menos 4 jugadores en Registro."
            : `${totalRounds} rondas · ${courts} cancha${courts === 1 ? "" : "s"}`
        }
        onClick={() => onStartTournament(totalRounds, courts)}
      />

      <QuickModeAccordion defaultOpenId="registro">
        <QuickModeAccordionItem
          id="registro"
          title="Registro"
          subtitle={registryTitle}
          meta={`${players.length} sel.`}
        >
          <p className="americano-registration__format-note" role="note">
            Formato americano equilibrado: las parejas se rotan automáticamente.
            El ranking solo muestra posiciones; no forma partidos.
          </p>
          <div className="americano-registration__db">
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
                    {selected ? "✓ " : ""}
                    {player.name}
                  </button>
                );
              })}
            </div>
            <h4 className="americano-registration__selected-title">
              Seleccionados
            </h4>
            <ul className="americano-registration__list">
              {players.length === 0 ? (
                <li className="americano-registration__empty">
                  Aún no has seleccionado jugadores.
                </li>
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
        </QuickModeAccordionItem>

        {convocatoriaSlot ? (
          <QuickModeAccordionItem
            id="convocatoria"
            title="Convocatoria"
            subtitle="Cupo, link y confirmados"
          >
            {convocatoriaSlot}
          </QuickModeAccordionItem>
        ) : null}

        <QuickModeAccordionItem
          id="detalles"
          title="Detalles"
          subtitle="Rondas y canchas"
        >
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
                  setCourts(
                    Math.min(20, Math.max(1, Number(e.target.value) || 1))
                  )
                }
              />
            </label>
          </div>
          <p className="americano-registration__courts-hint">
            Solo hay tantos partidos simultáneos como canchas. Las canchas rotan
            entre rondas.
          </p>
        </QuickModeAccordionItem>
      </QuickModeAccordion>
    </section>
  );
};
