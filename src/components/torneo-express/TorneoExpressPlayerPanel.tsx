import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  dedupeLegacyPlayersByName,
  getPlayers,
  type Player,
} from "../../lib/database";
import {
  dedupePlayersById,
  dedupePlayersForSelect,
  normalizePlayerNameKey,
} from "../../lib/rivieraJugadores/playerNameKey";
import {
  playerHasNotifiableEmail,
  playerNeedsEmailContact,
} from "../../services/torneoExpressNotificacionesService";
import type { ParejaDraft } from "./crearTorneoExpressTypes";
import { InscripcionParejaModal } from "./InscripcionParejaModal";
import { navigateJugadoresLista } from "../jugadores/jugadoresGeneroNav";
import { Button } from "../ui";
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
  parejas: _parejas,
  onJugadoresChange,
}) => {
  const [jugadores, setJugadores] = useState<Player[]>([]);
  const [cargandoJugadores, setCargandoJugadores] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState("");
  const [contactModal, setContactModal] = useState<{
    playerId: string;
    playerName: string;
    email: string;
  } | null>(null);

  const syncJugadores = useCallback(
    (list: Player[]) => {
      const sorted = dedupePlayersForSelect(
        dedupePlayersById(dedupeLegacyPlayersByName(list))
      );
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

  const abrirContacto = (jugador: PlayerRow) => {
    setContactModal({
      playerId: jugador.id,
      playerName: jugador.name,
      email: jugador.email ?? "",
    });
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
          Jugadores del registro
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => navigateJugadoresLista("M")}
        >
          Ir al registro
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

      <p className="te-players-panel__hint te-players-panel__hint--notif">
        Los jugadores se registran solo en{" "}
        <strong>Registro de jugadores</strong>. Aquí se listan los del registro
        para armar parejas. Para notificaciones necesitan{" "}
        <strong>email real</strong> (agrégalo en el registro o con 📧 si aún
        falta).
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
        <div className="te-players-empty">
          <p>No hay jugadores en el registro.</p>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => navigateJugadoresLista("M")}
          >
            Registrar jugadores
          </Button>
        </div>
      ) : jugadoresFiltrados.length === 0 ? (
        <p className="te-players-empty">
          No se encontró ningún jugador con ese nombre
        </p>
      ) : (
        <ul className="te-players-list">
          {jugadoresFiltrados.map((jugador) => {
            const row = jugador as PlayerRow;
            const emailOk = playerHasNotifiableEmail(row);

            return (
              <li
                key={`${normalizePlayerNameKey(jugador.name)}-${jugador.id}`}
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
                        : "Falta email real en el registro"
                    }
                  >
                    {emailOk ? "✉️ OK" : "⚠️ sin email"}
                  </span>
                </div>
                <div className="te-players-row__actions">
                  {!emailOk ? (
                    <button
                      type="button"
                      className="te-players-icon-btn te-players-icon-btn--contact"
                      onClick={() => abrirContacto(row)}
                      aria-label={`Contacto de ${jugador.name}`}
                      title="Completar email de contacto"
                    >
                      📧
                    </button>
                  ) : null}
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
