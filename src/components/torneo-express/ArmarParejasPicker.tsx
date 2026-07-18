import React, { useCallback, useMemo, useState } from "react";
import type { Player } from "../../lib/database";
import {
  dedupePlayersForSelect,
  playerIdsInPairs,
} from "../../lib/rivieraJugadores/playerNameKey";
import {
  playerHasNotifiableEmail,
  playerNeedsEmailContact,
} from "../../services/torneoExpressNotificacionesService";
import type { ParejaDraft } from "./crearTorneoExpressTypes";
import { Button } from "../ui";

type PlayerWithContact = Player & { email_verified?: boolean | null };

export interface ArmarParejasPickerProps {
  jugadoresPool: Player[];
  parejas: ParejaDraft[];
  addingPair: boolean;
  onFormarPareja: (jugador1: Player, jugador2: Player) => void;
  onEliminarPareja: (pareja: ParejaDraft) => void;
}

export const ArmarParejasPicker: React.FC<ArmarParejasPickerProps> = ({
  jugadoresPool,
  parejas,
  addingPair,
  onFormarPareja,
  onEliminarPareja,
}) => {
  const [pickedIds, setPickedIds] = useState<string[]>([]);

  const idsInPairs = useMemo(() => playerIdsInPairs(parejas), [parejas]);

  const disponibles = useMemo(
    () =>
      dedupePlayersForSelect(
        jugadoresPool.filter((j) => j.id && !idsInPairs.has(j.id))
      ),
    [jugadoresPool, idsInPairs]
  );

  const pickedPlayers = useMemo(() => {
    return pickedIds
      .map((id) => disponibles.find((p) => p.id === id))
      .filter((p): p is Player => !!p);
  }, [pickedIds, disponibles]);

  const toggleJugador = useCallback(
    (j: Player) => {
      if (!j.id || idsInPairs.has(j.id)) return;

      setPickedIds((prev) => {
        if (prev.includes(j.id)) {
          return prev.filter((id) => id !== j.id);
        }
        if (prev.length >= 2) {
          return [prev[1], j.id];
        }
        return [...prev, j.id];
      });
    },
    [idsInPairs]
  );

  const limpiarSeleccion = () => setPickedIds([]);

  const formarPareja = () => {
    if (pickedPlayers.length !== 2) return;
    onFormarPareja(pickedPlayers[0], pickedPlayers[1]);
    setPickedIds([]);
  };

  const puedeFormar =
    pickedPlayers.length === 2 && pickedPlayers[0].id !== pickedPlayers[1].id;

  return (
    <section className="te-armar-parejas te-armar-parejas--picker">
      <div className="te-armar-parejas__step">
        <span className="te-armar-parejas__step-num" aria-hidden>
          1
        </span>
        <div>
          <h2 className="te-section-title">Armar parejas</h2>
          <p className="te-subtitle">
            Toca <strong>dos jugadores</strong> del registro y pulsa «Formar
            pareja». Ya emparejados desaparecen de la lista.
          </p>
        </div>
      </div>

      {disponibles.length === 0 && parejas.length === 0 ? (
        <p className="te-armar-parejas__empty">
          Agrega jugadores en el panel derecho para empezar.
        </p>
      ) : null}

      {disponibles.length > 0 ? (
        <>
          <p className="te-armar-parejas__meta">
            Disponibles: {disponibles.length}
            {pickedIds.length > 0
              ? ` · Seleccionados: ${pickedIds.length}/2`
              : ""}
          </p>
          <div
            className="te-armar-parejas__pool"
            role="group"
            aria-label="Jugadores disponibles para formar pareja"
          >
            {disponibles.map((j) => {
              const selected = pickedIds.includes(j.id);
              const sinEmail = playerNeedsEmailContact(j as PlayerWithContact);
              return (
                <button
                  key={j.id}
                  type="button"
                  className={`te-jugador-pick${
                    selected ? " te-jugador-pick--selected" : ""
                  }`}
                  onClick={() => toggleJugador(j)}
                  aria-pressed={selected}
                >
                  <span className="te-jugador-pick__name">{j.name}</span>
                  {sinEmail ? (
                    <span className="te-jugador-pick__warn" title="Sin email">
                      ⚠️
                    </span>
                  ) : playerHasNotifiableEmail(j as PlayerWithContact) ? (
                    <span className="te-jugador-pick__ok" title="Email listo">
                      ✓
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      ) : parejas.length > 0 ? (
        <p className="te-armar-parejas__empty">
          Todos los jugadores del registro ya están en una pareja.
        </p>
      ) : null}

      <div className="te-armar-parejas__actions">
        {pickedIds.length > 0 ? (
          <Button type="button" variant="ghost" onClick={limpiarSeleccion}>
            Limpiar selección
          </Button>
        ) : null}
        <Button
          type="button"
          variant="primary"
          disabled={!puedeFormar || addingPair}
          onClick={formarPareja}
        >
          {addingPair ? "Formando…" : "Formar pareja"}
        </Button>
      </div>

      {parejas.length > 0 ? (
        <ul className="te-armar-parejas__list">
          {parejas.map((p) => (
            <li key={p.id} className="te-armar-parejas__item">
              <span>
                {p.jugador1.name} / {p.jugador2.name}
              </span>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onEliminarPareja(p)}
              >
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};
