import React, { useCallback, useMemo, useState } from "react";
import type { Player } from "../../lib/database";
import {
  dedupePlayersForSelect,
  playerIdsInPairs,
} from "../../lib/rivieraJugadores/playerNameKey";
import { playerNeedsEmailContact } from "../../services/torneoExpressNotificacionesService";
import { nextPairPick } from "../../lib/torneoExpress/pairPick";
import { TE_CREATE_NOTIFS_ENABLED } from "../../lib/torneoExpress/teCreateNotifs";
import type { ParejaDraft } from "./crearTorneoExpressTypes";
import { TePlayerCard, type TePlayerCardPlayer } from "./TePlayerCard";
import { Button } from "../ui";
import "../jugadores/riviera-jugadores.css";

type PlayerWithContact = TePlayerCardPlayer & {
  email_verified?: boolean | null;
};

export interface ArmarParejasPickerProps {
  jugadoresPool: Player[];
  parejas: ParejaDraft[];
  addingPair: boolean;
  onFormarPareja: (jugador1: Player, jugador2: Player) => void;
  onEliminarPareja: (pareja: ParejaDraft) => void;
}

/**
 * Flujo pensado para móvil / uso rápido:
 * 1) Toca jugador A
 * 2) Toca jugador B → la pareja se forma sola
 * 3) Si te equivocaste, bórrala abajo
 */
export const ArmarParejasPicker: React.FC<ArmarParejasPickerProps> = ({
  jugadoresPool,
  parejas,
  addingPair,
  onFormarPareja,
  onEliminarPareja,
}) => {
  const [pickedId, setPickedId] = useState<string | null>(null);

  const idsInPairs = useMemo(() => playerIdsInPairs(parejas), [parejas]);

  const disponibles = useMemo(
    () =>
      dedupePlayersForSelect(
        jugadoresPool.filter((j) => j.id && !idsInPairs.has(j.id))
      ) as PlayerWithContact[],
    [jugadoresPool, idsInPairs]
  );

  const pickedPlayer = useMemo(
    () => (pickedId ? disponibles.find((p) => p.id === pickedId) ?? null : null),
    [pickedId, disponibles]
  );

  const seleccionarJugador = useCallback(
    (j: Player) => {
      if (!j.id || idsInPairs.has(j.id) || addingPair) return;

      const action = nextPairPick(pickedId, j.id);

      if (action.type === "clear") {
        setPickedId(null);
        return;
      }

      if (action.type === "select") {
        setPickedId(action.id);
        return;
      }

      const primero = disponibles.find((p) => p.id === action.id1);
      const segundo = disponibles.find((p) => p.id === action.id2);
      if (!primero || !segundo || primero.id === segundo.id) {
        setPickedId(action.id2);
        return;
      }

      setPickedId(null);
      onFormarPareja(primero, segundo);
    },
    [addingPair, disponibles, idsInPairs, onFormarPareja, pickedId]
  );

  return (
    <section className="te-armar-parejas te-armar-parejas--picker">
      <p className="te-armar-parejas__howto">
        <strong>Toca un jugador</strong> y luego <strong>otro</strong>. La
        pareja se forma sola. Si te equivocas, bórrala abajo.
      </p>

      <div
        className="te-armar-parejas__slots"
        aria-live="polite"
        aria-atomic="true"
      >
        <div
          className={`te-armar-parejas__slot${
            pickedPlayer ? " te-armar-parejas__slot--filled" : ""
          }`}
        >
          <span className="te-armar-parejas__slot-label">Jugador 1</span>
          <span className="te-armar-parejas__slot-value">
            {pickedPlayer ? pickedPlayer.name : "Toca un nombre"}
          </span>
        </div>
        <span className="te-armar-parejas__slots-plus" aria-hidden>
          +
        </span>
        <div
          className={`te-armar-parejas__slot${
            addingPair ? " te-armar-parejas__slot--busy" : ""
          }`}
        >
          <span className="te-armar-parejas__slot-label">Jugador 2</span>
          <span className="te-armar-parejas__slot-value">
            {addingPair
              ? "Formando…"
              : pickedPlayer
                ? "Toca al compañero"
                : "—"}
          </span>
        </div>
      </div>

      {pickedPlayer ? (
        <div className="te-armar-parejas__pick-bar">
          <p className="te-armar-parejas__pick-hint">
            Elegiste a <strong>{pickedPlayer.name}</strong>. Ahora toca a su
            pareja.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={addingPair}
            onClick={() => setPickedId(null)}
          >
            Cancelar
          </Button>
        </div>
      ) : null}

      {disponibles.length === 0 && parejas.length === 0 ? (
        <p className="te-armar-parejas__empty">
          Primero revisa el Paso 2: necesitas jugadores en el registro.
        </p>
      ) : null}

      {disponibles.length > 0 ? (
        <>
          <p className="te-armar-parejas__meta">
            {disponibles.length} sin pareja
            {pickedPlayer ? " · elige al compañero" : ""}
          </p>
          <div
            className="te-players-grid te-armar-parejas__grid"
            role="group"
            aria-label="Jugadores disponibles para formar pareja"
          >
            {disponibles.map((j) => {
              const selected = pickedId === j.id;
              const sinEmail =
                TE_CREATE_NOTIFS_ENABLED &&
                playerNeedsEmailContact(j as PlayerWithContact);
              return (
                <div key={j.id} className="te-players-grid__item">
                  <TePlayerCard
                    player={j}
                    selected={selected}
                    disabled={addingPair}
                    onClick={() => seleccionarJugador(j)}
                  />
                  {sinEmail ? (
                    <span
                      className="te-jugador-pick__warn te-players-grid__warn"
                      title="Sin email"
                      aria-label="Sin email"
                    >
                      ⚠️
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      ) : parejas.length > 0 ? (
        <p className="te-armar-parejas__empty">
          Todos los jugadores del registro ya tienen pareja.
        </p>
      ) : null}

      <div className="te-armar-parejas__formed">
        <div className="te-armar-parejas__formed-head">
          <h3 className="te-armar-parejas__formed-title">
            Parejas armadas
            {parejas.length > 0 ? ` (${parejas.length})` : ""}
          </h3>
          {parejas.length === 0 ? (
            <p className="te-armar-parejas__formed-empty">
              Todavía ninguna. Toca dos fichas arriba.
            </p>
          ) : (
            <p className="te-armar-parejas__formed-hint">
              ¿Te equivocaste? Pulsa <strong>Borrar</strong>.
            </p>
          )}
        </div>

        {parejas.length > 0 ? (
          <ul className="te-armar-parejas__list">
            {parejas.map((p, index) => (
              <li key={p.id} className="te-armar-parejas__item">
                <div className="te-armar-parejas__item-main">
                  <span className="te-armar-parejas__item-num" aria-hidden>
                    {index + 1}
                  </span>
                  <span className="te-armar-parejas__item-names">
                    <span>{p.jugador1.name}</span>
                    <span className="te-armar-parejas__item-sep" aria-hidden>
                      /
                    </span>
                    <span>{p.jugador2.name}</span>
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="te-armar-parejas__item-delete"
                  onClick={() => onEliminarPareja(p)}
                  aria-label={`Borrar pareja ${p.jugador1.name} y ${p.jugador2.name}`}
                >
                  Borrar
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
};
