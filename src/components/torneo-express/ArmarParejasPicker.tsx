import React, { useCallback, useMemo, useState } from "react";
import type { Player } from "../../lib/database";
import {
  dedupePlayersForSelect,
  normalizePlayerNameKey,
  playerNameKeysInPairs,
} from "../../lib/rivieraJugadores/playerNameKey";
import {
  playerHasNotifiableEmail,
  playerNeedsEmailContact,
} from "../../services/torneoExpressNotificacionesService";
import type { ParejaDraft } from "./crearTorneoExpressTypes";
import { Button } from "../ui";

type PlayerWithContact = Player & { email_verified?: boolean | null };

function playerByNameKey(pool: Player[], key: string): Player | undefined {
  return pool.find((p) => normalizePlayerNameKey(p.name) === key);
}

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
  const [pickedKeys, setPickedKeys] = useState<string[]>([]);

  const nameKeysInPairs = useMemo(
    () => playerNameKeysInPairs(parejas),
    [parejas]
  );

  const disponibles = useMemo(
    () =>
      dedupePlayersForSelect(
        jugadoresPool.filter((j) => {
          const key = normalizePlayerNameKey(j.name);
          return key ? !nameKeysInPairs.has(key) : false;
        })
      ),
    [jugadoresPool, nameKeysInPairs]
  );

  const pickedPlayers = useMemo(() => {
    return pickedKeys
      .map((key) => playerByNameKey(disponibles, key))
      .filter((p): p is Player => !!p);
  }, [pickedKeys, disponibles]);

  const toggleJugador = useCallback((j: Player) => {
    const key = normalizePlayerNameKey(j.name);
    if (!key || nameKeysInPairs.has(key)) return;

    setPickedKeys((prev) => {
      if (prev.includes(key)) {
        return prev.filter((k) => k !== key);
      }
      if (prev.length >= 2) {
        return [prev[1], key];
      }
      return [...prev, key];
    });
  }, [nameKeysInPairs]);

  const limpiarSeleccion = () => setPickedKeys([]);

  const formarPareja = () => {
    if (pickedPlayers.length !== 2) return;
    onFormarPareja(pickedPlayers[0], pickedPlayers[1]);
    setPickedKeys([]);
  };

  const puedeFormar =
    pickedPlayers.length === 2 &&
    normalizePlayerNameKey(pickedPlayers[0].name) !==
      normalizePlayerNameKey(pickedPlayers[1].name);

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
            {pickedKeys.length > 0
              ? ` · Seleccionados: ${pickedKeys.length}/2`
              : ""}
          </p>
          <div
            className="te-armar-parejas__pool"
            role="group"
            aria-label="Jugadores disponibles para formar pareja"
          >
            {disponibles.map((j) => {
              const key = normalizePlayerNameKey(j.name);
              const selected = pickedKeys.includes(key);
              const sinEmail = playerNeedsEmailContact(j as PlayerWithContact);
              return (
                <button
                  key={key}
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
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="te-armar-parejas__actions">
            {pickedPlayers.length === 2 ? (
              <p className="te-armar-parejas__preview">
                Pareja: <strong>{pickedPlayers[0].name}</strong> +{" "}
                <strong>{pickedPlayers[1].name}</strong>
              </p>
            ) : (
              <p className="te-armar-parejas__hint">
                {pickedKeys.length === 0
                  ? "Elige el primer jugador"
                  : "Elige el segundo jugador"}
              </p>
            )}
            <div className="te-armar-parejas__action-row">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={formarPareja}
                disabled={!puedeFormar || addingPair}
                loading={addingPair}
              >
                {addingPair ? "Guardando…" : "Formar pareja"}
              </Button>
              {pickedKeys.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={limpiarSeleccion}
                  disabled={addingPair}
                >
                  Limpiar
                </Button>
              ) : null}
            </div>
          </div>
        </>
      ) : parejas.length > 0 ? (
        <p className="te-armar-parejas__all-paired">
          Todos los jugadores del registro ya están en una pareja.
        </p>
      ) : null}

      {parejas.length > 0 ? (
        <div className="te-armar-parejas__formed">
          <p className="te-armar-parejas__formed-title">
            Parejas listas ({parejas.length})
          </p>
          <ul className="te-parejas-formadas">
            {parejas.map((p, index) => {
              const j1Ok = playerHasNotifiableEmail(
                p.jugador1 as PlayerWithContact
              );
              const j2Ok = playerHasNotifiableEmail(
                p.jugador2 as PlayerWithContact
              );
              return (
                <li key={p.id} className="te-pareja-formada">
                  <span className="te-pareja-formada__index">{index + 1}</span>
                  <span className="te-pareja-formada__names">
                    {p.jugador1.name}
                    {!j1Ok ? " ⚠️" : ""}
                    <span className="te-pareja-formada__sep">/</span>
                    {p.jugador2.name}
                    {!j2Ok ? " ⚠️" : ""}
                  </span>
                  <button
                    type="button"
                    className="te-players-icon-btn te-players-icon-btn--danger"
                    onClick={() => onEliminarPareja(p)}
                    aria-label={`Eliminar pareja ${p.jugador1.name} y ${p.jugador2.name}`}
                    title="Eliminar pareja"
                  >
                    🗑️
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
};
