import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../ui";
import {
  dispatchEliminatoriaStatusForPairs,
  dispatchFinalStatusForPairs,
  dispatchTorneoExpressNotificaciones,
  MANUAL_NOTIF_DISPATCH,
  isValidRealEmail,
  listPairContactsByTorneoExpress,
  playerHasNotifiableEmail,
  type TorneoPairContactRow,
  updatePlayerNotificationContact,
  type UpdatedPlayerContact,
} from "../../services/torneoExpressNotificacionesService";
import { InscripcionParejaModal } from "./InscripcionParejaModal";

type ContactDraft = {
  email: string;
  email_verified: boolean;
  notif_opt_in_email: boolean;
};

interface PairRowView {
  pairId: string;
  label: string;
  player1Id: string;
  player2Id: string;
  ready: number;
  total: 2;
}

function draftFromPlayer(updated: UpdatedPlayerContact, prev?: ContactDraft): ContactDraft {
  return {
    email: updated.email ?? prev?.email ?? "",
    email_verified: updated.email_verified !== false,
    notif_opt_in_email: updated.notif_opt_in_email !== false,
  };
}

function patchContactsForPlayer(
  list: TorneoPairContactRow[],
  playerId: string,
  updated: UpdatedPlayerContact
): TorneoPairContactRow[] {
  return list.map((pair) => {
    if (pair.player1_id === playerId) {
      return {
        ...pair,
        player1_email: updated.email ?? pair.player1_email,
        player1_email_verified: updated.email_verified !== false,
        player1_opt_email: updated.notif_opt_in_email ?? pair.player1_opt_email,
      };
    }
    if (pair.player2_id === playerId) {
      return {
        ...pair,
        player2_email: updated.email ?? pair.player2_email,
        player2_email_verified: updated.email_verified !== false,
        player2_opt_email: updated.notif_opt_in_email ?? pair.player2_opt_email,
      };
    }
    return pair;
  });
}

function countReady(
  email: string | null,
  verified: boolean | null,
  opt: boolean | null
): number {
  if (opt === false) return 0;
  return playerHasNotifiableEmail({ email, email_verified: verified }) ? 1 : 0;
}

