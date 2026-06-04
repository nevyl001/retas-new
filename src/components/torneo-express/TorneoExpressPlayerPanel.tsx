import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPlayer,
  dedupeLegacyPlayersByName,
  deletePlayer,
  getPlayers,
  updatePlayer,
  type Player,
} from "../../lib/database";
import { dedupePlayersForSelect } from "../../lib/rivieraJugadores/playerNameKey";
import { ensureLegacyPlayerForRivieraJugador } from "../../lib/rivieraJugadores/playerPoolSync";
import type { RivieraJugador } from "../../lib/rivieraJugadores/types";
import {
  isValidRealEmail,
  playerHasNotifiableEmail,
  playerNeedsEmailContact,
  updatePlayerNotificationContact,
} from "../../services/torneoExpressNotificacionesService";
import type { ParejaDraft } from "./crearTorneoExpressTypes";
import { InscripcionParejaModal } from "./InscripcionParejaModal";
import { Button } from "../ui";
import { JugadorAutocomplete } from "../jugadores/JugadorAutocomplete";
import "../jugadores/riviera-jugadores.css";

type PlayerRow = Player & {
  email_verified?: boolean | null;
};

interface TorneoExpressPlayerPanelProps {
  userId: string;
  parejas: ParejaDraft[];
  onJugadoresChange: (jugadores: Player[]) => void;
}

