import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Player } from "../../lib/database";
import { getPlayers } from "../../lib/database";
import { dedupePlayersForSelect } from "../../lib/rivieraJugadores/playerNameKey";
import { invalidatePlayersPool } from "../../lib/rivieraJugadores/playersPoolCache";
import type {
  TorneoExpressGrupo,
  TorneoExpressGrupoPareja,
} from "../../lib/torneoExpress/types";
import {
  changePairPlayer,
  changePlayerMessage,
  TorneoExpressGrupoOpError,
} from "../../services/torneoExpressGrupoOps";
import { navigateJugadoresLista } from "../jugadores/jugadoresGeneroNav";
import { Button } from "../ui";

export interface CambiarJugadorParejaModalProps {
  open: boolean;
  userId: string;
  grupos: TorneoExpressGrupo[];
  parejasPorGrupo: Record<string, TorneoExpressGrupoPareja[]>;
  occupiedPlayerIds: ReadonlySet<string>;
  onClose: () => void;
  onChanged: (message: string) => void | Promise<void>;
  onStale: () => void | Promise<void>;
}

type Selection = {
  grupoId: string;
  parejaId: string;
  outgoingId: string;
};

function playerHaystack(player: Player): string {
  const extra = player as Player & { riviera_id?: string | null };
  return `${player.name} ${extra.riviera_id ?? ""}`.toLowerCase();
}

function splitDisplay(display: string | undefined): [string, string] {
  const parts = (display ?? "").split(" / ");
  return [parts[0]?.trim() || "Jugador 1", parts[1]?.trim() || "Jugador 2"];
}

export const CambiarJugadorParejaModal: React.FC<
  CambiarJugadorParejaModalProps
