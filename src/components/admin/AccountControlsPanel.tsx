import React, { useCallback, useEffect, useState } from "react";
import { GAME_MODES, type GameModeId } from "../home/gameModesConfig";
import {
  createJugadorForAdmin,
  fetchOrganizadorGameModes,
  listJugadoresForAdmin,
  removeJugadorForAdmin,
  updateJugadorAdminControls,
  upsertOrganizadorGameModes,
  type AdminJugadorRow,
} from "../../lib/admin/accountControls";
import { GAME_MODE_LABELS } from "../../lib/admin/organizadorGameModes";
import type { RivieraJugadorCategoria } from "../../lib/rivieraJugadores/types";
import "./AccountControlsPanel.css";

interface AccountControlsPanelProps {
  organizadorId: string;
  accountLabel: string;
  layout?: "modal" | "page";
}

const CATEGORIAS: RivieraJugadorCategoria[] = [
  "open",
  "1ra_fuerza",
  "2da_fuerza",
  "3ra_fuerza",
  "4ta_fuerza",
  "5ta_fuerza",
  "6ta_fuerza",
];

export const AccountControlsPanel: React.FC<AccountControlsPanelProps> = ({
  organizadorId,
  accountLabel,
  layout = "modal",
}) => {
  const [modes, setModes] = useState<Record<GameModeId, boolean> | null>(null);
  const [jugadores, setJugadores] = useState<AdminJugadorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingModes, setSavingModes] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newNombre, setNewNombre] = useState("");
  const [newCategoria, setNewCategoria] =
    useState<RivieraJugadorCategoria>("3ra_fuerza");
  const [addingJugador, setAddingJugador] = useState(false);
  const [busyJugadorId, setBusyJugadorId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [m, j] = await Promise.all([
        fetchOrganizadorGameModes(organizadorId),
        listJugadoresForAdmin(organizadorId),
      ]);
      setModes(m);
      setJugadores(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar controles");
    } finally {
      setLoading(false);
    }
  }, [organizadorId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const toggleMode = (modeId: GameModeId) => {
    if (!modes) return;
    setModes({ ...modes, [modeId]: !modes[modeId] });
  };

  const saveModes = async () => {
    if (!modes) return;
    setSavingModes(true);
    setError("");
    setNotice("");
    try {
      await upsertOrganizadorGameModes(organizadorId, modes);
      setNotice("Modos de juego guardados.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron guardar los modos");
    } finally {
      setSavingModes(false);
    }
  };

  const handleAddJugador = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNombre.trim()) return;
    setAddingJugador(true);
    setError("");
    try {
      await createJugadorForAdmin(organizadorId, {
        nombre: newNombre,
        categoria: newCategoria,
      });
      setNewNombre("");
      setNotice(`Jugador "${newNombre.trim()}" agregado.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo agregar el jugador");
    } finally {
      setAddingJugador(false);
    }
  };

  const patchJugador = async (
    jugador: AdminJugadorRow,
    patch: Parameters<typeof updateJugadorAdminControls>[1]
  ) => {
    setBusyJugadorId(jugador.id);
    setError("");
    try {
      await updateJugadorAdminControls(jugador.id, patch);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar el jugador");
    } finally {
      setBusyJugadorId(null);
    }
  };

  const handleRemoveJugador = async (jugador: AdminJugadorRow) => {
    if (
      !window.confirm(
        `¿Eliminar a "${jugador.nombre}" del registro? Se borra su historial de ranking.`
      )
    ) {
      return;
    }
    setBusyJugadorId(jugador.id);
    setError("");
    try {
      await removeJugadorForAdmin(organizadorId, jugador.id);
      setNotice(`Jugador "${jugador.nombre}" eliminado.`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar el jugador");
    } finally {
      setBusyJugadorId(null);
    }
  };

  if (loading) {
    return (
      <div
        className={`account-controls account-controls--loading${
          layout === "page" ? " account-controls--page" : ""
        }`}
      >
        Cargando controles de cuenta…
      </div>
    );
  }

  const modesSection = (
    <section className="account-controls__section" aria-labelledby="ac-modes-title">
      <h4 id="ac-modes-title" className="account-controls__title">
        Modos de juego
      </h4>
      <p className="account-controls__hint">
        Desactiva un modo para que esta cuenta no pueda usarlo en el inicio.
      </p>
      <ul className="account-controls__mode-list">
        {GAME_MODES.map((mode) => (
          <li key={mode.id} className="account-controls__mode-item">
            <label className="account-controls__toggle">
              <input
                type="checkbox"
                checked={modes?.[mode.id] !== false}
                onChange={() => toggleMode(mode.id)}
              />
              <span className="account-controls__toggle-label">
                {GAME_MODE_LABELS[mode.id]}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="account-controls__btn account-controls__btn--primary"
        onClick={() => void saveModes()}
        disabled={savingModes || !modes}
      >
        {savingModes ? "Guardando…" : "Guardar modos"}
      </button>
    </section>
  );

  const playersSection = (
    <section className="account-controls__section" aria-labelledby="ac-players-title">
      <h4 id="ac-players-title" className="account-controls__title">
        Jugadores del registro ({jugadores.length})
      </h4>
      <p className="account-controls__hint">
        &quot;Ranking&quot; controla si aparecen en el ranking público y si
        acumulan puntos en partidos nuevos.
      </p>

      <form className="account-controls__add-form" onSubmit={(e) => void handleAddJugador(e)}>
        <input
          type="text"
          className="account-controls__input"
          placeholder="Nombre del jugador"
          value={newNombre}
          onChange={(e) => setNewNombre(e.target.value)}
          disabled={addingJugador}
        />
        <select
          className="account-controls__select"
          value={newCategoria}
          onChange={(e) =>
            setNewCategoria(e.target.value as RivieraJugadorCategoria)
          }
          disabled={addingJugador}
        >
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>
              {c.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="account-controls__btn"
          disabled={addingJugador || !newNombre.trim()}
        >
          {addingJugador ? "Agregando…" : "Agregar jugador"}
        </button>
      </form>

      {jugadores.length === 0 ? (
        <p className="account-controls__empty">Sin jugadores en esta cuenta.</p>
      ) : (
        <ul className="account-controls__player-list">
          {jugadores.map((j) => {
            const busy = busyJugadorId === j.id;
            const archivado = j.estado === "archivado";
            return (
              <li
                key={j.id}
                className={`account-controls__player${
                  archivado ? " account-controls__player--archived" : ""
                }`}
              >
                <div className="account-controls__player-main">
                  <span className="account-controls__player-name">{j.nombre}</span>
                  <span className="account-controls__player-meta">
                    {j.categoria.replace(/_/g, " ")} · {j.puntos_totales} pts
                    {archivado ? " · archivado" : ""}
                  </span>
                </div>
                <div className="account-controls__player-actions">
                  <label className="account-controls__mini-toggle" title="Suma al ranking">
                    <input
                      type="checkbox"
                      checked={j.suma_ranking}
                      disabled={busy || archivado}
                      onChange={() =>
                        void patchJugador(j, { suma_ranking: !j.suma_ranking })
                      }
                    />
                    <span>Ranking</span>
                  </label>
                  <label className="account-controls__mini-toggle" title="Ficha pública">
                    <input
                      type="checkbox"
                      checked={j.visible_publico}
                      disabled={busy || archivado}
                      onChange={() =>
                        void patchJugador(j, {
                          visible_publico: !j.visible_publico,
                        })
                      }
                    />
                    <span>Público</span>
                  </label>
                  {!archivado ? (
                    <button
                      type="button"
                      className="account-controls__btn account-controls__btn--ghost"
                      disabled={busy}
                      onClick={() => void patchJugador(j, { estado: "archivado" })}
                    >
                      Archivar
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="account-controls__btn account-controls__btn--ghost"
                      disabled={busy}
                      onClick={() => void patchJugador(j, { estado: "activo" })}
                    >
                      Activar
                    </button>
                  )}
                  <button
                    type="button"
                    className="account-controls__btn account-controls__btn--danger"
                    disabled={busy}
                    onClick={() => void handleRemoveJugador(j)}
                  >
                    Quitar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <div
      className={`account-controls${
        layout === "page" ? " account-controls--page" : ""
      }`}
    >
      {layout === "modal" ? (
        <p className="account-controls__intro">
          Control maestro para <strong>{accountLabel}</strong>. Los cambios aplican
          de inmediato en la app de esta cuenta.
        </p>
      ) : null}

      {error ? (
        <div className="account-controls__banner account-controls__banner--error" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="account-controls__banner account-controls__banner--ok" role="status">
          {notice}
        </div>
      ) : null}

      {layout === "page" ? (
        <div className="account-controls__sections-grid">
          {modesSection}
          {playersSection}
        </div>
      ) : (
        <>
          {modesSection}
          {playersSection}
        </>
      )}
    </div>
  );
};