export const TorneoExpressPlayerPanel: React.FC<TorneoExpressPlayerPanelProps> = ({
  userId,
  parejas,
  onJugadoresChange,
}) => {
  const [jugadores, setJugadores] = useState<Player[]>([]);
  const [cargandoJugadores, setCargandoJugadores] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [jugadorEditando, setJugadorEditando] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const [nuevoJugadorNombre, setNuevoJugadorNombre] = useState("");
  const [nuevoJugadorEmail, setNuevoJugadorEmail] = useState("");
  const [agregandoNuevo, setAgregandoNuevo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [contactModal, setContactModal] = useState<{
    playerId: string;
    playerName: string;
    email: string;
  } | null>(null);
  const [rivieraSeleccionado, setRivieraSeleccionado] =
    useState<RivieraJugador | null>(null);

  const syncJugadores = useCallback(
    (list: Player[]) => {
      const sorted = dedupePlayersForSelect(dedupeLegacyPlayersByName(list));
      setJugadores(sorted);
      onJugadoresChange(sorted);
    },
    [onJugadoresChange]
  );

  const cargarJugadores = useCallback(async () => {
    if (!userId) return;
    setCargandoJugadores(true);
    try {
      const data = await getPlayers(userId);
      syncJugadores(data ?? []);
    } catch {
      setError("No se pudieron cargar los jugadores");
    } finally {
      setCargandoJugadores(false);
    }
  }, [userId, syncJugadores]);

  useEffect(() => {
    cargarJugadores();
  }, [cargarJugadores]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 4000);
    return () => clearTimeout(t);
  }, [error]);

  const jugadoresFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return jugadores;
    return jugadores.filter((j) => j.name.toLowerCase().includes(q));
  }, [jugadores, busqueda]);

  const estaEnPareja = useCallback(
    (jugadorId: string) =>
      parejas.some(
        (p) => p.jugador1.id === jugadorId || p.jugador2.id === jugadorId
      ),
    [parejas]
  );

  const resetAddForm = () => {
    setNuevoJugadorNombre("");
    setNuevoJugadorEmail("");
    setRivieraSeleccionado(null);
    setAgregandoNuevo(false);
  };

  const agregarJugador = async () => {
    const nombre = nuevoJugadorNombre.trim();
    const email = nuevoJugadorEmail.trim();

    if (!nombre || !userId) return;

    if (!email || !isValidRealEmail(email)) {
      setError(
        "Ingresa un email real válido (no se permiten direcciones @padel.local)."
      );
      return;
    }

    const existe = jugadores.some(
      (j) => j.name.toLowerCase() === nombre.toLowerCase()
    );
    if (existe) {
      setError("Ya existe un jugador con ese nombre");
      return;
    }

    setGuardando(true);
    setError("");
    try {
      let base: Player;
      if (
        rivieraSeleccionado &&
        rivieraSeleccionado.nombre.trim().toLowerCase() === nombre.toLowerCase()
      ) {
        const linked = await ensureLegacyPlayerForRivieraJugador(
          userId,
          rivieraSeleccionado
        );
        if (!linked) {
          setError("No se pudo enlazar el jugador del registro");
          return;
        }
        base = linked;
      } else {
        base = await createPlayer(nombre, userId);
      }

      const updated = await updatePlayerNotificationContact(
        base.id,
        {
          email,
          notif_opt_in_email: true,
        },
        { autoNotifyEnrollment: false }
      );
      await cargarJugadores();
      resetAddForm();
    } catch {
      setError("Error al guardar el jugador");
    } finally {
      setGuardando(false);
    }
  };

  const iniciarEdicion = (jugador: Player) => {
    setJugadorEditando(jugador.id);
    setNombreEditado(jugador.name);
    setEliminandoId(null);
    setError("");
  };

  const cancelarEdicion = () => {
    setJugadorEditando(null);
    setNombreEditado("");
  };

  const editarJugador = async (jugador: Player) => {
    const nombre = nombreEditado.trim();
    if (!nombre || nombre === jugador.name) {
      cancelarEdicion();
      return;
    }

    const existe = jugadores.some(
      (j) =>
        j.id !== jugador.id && j.name.toLowerCase() === nombre.toLowerCase()
    );
    if (existe) {
      setError("Ya existe un jugador con ese nombre");
      return;
    }

    setGuardando(true);
    setError("");
    try {
      const data = await updatePlayer(jugador.id, nombre);
      syncJugadores(jugadores.map((j) => (j.id === jugador.id ? data : j)));
      cancelarEdicion();
    } catch {
      setError("Error al editar el jugador");
    } finally {
      setGuardando(false);
    }
  };

  const confirmarEliminar = (jugador: Player) => {
    setEliminandoId(jugador.id);
    setJugadorEditando(null);
    setError("");
  };

  const cancelarEliminar = () => setEliminandoId(null);

  const eliminarJugador = async (jugador: Player) => {
    if (estaEnPareja(jugador.id)) {
      setError(
        `No puedes eliminar a ${jugador.name} porque ya está asignado a una pareja en este torneo. Elimina primero la pareja.`
      );
      setEliminandoId(null);
      return;
    }

    setGuardando(true);
    setError("");
    try {
      await deletePlayer(jugador.id);
      syncJugadores(jugadores.filter((j) => j.id !== jugador.id));
      setEliminandoId(null);
    } catch {
      setError("Error al eliminar el jugador");
    } finally {
      setGuardando(false);
    }
  };

  const onAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void agregarJugador();
    }
    if (e.key === "Escape") {
      resetAddForm();
    }
  };

  const onEditKeyDown = (e: React.KeyboardEvent, jugador: Player) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void editarJugador(jugador);
    }
    if (e.key === "Escape") cancelarEdicion();
  };

  const abrirContacto = (jugador: PlayerRow) => {
    setContactModal({
      playerId: jugador.id,
      playerName: jugador.name,
      email: jugador.email ?? "",
    });
    setJugadorEditando(null);
    setEliminandoId(null);
    setError("");
  };

  const jugadoresSinEmail = useMemo(
    () => jugadores.filter((j) => playerNeedsEmailContact(j as PlayerRow)).length,
    [jugadores]
  );

  return (
    <aside className="te-players-panel torneo-express-card">
      <div className="te-players-panel__title-row">
        <h2 className="te-players-panel__title">
          <span className="te-players-panel__title-icon" aria-hidden>
            👥
          </span>
          Jugadores registrados
        </h2>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => {
            setAgregandoNuevo(true);
            setEliminandoId(null);
            setError("");
          }}
          disabled={agregandoNuevo || guardando}
        >
          + Nuevo
        </Button>
      </div>

      {error && (
        <div className="te-players-alert" role="alert">
          <span>⚠️ {error}</span>
          <button
            type="button"
            className="te-players-alert__close"
            onClick={() => setError("")}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
      )}

      <div className="torneo-express-field te-players-search">
        <label htmlFor="te-buscar-jugador" className="sr-only">
          Buscar jugador
        </label>
        <span className="te-players-search__icon" aria-hidden>
          🔍
        </span>
        <input
          id="te-buscar-jugador"
          type="search"
          placeholder="Buscar jugador…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          autoComplete="off"
        />
      </div>

      {agregandoNuevo && (
        <div className="te-players-add-form">
          <JugadorAutocomplete
            organizadorId={userId}
            value={nuevoJugadorNombre}
            onChange={(v) => {
              setNuevoJugadorNombre(v);
              setRivieraSeleccionado(null);
            }}
            onSelect={(rj) => {
              setRivieraSeleccionado(rj);
              setNuevoJugadorNombre(rj.nombre);
              if (rj.email && !rj.email.endsWith("@padel.local")) {
                setNuevoJugadorEmail(rj.email);
              }
            }}
          />
          <label className="te-players-add-form__label" htmlFor="te-nuevo-nombre">
            Nombre
          </label>
          <input
            id="te-nuevo-nombre"
            type="text"
            placeholder="Nombre del jugador"
            value={nuevoJugadorNombre}
            onChange={(e) => setNuevoJugadorNombre(e.target.value)}
            onKeyDown={onAddKeyDown}
            autoFocus
            disabled={guardando}
          />
          <label className="te-players-add-form__label" htmlFor="te-nuevo-email">
            Email real
          </label>
          <input
            id="te-nuevo-email"
            type="email"
            placeholder="email@ejemplo.com"
            value={nuevoJugadorEmail}
            onChange={(e) => setNuevoJugadorEmail(e.target.value)}
            onKeyDown={onAddKeyDown}
            disabled={guardando}
            autoComplete="email"
          />
          <div className="te-players-add-form__actions">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void agregarJugador()}
              disabled={
                guardando ||
                !nuevoJugadorNombre.trim() ||
                !nuevoJugadorEmail.trim()
              }
              loading={guardando}
            >
              Guardar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetAddForm}
              disabled={guardando}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <p className="te-players-panel__hint te-players-panel__hint--notif">
        Para notificar al crear el torneo, cada jugador necesita{" "}
        <strong>email real</strong>. Pulsa <strong>+ Nuevo</strong> o{" "}
        <strong>📧</strong> en quien ya esté en la lista.
      </p>

      <p className="te-players-list-meta">
        {cargandoJugadores
          ? "Cargando jugadores…"
          : `Lista (${jugadores.length} jugador${jugadores.length === 1 ? "" : "es"}${
              jugadoresSinEmail > 0
                ? ` · ${jugadoresSinEmail} sin email listo`
                : ""
            }${
              jugadoresFiltrados.length > 6
                ? " · desplázate en la lista ↓"
                : ""
            })`}
      </p>

      {cargandoJugadores ? (
        <ul className="te-players-skeleton" aria-busy="true">
          {[1, 2, 3, 4].map((i) => (
            <li key={i} className="te-players-skeleton__row" />
          ))}
        </ul>
      ) : jugadores.length === 0 ? (
        <p className="te-players-empty">No hay jugadores registrados aún</p>
      ) : jugadoresFiltrados.length === 0 ? (
        <p className="te-players-empty">
          No se encontró ningún jugador con ese nombre
        </p>
      ) : (
        <ul className="te-players-list">
          {jugadoresFiltrados.map((jugador) => {
            const editando = jugadorEditando === jugador.id;
            const confirmDelete = eliminandoId === jugador.id;

            if (confirmDelete) {
              return (
                <li key={jugador.id} className="te-players-row te-players-row--confirm">
                  <span>
                    ¿Eliminar <strong>{jugador.name}</strong>?
                  </span>
                  <div className="te-players-row__actions">
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => void eliminarJugador(jugador)}
                      disabled={guardando}
                      loading={guardando}
                    >
                      Sí, eliminar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={cancelarEliminar}
                      disabled={guardando}
                    >
                      Cancelar
                    </Button>
                  </div>
                </li>
              );
            }

            if (editando) {
              return (
                <li key={jugador.id} className="te-players-row te-players-row--edit">
                  <input
                    type="text"
                    value={nombreEditado}
                    onChange={(e) => setNombreEditado(e.target.value)}
                    onKeyDown={(e) => onEditKeyDown(e, jugador)}
                    autoFocus
                    disabled={guardando}
                    className="te-players-row__input"
                  />
                  <div className="te-players-row__actions">
                    <button
                      type="button"
                      className="te-players-icon-btn te-players-icon-btn--ok"
                      onClick={() => void editarJugador(jugador)}
                      disabled={guardando}
                      aria-label="Guardar"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      className="te-players-icon-btn"
                      onClick={cancelarEdicion}
                      disabled={guardando}
                      aria-label="Cancelar"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            }

            const row = jugador as PlayerRow;
            const emailOk = playerHasNotifiableEmail(row);

            return (
              <li
                key={jugador.id}
                className={`te-players-row${
                  !emailOk ? " te-players-row--sin-contacto" : ""
                }`}
              >
                <div className="te-players-row__main">
                  <span className="te-players-row__name">{jugador.name}</span>
                  <span
                    className={`te-players-row__contact-badge${
                      emailOk
                        ? " te-players-row__contact-badge--ok"
                        : " te-players-row__contact-badge--warn"
                    }`}
                    title={
                      emailOk
                        ? "Email listo para notificaciones"
                        : "Falta email real"
                    }
                  >
                    {emailOk ? "✉️ OK" : "⚠️ sin email"}
                  </span>
                </div>
                <div className="te-players-row__actions">
                  <button
                    type="button"
                    className="te-players-icon-btn te-players-icon-btn--contact"
                    onClick={() => abrirContacto(row)}
                    disabled={guardando}
                    aria-label={`Contacto de ${jugador.name}`}
                    title="Email de contacto"
                  >
                    📧
                  </button>
                  <button
                    type="button"
                    className="te-players-icon-btn"
                    onClick={() => iniciarEdicion(jugador)}
                    disabled={guardando}
                    aria-label={`Editar nombre de ${jugador.name}`}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    className="te-players-icon-btn te-players-icon-btn--danger"
                    onClick={() => confirmarEliminar(jugador)}
                    disabled={guardando}
                    aria-label={`Eliminar ${jugador.name}`}
                  >
                    🗑️
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <InscripcionParejaModal
        open={Boolean(contactModal)}
        playerId={contactModal?.playerId ?? ""}
        playerName={contactModal?.playerName ?? ""}
        initialEmail={contactModal?.email}
        onClose={() => setContactModal(null)}
        onSaved={(updated) => {
          if (updated) {
            syncJugadores(
              jugadores.map((j) =>
                j.id === updated.id
                  ? ({
                      ...j,
                      email: updated.email ?? j.email,
                      email_verified: updated.email_verified,
                    } as PlayerRow)
                  : j
              )
            );
          } else {
            void cargarJugadores();
          }
        }}
      />
    </aside>
  );
};
