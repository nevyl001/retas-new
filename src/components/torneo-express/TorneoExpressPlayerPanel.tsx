import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  dedupeLegacyPlayersById,
  getPlayers,
  type Player,
} from "../../lib/database";
import {
  dedupePlayersById,
  dedupePlayersForSelect,
} from "../../lib/rivieraJugadores/playerNameKey";
import {
  playerHasNotifiableEmail,
  playerNeedsEmailContact,
} from "../../services/torneoExpressNotificacionesService";
import { TE_CREATE_NOTIFS_ENABLED } from "../../lib/torneoExpress/teCreateNotifs";
import type { ParejaDraft } from "./crearTorneoExpressTypes";
import { InscripcionParejaModal } from "./InscripcionParejaModal";
import { TePlayerCard, type TePlayerCardPlayer } from "./TePlayerCard";
import { navigateJugadoresLista } from "../jugadores/jugadoresGeneroNav";
import { Button } from "../ui";
import "../jugadores/riviera-jugadores.css";

type PlayerRow = TePlayerCardPlayer & {
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

  const onJugadoresChangeRef = useRef(onJugadoresChange);
  onJugadoresChangeRef.current = onJugadoresChange;

  const syncJugadores = useCallback((list: Player[]) => {
    const sorted = dedupePlayersForSelect(
      dedupePlayersById(dedupeLegacyPlayersById(list))
    );
    setJugadores(sorted);
    onJugadoresChangeRef.current(sorted);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!userId) return;

    setCargandoJugadores(true);
    void (async () => {
      try {
        const data = await getPlayers(userId);
        if (cancelled) return;
        syncJugadores(data ?? []);
      } catch {
        if (!cancelled) setError("No se pudieron cargar los jugadores");
      } finally {
        if (!cancelled) setCargandoJugadores(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, syncJugadores]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 4000);
    return () => clearTimeout(t);
  }, [error]);

  const jugadoresFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return jugadores;
    return jugadores.filter((j) => {
      const row = j as PlayerRow;
      const nameHit = j.name.toLowerCase().includes(q);
      const idHit = (row.riviera_id ?? "").toLowerCase().includes(q);
      return nameHit || idHit;
    });
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
        <p className="te-players-panel__lead">
          Estos son tus jugadores del registro. Úsalos en el siguiente paso para
          armar parejas.
        </p>
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
          placeholder="Buscar por nombre o Riviera ID…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          autoComplete="off"
        />
      </div>

      {/* PENDIENTE: reactivar con TE_CREATE_NOTIFS_ENABLED */}
      {TE_CREATE_NOTIFS_ENABLED ? (
        <p className="te-players-panel__hint te-players-panel__hint--notif">
          Los jugadores se registran solo en{" "}
          <strong>Registro de jugadores</strong>. Aquí se listan los del registro
          para armar parejas. Para notificaciones necesitan{" "}
          <strong>email real</strong> (agrégalo en el registro o con 📧 si aún
          falta).
        </p>
      ) : null}

      <p className="te-players-list-meta">
        {cargandoJugadores
          ? "Cargando jugadores…"
          : `${jugadores.length} jugador${jugadores.length === 1 ? "" : "es"}${
              TE_CREATE_NOTIFS_ENABLED && jugadoresSinEmail > 0
                ? ` · ${jugadoresSinEmail} sin email listo`
                : ""
            }${
              jugadoresFiltrados.length > 8
                ? " · desplázate ↓"
                : ""
            }`}
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
          No se encontró ningún jugador con ese nombre o Riviera ID
        </p>
      ) : (
        <div className="te-players-grid" role="list">
          {jugadoresFiltrados.map((jugador) => {
            const row = jugador as PlayerRow;
            const emailOk = playerHasNotifiableEmail(row);

            return (
              <div key={jugador.id} className="te-players-grid__item" role="listitem">
                <TePlayerCard player={row} />
                {/* PENDIENTE: reactivar contacto email con TE_CREATE_NOTIFS_ENABLED */}
                {TE_CREATE_NOTIFS_ENABLED && !emailOk ? (
                  <button
                    type="button"
                    className="te-players-icon-btn te-players-icon-btn--contact te-players-grid__contact"
                    onClick={() => abrirContacto(row)}
                    aria-label={`Contacto de ${jugador.name}`}
                    title="Completar email de contacto"
                  >
                    📧
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de contacto: se mantiene montado para no perder el flujo pendiente */}
      <InscripcionParejaModal
        open={TE_CREATE_NOTIFS_ENABLED && Boolean(contactModal)}
        playerId={contactModal?.playerId ?? ""}
        playerName={contactModal?.playerName ?? ""}
        initialEmail={contactModal?.email ?? ""}
        onClose={() => setContactModal(null)}
        onSaved={() => {
          setContactModal(null);
          void getPlayers(userId).then((data) => syncJugadores(data ?? []));
        }}
      />
    </aside>
  );
};
