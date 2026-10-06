import React, { useEffect, useMemo, useState } from "react";
import type { Player } from "../../lib/database";
import { getPlayers } from "../../lib/database";
import { dedupePlayersForSelect } from "../../lib/rivieraJugadores/playerNameKey";
import { invalidatePlayersPool } from "../../lib/rivieraJugadores/playersPoolCache";
import { navigateJugadoresLista } from "../jugadores/jugadoresGeneroNav";
import {
  resolveVirtualPair,
  TorneoExpressGrupoOpError,
  virtualPairResolveMessage,
} from "../../services/torneoExpressGrupoOps";
import { Button } from "../ui";

export interface DefinirParejaVirtualModalProps {
  open: boolean;
  torneoId: string;
  parejaId: string;
  label: string;
  userId: string;
  occupiedPlayerIds: ReadonlySet<string>;
  onClose: () => void;
  onResolved: (display: string) => void;
}

function playerHaystack(player: Player): string {
  const extra = player as Player & { riviera_id?: string | null };
  return `${player.name} ${extra.riviera_id ?? ""}`.toLowerCase();
}

export const DefinirParejaVirtualModal: React.FC<
  DefinirParejaVirtualModalProps
> = ({
  open,
  torneoId,
  parejaId,
  label,
  userId,
  occupiedPlayerIds,
  onClose,
  onResolved,
}) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [firstId, setFirstId] = useState<string | null>(null);
  const [secondId, setSecondId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [needsHistory, setNeedsHistory] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setFirstId(null);
    setSecondId(null);
    setError("");
    setNeedsHistory(false);
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    invalidatePlayersPool(userId);
    void getPlayers(userId)
      .then((rows) => {
        if (!cancelled) setPlayers(rows ?? []);
      })
      .catch(() => {
        if (!cancelled) setLoadError("No se pudo cargar el registro.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, userId, parejaId]);

  const available = useMemo(
    () =>
      dedupePlayersForSelect(
        players.filter((player) => player.id && !occupiedPlayerIds.has(player.id))
      ),
    [occupiedPlayerIds, players]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return available;
    return available.filter((player) => playerHaystack(player).includes(q));
  }, [available, query]);

  const first = available.find((player) => player.id === firstId) ?? null;
  const second = available.find((player) => player.id === secondId) ?? null;

  if (!open) return null;

  const toggle = (id: string) => {
    if (saving) return;
    setNeedsHistory(false);
    setError("");
    if (firstId === id) {
      setFirstId(secondId);
      setSecondId(null);
      return;
    }
    if (secondId === id) {
      setSecondId(null);
      return;
    }
    if (!firstId) {
      setFirstId(id);
      return;
    }
    if (!secondId) {
      setSecondId(id);
      return;
    }
    setSecondId(id);
  };

  const save = async (acceptExistingHistory: boolean) => {
    if (!first || !second || first.id === second.id) return;
    setSaving(true);
    setError("");
    try {
      await resolveVirtualPair({
        torneoId,
        parejaId,
        player1Id: first.id,
        player2Id: second.id,
        acceptExistingHistory,
      });
      onResolved(`${first.name} / ${second.name}`);
    } catch (e) {
      if (
        e instanceof TorneoExpressGrupoOpError &&
        e.code === "VIRTUAL_PAIR_HAS_HISTORY" &&
        !acceptExistingHistory
      ) {
        setNeedsHistory(true);
        setError(virtualPairResolveMessage(e.code));
        return;
      }
      const code = e instanceof TorneoExpressGrupoOpError ? e.code : "";
      setError(
        code
          ? virtualPairResolveMessage(code)
          : e instanceof Error
            ? e.message
            : virtualPairResolveMessage("")
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="te-inscripcion-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="te-inscripcion-modal te-inscripcion-modal--define-pair"
        role="dialog"
        aria-labelledby="te-define-pair-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="te-inscripcion-modal__head">
          <h2 id="te-define-pair-title">Sustituir {label}</h2>
          <button
            type="button"
            className="te-inscripcion-modal__close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>

        <div className="te-inscripcion-modal__body">
          <p className="te-define-pair__lead">
            Elige dos jugadores del registro. El cambio queda en todos los
            partidos de esta plaza.
          </p>

          <div className="te-define-pair__slots">
            <span>{first ? first.name : "Jugador 1"}</span>
            <span>{second ? second.name : "Jugador 2"}</span>
          </div>

          <label className="te-inscripcion-modal__field">
            Buscar
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nombre o Riviera ID"
            />
          </label>

          {loadError ? <p className="te-error">{loadError}</p> : null}
          {error ? <p className="te-error">{error}</p> : null}

          <div className="te-define-pair__list" role="listbox" aria-label="Registro">
            {loading ? (
              <p className="te-define-pair__empty">Cargando registro…</p>
            ) : filtered.length === 0 ? (
              <p className="te-define-pair__empty">
                No hay jugadores libres con esa búsqueda.
              </p>
            ) : (
              filtered.map((player) => {
                const selected = player.id === firstId || player.id === secondId;
                return (
                  <button
                    key={player.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`te-define-pair__player${
                      selected ? " te-define-pair__player--selected" : ""
                    }`}
                    disabled={saving}
                    onClick={() => toggle(player.id)}
                  >
                    {player.name}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <footer className="te-inscripcion-modal__foot te-define-pair__foot">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigateJugadoresLista("M")}
            disabled={saving}
          >
            Ir al registro
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={saving}
            disabled={!first || !second || saving}
            onClick={() => void save(needsHistory)}
          >
            {needsHistory ? "Sustituir y conservar resultados" : "Sustituir"}
          </Button>
        </footer>
      </div>
    </div>
  );
};