export const TorneoExpressNotificacionesPanel: React.FC<{
  torneoExpressId: string;
}> = ({ torneoExpressId }) => {
  const [contacts, setContacts] = useState<TorneoPairContactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState<Record<string, ContactDraft>>({});
  const [selectedPairIds, setSelectedPairIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [showContacts, setShowContacts] = useState(false);
  const [expandedPairId, setExpandedPairId] = useState<string | null>(null);
  const [modalPlayer, setModalPlayer] = useState<{
    playerId: string;
    playerName: string;
    email: string;
  } | null>(null);

  const hydrate = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const c = await listPairContactsByTorneoExpress(torneoExpressId);
      setContacts(c);
      const nextDrafts: Record<string, ContactDraft> = {};
      c.forEach((pair) => {
        nextDrafts[pair.player1_id] = {
          email: pair.player1_email ?? "",
          email_verified: Boolean(pair.player1_email_verified),
          notif_opt_in_email: pair.player1_opt_email !== false,
        };
        nextDrafts[pair.player2_id] = {
          email: pair.player2_email ?? "",
          email_verified: Boolean(pair.player2_email_verified),
          notif_opt_in_email: pair.player2_opt_email !== false,
        };
      });
      setDrafts(nextDrafts);
      setSelectedPairIds(new Set(c.map((p) => p.pair_id)));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error cargando notificaciones.");
    } finally {
      setLoading(false);
    }
  }, [torneoExpressId]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const pairs = useMemo((): PairRowView[] => {
    return contacts.map((p) => {
      const ready =
        countReady(p.player1_email, p.player1_email_verified, p.player1_opt_email) +
        countReady(p.player2_email, p.player2_email_verified, p.player2_opt_email);
      return {
        pairId: p.pair_id,
        label: `${p.player1_name} / ${p.player2_name}`,
        player1Id: p.player1_id,
        player2Id: p.player2_id,
        ready,
        total: 2,
      };
    });
  }, [contacts]);

  const filteredPairs = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return pairs;
    return pairs.filter(
      (p) =>
        p.label.toLowerCase().includes(q) ||
        p.pairId.toLowerCase().includes(q)
    );
  }, [pairs, filter]);

  const selectedCount = selectedPairIds.size;
  const targetPairIds = useMemo(
    () => pairs.filter((p) => selectedPairIds.has(p.pairId)).map((p) => p.pairId),
    [pairs, selectedPairIds]
  );

  const togglePair = (pairId: string) => {
    setSelectedPairIds((prev) => {
      const next = new Set(prev);
      if (next.has(pairId)) next.delete(pairId);
      else next.add(pairId);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedPairIds((prev) => {
      const next = new Set(prev);
      filteredPairs.forEach((p) => next.add(p.pairId));
      return next;
    });
  };

  const clearSelection = () => setSelectedPairIds(new Set());

  const applySavedPlayer = useCallback(
    (playerId: string, updated: UpdatedPlayerContact) => {
      setContacts((prev) => patchContactsForPlayer(prev, playerId, updated));
      setDrafts((prev) => ({
        ...prev,
        [playerId]: draftFromPlayer(updated, prev[playerId]),
      }));
    },
    []
  );

  const saveContact = async (playerId: string) => {
    const draft = drafts[playerId];
    if (!draft) return;
    if (draft.email && !isValidRealEmail(draft.email)) {
      setMessage("Email inválido.");
      return;
    }
    const updated = await updatePlayerNotificationContact(playerId, {
      email: draft.email || null,
      notif_opt_in_email: draft.notif_opt_in_email,
    });
    applySavedPlayer(playerId, updated);
  };

  const savePairContacts = async (pairId: string) => {
    const pair = contacts.find((c) => c.pair_id === pairId);
    if (!pair) return;
    try {
      await saveContact(pair.player1_id);
      await saveContact(pair.player2_id);
      setMessage("Contactos guardados.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error al guardar.");
    }
  };

  const dispatchBienvenida = async () => {
    const ids = targetPairIds;
    if (ids.length === 0) {
      setMessage("Selecciona al menos una pareja.");
      return;
    }
    setDispatching("bienvenida");
    setMessage("");
    let enviados = 0;
    let sinContacto = 0;
    let errores = 0;
    let omitidos = 0;
    try {
      for (const pairId of ids) {
        const out = await dispatchTorneoExpressNotificaciones({
          torneoExpressId,
          tipo: "bienvenida_torneo",
          pairId,
          ...MANUAL_NOTIF_DISPATCH,
        });
        enviados += out.enviados_email ?? 0;
        sinContacto += out.sin_contacto ?? 0;
        errores += out.errores ?? 0;
        omitidos += out.omitidos_duplicado ?? 0;
      }
      setMessage(
        `Bienvenida → ${ids.length} pareja(s): ${enviados} enviados, ${sinContacto} sin contacto, ${omitidos} omitidos, ${errores} errores.`
      );
      await hydrate();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error al enviar.");
    } finally {
      setDispatching(null);
    }
  };

  const dispatchGrupo = async () => {
    const ids = targetPairIds;
    if (ids.length === 0) {
      setMessage("Selecciona al menos una pareja.");
      return;
    }
    setDispatching("grupo");
    setMessage("");
    let enviados = 0;
    let sinContacto = 0;
    let errores = 0;
    let omitidos = 0;
    try {
      for (const pairId of ids) {
        const out = await dispatchTorneoExpressNotificaciones({
          torneoExpressId,
          tipo: "asignacion_grupo",
          pairId,
          ...MANUAL_NOTIF_DISPATCH,
        });
        enviados += out.enviados_email ?? 0;
        sinContacto += out.sin_contacto ?? 0;
        errores += out.errores ?? 0;
        omitidos += out.omitidos_duplicado ?? 0;
      }
      setMessage(
        `Grupo → ${ids.length} pareja(s): ${enviados} enviados, ${sinContacto} sin contacto, ${omitidos} omitidos, ${errores} errores.`
      );
      await hydrate();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error al enviar.");
    } finally {
      setDispatching(null);
    }
  };

  const dispatchEliminatoria = async () => {
    const ids = targetPairIds;
    if (ids.length === 0) {
      setMessage("Selecciona al menos una pareja.");
      return;
    }
    setDispatching("eliminatoria");
    setMessage("");
    try {
      const out = await dispatchEliminatoriaStatusForPairs(
        torneoExpressId,
        ids,
        MANUAL_NOTIF_DISPATCH
      );
      setMessage(
        `Eliminatoria → ${ids.length} pareja(s): ${out.clasificaron ?? 0} clasificaron, ${out.no_clasificaron ?? 0} no clasificaron · ${out.enviados_email} emails enviados, ${out.sin_contacto} sin contacto.`
      );
      await hydrate();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error al enviar.");
    } finally {
      setDispatching(null);
    }
  };

  const dispatchRondaFinal = async () => {
    const ids = targetPairIds;
    if (ids.length === 0) {
      setMessage("Selecciona al menos una pareja.");
      return;
    }
    setDispatching("final");
    setMessage("");
    try {
      const out = await dispatchFinalStatusForPairs(
        torneoExpressId,
        ids,
        MANUAL_NOTIF_DISPATCH
      );
      const procesadas = (out.en_final ?? 0) + (out.no_en_final ?? 0);
      if (procesadas === 0) {
        setMessage(
          "Ninguna pareja seleccionada está en el cuadro eliminatorio (o aún no hay ronda final)."
        );
        return;
      }
      setMessage(
        `Ronda final → ${procesadas} pareja(s) en cuadro: ${out.en_final ?? 0} en final, ${out.no_en_final ?? 0} no · ${out.enviados_email} emails enviados.`
      );
      await hydrate();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error al enviar.");
    } finally {
      setDispatching(null);
    }
  };

  const getContact = (pairId: string) => contacts.find((c) => c.pair_id === pairId);

  return (
    <section className="te-notif-panel te-notif-panel--compact">
      <header className="te-notif-panel__head te-notif-panel__head--stack">
        <div>
          <h3>Notificaciones</h3>
          <p className="te-notif-panel__intro te-notif-panel__intro--muted">
            <strong>Bienvenida</strong> — inscripción al torneo (sin grupo).{" "}
            <strong>Grupo</strong> — inscripción con grupo y rivales.{" "}
            <strong>Eliminatoria</strong> — por pareja: «clasificó» o «no
            clasificó» según el cuadro o, si aún no hay cuadro, los{" "}
            <strong>2 primeros</strong> de cada grupo en la tabla.{" "}
            <strong>Ronda final</strong> — solo parejas ya en cuadro: «llegó a
            final» o «no» (última ronda).
          </p>
        </div>
      </header>

      {message ? <p className="te-notif-panel__msg">{message}</p> : null}

      <div className="te-notif-toolbar">
        <input
          type="search"
          className="te-notif-toolbar__search"
          placeholder="Buscar pareja…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Buscar pareja"
        />
        <div className="te-notif-toolbar__sel">
          <button type="button" className="te-notif-link" onClick={selectAllFiltered}>
            Todas ({filteredPairs.length})
          </button>
          <span className="te-notif-toolbar__sep">·</span>
          <button type="button" className="te-notif-link" onClick={clearSelection}>
            Ninguna
          </button>
          <span className="te-notif-toolbar__count">
            {selectedCount > 0 ? `${selectedCount} seleccionadas` : "Todas (ninguna marcada)"}
          </span>
        </div>
      </div>

      <div className="te-notif-send-bar">
        <span className="te-notif-send-bar__label">Enviar a selección:</span>
        <div className="te-notif-send-bar__btns">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={dispatching === "bienvenida"}
            disabled={Boolean(dispatching) || loading}
            onClick={() => void dispatchBienvenida()}
            title="Bienvenida al torneo (sin grupo asignado)"
          >
            Bienvenida
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            loading={dispatching === "grupo"}
            disabled={Boolean(dispatching) || loading}
            onClick={() => void dispatchGrupo()}
            title="Inscripción con grupo asignado"
          >
            Grupo
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={dispatching === "eliminatoria"}
            disabled={Boolean(dispatching) || loading}
            onClick={() => void dispatchEliminatoria()}
            title="Clasificó / no clasificó según cuadro o top 2 del grupo"
          >
            Eliminatoria
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={dispatching === "final"}
            disabled={Boolean(dispatching) || loading}
            onClick={() => void dispatchRondaFinal()}
            title="Solo parejas en cuadro: email de final o de no llegó a la final"
          >
            Ronda final
          </Button>
        </div>
      </div>

      <div className="te-notif-table-wrap">
        {loading ? <p className="te-notif-table__empty">Cargando…</p> : null}
        {!loading && filteredPairs.length === 0 ? (
          <p className="te-notif-table__empty">Sin parejas.</p>
        ) : null}
        {!loading && filteredPairs.length > 0 ? (
          <table className="te-notif-table">
            <thead>
              <tr>
                <th className="te-notif-table__check" aria-label="Seleccionar" />
                <th>Pareja</th>
                <th className="te-notif-table__status">Email</th>
                <th className="te-notif-table__actions" />
              </tr>
            </thead>
            <tbody>
              {filteredPairs.map((row) => {
                const checked = selectedPairIds.has(row.pairId);
                const expanded = expandedPairId === row.pairId;
                const contact = getContact(row.pairId);
                return (
                  <React.Fragment key={row.pairId}>
                    <tr className={checked ? "te-notif-table__row--on" : undefined}>
                      <td className="te-notif-table__check">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePair(row.pairId)}
                          aria-label={`Seleccionar ${row.label}`}
                        />
                      </td>
                      <td className="te-notif-table__pair">
                        <span className="te-notif-table__pair-names">{row.label}</span>
                      </td>
                      <td className="te-notif-table__status">
                        <span
                          className={
                            row.ready === row.total
                              ? "te-notif-pill te-notif-pill--ok"
                              : row.ready > 0
                                ? "te-notif-pill te-notif-pill--partial"
                                : "te-notif-pill te-notif-pill--off"
                          }
                          title="Jugadores con email listo para notificar"
                        >
                          {row.ready}/{row.total}
                        </span>
                      </td>
                      <td className="te-notif-table__actions">
                        <button
                          type="button"
                          className="te-notif-link"
                          onClick={() =>
                            setExpandedPairId(expanded ? null : row.pairId)
                          }
                        >
                          {expanded ? "Cerrar" : "Contacto"}
                        </button>
                      </td>
                    </tr>
                    {expanded && contact ? (
                      <tr className="te-notif-table__expand">
                        <td colSpan={4}>
                          <div className="te-notif-expand">
                            {(
                              [
                                {
                                  id: contact.player1_id,
                                  name: contact.player1_name,
                                },
                                {
                                  id: contact.player2_id,
                                  name: contact.player2_name,
                                },
                              ] as const
                            ).map((pl) => {
                              const d = drafts[pl.id];
                              if (!d) return null;
                              return (
                                <div key={pl.id} className="te-notif-expand__player">
                                  <span className="te-notif-expand__name">{pl.name}</span>
                                  <input
                                    type="email"
                                    className="te-notif-expand__email"
                                    placeholder="email"
                                    value={d.email}
                                    onChange={(e) =>
                                      setDrafts((prev) => ({
                                        ...prev,
                                        [pl.id]: { ...d, email: e.target.value },
                                      }))
                                    }
                                  />
                                  <label className="te-notif-expand__chk" title="Opt-in">
                                    <input
                                      type="checkbox"
                                      checked={d.notif_opt_in_email}
                                      onChange={(e) =>
                                        setDrafts((prev) => ({
                                          ...prev,
                                          [pl.id]: {
                                            ...d,
                                            notif_opt_in_email: e.target.checked,
                                          },
                                        }))
                                      }
                                    />
                                    Opt-in
                                  </label>
                                  <button
                                    type="button"
                                    className="te-notif-link"
                                    onClick={() =>
                                      setModalPlayer({
                                        playerId: pl.id,
                                        playerName: pl.name,
                                        email: d.email,
                                      })
                                    }
                                  >
                                    ···
                                  </button>
                                </div>
                              );
                            })}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => void savePairContacts(row.pairId)}
                            >
                              Guardar pareja
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>

      <button
        type="button"
        className="te-notif-contacts-toggle"
        onClick={() => setShowContacts((v) => !v)}
      >
        {showContacts ? "▾" : "▸"} Edición rápida de todos los contactos
      </button>

      {showContacts ? (
        <div className="te-notif-contacts-grid">
          {contacts.map((pair) => (
            <div key={pair.pair_id} className="te-notif-contacts-grid__row">
              <span className="te-notif-contacts-grid__label" title={pair.pair_id}>
                {pair.player1_name} · {pair.player2_name}
              </span>
              {[pair.player1_id, pair.player2_id].map((pid, idx) => {
                const d = drafts[pid];
                const name = idx === 0 ? pair.player1_name : pair.player2_name;
                if (!d) return null;
                return (
                  <input
                    key={pid}
                    type="email"
                    className="te-notif-contacts-grid__input"
                    placeholder={name}
                    value={d.email}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [pid]: { ...d, email: e.target.value },
                      }))
                    }
                    onBlur={() => void saveContact(pid).catch(() => {})}
                  />
                );
              })}
            </div>
          ))}
        </div>
      ) : null}

      <InscripcionParejaModal
        open={Boolean(modalPlayer)}
        playerId={modalPlayer?.playerId ?? ""}
        playerName={modalPlayer?.playerName ?? ""}
        initialEmail={modalPlayer?.email}
        onClose={() => setModalPlayer(null)}
        onSaved={(updated) => {
          applySavedPlayer(updated.id, updated);
          setMessage("Contacto guardado.");
        }}
      />
    </section>
  );
};