> = ({
  open,
  userId,
  grupos,
  parejasPorGrupo,
  occupiedPlayerIds,
  onClose,
  onChanged,
  onStale,
}) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [incomingId, setIncomingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelection(null);
    setIncomingId(null);
    setError("");
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
  }, [open, userId]);

  const orderedGroups = useMemo(
    () => [...grupos].sort((a, b) => a.orden - b.orden),
    [grupos]
  );

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const player of players) {
      if (player.id) map.set(player.id, player.name);
    }
    return map;
  }, [players]);

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

  const incoming = available.find((player) => player.id === incomingId) ?? null;

  if (!open) return null;

  const pickPlayer = (grupoId: string, pair: TorneoExpressGrupoPareja, slot: 1 | 2) => {
    if (saving) return;
    const outgoingId = slot === 1 ? pair.player1_id : pair.player2_id;
    if (!outgoingId) return;
    setError("");
    setIncomingId(null);
    setSelection({ grupoId, parejaId: pair.pareja_id, outgoingId });
  };

  const save = async () => {
    if (!selection || !incoming || saving) return;
    const grupo = grupos.find((row) => row.id === selection.grupoId);
    if (!grupo) return;
    setSaving(true);
    setError("");
    try {
      const result = await changePairPlayer({
        grupoId: selection.grupoId,
        parejaId: selection.parejaId,
        outgoingPlayerId: selection.outgoingId,
        incomingPlayerId: incoming.id,
        expectedVersion: typeof grupo.version === "number" ? grupo.version : 1,
      });
      await onChanged(
        result.mode === "desde_ahora"
          ? `${incoming.name} entra desde ahora. Los resultados ya jugados se quedan como estaban.`
          : `${incoming.name} ya está en la pareja.`
      );
      onClose();
    } catch (e) {
      setSaving(false);
      if (e instanceof TorneoExpressGrupoOpError) {
        setError(changePlayerMessage(e.code));
        if (e.code === "STALE_GROUP_VERSION") void onStale();
        return;
      }
      const detail = e instanceof Error ? e.message.trim() : "";
      setError(
        detail
          ? `No se pudo cambiar el jugador. ${detail}`
          : changePlayerMessage("")
      );
    }
  };

  return createPortal(
    <div
      className="te-define-pair-backdrop"
      role="presentation"
      onClick={saving ? undefined : onClose}
    >
      <div
        className="te-define-pair-dialog te-move-pairs-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="te-change-player-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="te-define-pair-dialog__head">
          <h2 id="te-change-player-title">Cambiar jugador</h2>
          <button
            type="button"
            className="te-define-pair-dialog__close"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>

        <div className="te-define-pair-dialog__body">
          <p className="te-define-pair__lead">
            1. Toca al jugador que quieres quitar. 2. Elige al jugador nuevo del
            registro. Los partidos pendientes pasan a la pareja nueva y los
            resultados ya jugados no se tocan.
          </p>

          <div className="te-move-pairs__list">
            {orderedGroups.map((grupo) => {
              const rows = (parejasPorGrupo[grupo.id] ?? []).filter(
                (pair) => pair.activa !== false && pair.is_virtual !== true
              );
              if (rows.length === 0) return null;
              return (
                <section key={grupo.id} className="te-move-pairs__group">
                  <h3>{grupo.nombre}</h3>
                  {rows.map((pair) => {
                    const [fallback1, fallback2] = splitDisplay(
                      pair.pareja_display
                    );
                    const slots: Array<[1 | 2, string | null | undefined, string]> = [
                      [
                        1,
                        pair.player1_id,
                        (pair.player1_id && nameById.get(pair.player1_id)) ||
                          fallback1,
                      ],
                      [
                        2,
                        pair.player2_id,
                        (pair.player2_id && nameById.get(pair.player2_id)) ||
                          fallback2,
                      ],
                    ];
                    return (
                      <div key={pair.id} className="te-change-player__pair">
                        {slots.map(([slot, id, label]) => {
                          const selected =
                            selection?.parejaId === pair.pareja_id &&
                            selection.outgoingId === id;
                          return (
                            <button
                              key={slot}
                              type="button"
                              className={`te-change-player__chip${
                                selected ? " te-change-player__chip--selected" : ""
                              }`}
                              aria-pressed={selected}
                              disabled={saving || !id}
                              onClick={() => pickPlayer(grupo.id, pair, slot)}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </div>

          {selection ? (
            <>
              <div className="te-define-pair__slots">
                <span className="is-filled">
                  <small>Sale</small>
                  <strong>
                    {nameById.get(selection.outgoingId) ?? "Jugador elegido"}
                  </strong>
                </span>
                <span className={incoming ? "is-filled" : ""}>
                  <small>Entra</small>
                  <strong>{incoming ? incoming.name : "Sin elegir"}</strong>
                </span>
              </div>

              <label className="te-define-pair__search">
                Buscar jugador nuevo
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Nombre o Riviera ID"
                />
              </label>

              <div
                className="te-define-pair__list"
                role="listbox"
                aria-label="Registro"
              >
                {loading ? (
                  <p className="te-define-pair__empty">Cargando registro…</p>
                ) : filtered.length === 0 ? (
                  <p className="te-define-pair__empty">
                    No hay jugadores libres con esa búsqueda.
                  </p>
                ) : (
                  filtered.map((player) => {
                    const selected = player.id === incomingId;
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
                        onClick={() => {
                          setError("");
                          setIncomingId(player.id);
                        }}
                      >
                        <span className="te-define-pair__mark" aria-hidden>
                          {selected ? "✓" : ""}
                        </span>
                        <span className="te-define-pair__name">{player.name}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          ) : null}

          {loadError ? <p className="te-error">{loadError}</p> : null}
        </div>

        <footer className="te-define-pair-dialog__foot">
          {error ? <p className="te-error te-move-pairs__error">{error}</p> : null}
          <div className="te-move-pairs__actions">
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
              disabled={!selection || !incoming || saving}
              onClick={() => void save()}
            >
              Cambiar jugador
            </Button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
};
