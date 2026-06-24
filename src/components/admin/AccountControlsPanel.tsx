import React, { useCallback, useEffect, useMemo, useState } from "react";
import { GAME_MODES, type GameModeId } from "../home/gameModesConfig";
import {
  bulkUpdateJugadoresAdminControls,
  createJugadorForAdmin,
  fetchOrganizadorAccountSettings,
  listJugadoresForAdmin,
  removeJugadorForAdmin,
  updateJugadorAdminControls,
  upsertOrganizadorAccountSettings,
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
  const [permiteAjustePuntos, setPermiteAjustePuntos] = useState(true);
  const [visibleRanking, setVisibleRanking] = useState(false);
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
  const [playerSearch, setPlayerSearch] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  const jugadoresFiltrados = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    if (!q) return jugadores;
    return jugadores.filter((j) => j.nombre.toLowerCase().includes(q));
  }, [jugadores, playerSearch]);

  const jugadoresEditables = useMemo(
    () => jugadoresFiltrados.filter((j) => j.estado !== "archivado"),
    [jugadoresFiltrados]
  );

  const publicoBulk = useMemo(() => {
    const n = jugadoresEditables.length;
    if (n === 0) return { all: false, some: false, count: 0 };
    const on = jugadoresEditables.filter((j) => j.visible_publico).length;
    return { all: on === n, some: on > 0 && on < n, count: on };
  }, [jugadoresEditables]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [settings, j] = await Promise.all([
        fetchOrganizadorAccountSettings(organizadorId),
        listJugadoresForAdmin(organizadorId),
      ]);
      setModes(settings.modes);
      setPermiteAjustePuntos(settings.permiteAjustePuntosManuales);
      setVisibleRanking(settings.visibleRankingOficial);
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

  const saveSettings = async () => {
    if (!modes) return;
    setSavingModes(true);
    setError("");
    setNotice("");
    try {
      await upsertOrganizadorAccountSettings(organizadorId, {
        modes,
        permiteAjustePuntosManuales: permiteAjustePuntos,
        visibleRankingOficial: visibleRanking,
      });
      setNotice("Configuración guardada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la configuración");
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

  const bulkPatchJugadores = async (
    patch: Parameters<typeof bulkUpdateJugadoresAdminControls>[2],
    label: string
  ) => {
    const ids = jugadoresEditables.map((j) => j.id);
    if (ids.length === 0) return;

    setBulkBusy(true);
    setError("");
    setNotice("");
    try {
      const n = await bulkUpdateJugadoresAdminControls(organizadorId, ids, patch);
      const scope =
        playerSearch.trim() && jugadoresFiltrados.length < jugadores.length
          ? ` (${n} visibles)`
          : "";
      setNotice(`${label}${scope}.`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar los jugadores");
    } finally {
      setBulkBusy(false);
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
      <div className="account-controls__permiso-block">
        <label className="account-controls__toggle account-controls__toggle--block">
          <input
            type="checkbox"
            checked={permiteAjustePuntos}
            onChange={() => setPermiteAjustePuntos((v) => !v)}
          />
          <span className="account-controls__toggle-label">
            Permitir ajuste manual de puntos
          </span>
        </label>
        <p className="account-controls__hint account-controls__hint--tight">
          Si lo desactivas, el club solo acumula puntos por partidos registrados
          en la app. No podrá sumar ni restar puntos con el lápiz del registro.
        </p>
      </div>
      <div className="account-controls__permiso-block">
        <label className="account-controls__toggle account-controls__toggle--block">
          <input
            type="checkbox"
            checked={visibleRanking}
            onChange={() => setVisibleRanking((v) => !v)}
          />
          <span className="account-controls__toggle-label">
            Publicar club en ranking oficial (rivieraopen.com)
          </span>
        </label>
        <p className="account-controls__hint account-controls__hint--tight">
          Habilita este club en <strong>www.rivieraopen.com/rankings</strong>.
          Cada jugador entra al ranking interno del club por defecto; solo aparece
          en el sitio oficial si activas «Sitio oficial» en ese jugador.
        </p>
      </div>
      <button
        type="button"
        className="account-controls__btn account-controls__btn--primary"
        onClick={() => void saveSettings()}
        disabled={savingModes || !modes}
      >
        {savingModes ? "Guardando…" : "Guardar configuración"}
      </button>
    </section>
  );

  const playersSection = (
    <section className="account-controls__section" aria-labelledby="ac-players-title">
      <h4 id="ac-players-title" className="account-controls__title">
        Jugadores del registro ({jugadores.length})
      </h4>
      <p className="account-controls__hint">
        El ranking interno del club incluye a todos los jugadores activos. En{" "}
        <strong>rivieraopen.com</strong> solo aparece quien tú actives con
        «Sitio oficial» (por defecto nadie se publica).
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
        <>
          <div className="account-controls__bulk-bar">
            <input
              type="search"
              className="account-controls__input account-controls__input--search"
              placeholder="Buscar jugador…"
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              disabled={bulkBusy}
              aria-label="Buscar jugador"
            />
            <p className="account-controls__bulk-meta">
              {jugadoresFiltrados.length === jugadores.length
                ? `${jugadores.length} jugadores`
                : `${jugadoresFiltrados.length} de ${jugadores.length} visibles`}
              {jugadoresEditables.length > 0 ? (
                <>
                  {" · "}
                  {publicoBulk.count}/{jugadoresEditables.length} en sitio oficial
                </>
              ) : null}
            </p>
            <div className="account-controls__bulk-actions">
              <label
                className="account-controls__bulk-toggle"
                title={
                  playerSearch.trim()
                    ? "Sitio oficial para todos los jugadores visibles"
                    : "Sitio oficial para todos los jugadores activos"
                }
              >
                <input
                  type="checkbox"
                  checked={publicoBulk.all}
                  ref={(el) => {
                    if (el) el.indeterminate = publicoBulk.some;
                  }}
                  disabled={bulkBusy || jugadoresEditables.length === 0}
                  onChange={() =>
                    void bulkPatchJugadores(
                      { visible_publico: !publicoBulk.all },
                      publicoBulk.all
                        ? "Quitados del sitio oficial"
                        : "Publicados en el sitio oficial"
                    )
                  }
                />
                <span>Todos en sitio oficial</span>
              </label>
            </div>
            <div className="account-controls__bulk-buttons">
              <button
                type="button"
                className="account-controls__btn account-controls__btn--ghost"
                disabled={bulkBusy || jugadoresEditables.length === 0}
                onClick={() =>
                  void bulkPatchJugadores(
                    { visible_publico: true },
                    "Todos publicados en el sitio oficial"
                  )
                }
              >
                Publicar todos
              </button>
              <button
                type="button"
                className="account-controls__btn account-controls__btn--ghost"
                disabled={bulkBusy || jugadoresEditables.length === 0}
                onClick={() =>
                  void bulkPatchJugadores(
                    { visible_publico: false },
                    "Todos quitados del sitio oficial"
                  )
                }
              >
                Quitar del sitio
              </button>
            </div>
          </div>

          <ul className="account-controls__player-list">
          {jugadoresFiltrados.map((j) => {
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
                  <label
                    className="account-controls__mini-toggle"
                    title="Publicar en rivieraopen.com (ranking interno siempre activo)"
                  >
                    <input
                      type="checkbox"
                      checked={j.visible_publico}
                      disabled={busy || archivado || bulkBusy}
                      onChange={() =>
                        void patchJugador(j, {
                          visible_publico: !j.visible_publico,
                        })
                      }
                    />
                    <span>Sitio oficial</span>
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
        {jugadoresFiltrados.length === 0 ? (
          <p className="account-controls__empty">Ningún jugador coincide con la búsqueda.</p>
        ) : null}
        </>
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
