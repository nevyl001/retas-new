import React, { useCallback, useEffect, useState } from "react";
import {
  adminListOrganizerPlayerAccess,
  adminRevokeOrganizerPlayerAccess,
  type AdminPlayerAccessEntry,
} from "../../lib/rivieraJugadores/organizerPlayerAccess";
import "./PlayerAccessListModal.css";

interface PlayerAccessListModalProps {
  open: boolean;
  onClose: () => void;
  jugadorId: string;
  jugadorNombre: string;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}

export const PlayerAccessListModal: React.FC<PlayerAccessListModalProps> = ({
  open,
  onClose,
  jugadorId,
  jugadorNombre,
  onNotice,
  onError,
}) => {
  const [rows, setRows] = useState<AdminPlayerAccessEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminListOrganizerPlayerAccess(jugadorId);
      setRows(data);
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudieron cargar los accesos");
    } finally {
      setLoading(false);
    }
  }, [jugadorId, onError]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  if (!open) return null;

  const handleRevoke = async (entry: AdminPlayerAccessEntry) => {
    if (!entry.isActive) return;
    const ok = window.confirm(
      `¿Quitar acceso para ${entry.granteeName || entry.granteeEmail}? El jugador no se borrará ni se modificará su historial.`
    );
    if (!ok) return;
    setBusyId(entry.id);
    try {
      await adminRevokeOrganizerPlayerAccess(entry.id);
      onNotice("Acceso quitado");
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo quitar el acceso");
    } finally {
      setBusyId(null);
    }
  };

  const activeCount = rows.filter((r) => r.isActive).length;

  return (
    <div className="player-access-modal" role="dialog" aria-modal="true" aria-labelledby="player-access-title">
      <button
        type="button"
        className="player-access-modal__backdrop"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div className="player-access-modal__panel">
        <header className="player-access-modal__header">
          <div>
            <h2 id="player-access-title">Accesos concedidos</h2>
            <p className="player-access-modal__subtitle">{jugadorNombre}</p>
          </div>
          <button type="button" className="player-access-modal__close" onClick={onClose}>
            ×
          </button>
        </header>

        {loading ? (
          <p className="player-access-modal__empty">Cargando accesos…</p>
        ) : rows.length === 0 ? (
          <p className="player-access-modal__empty">
            Este jugador aún no tiene accesos concedidos a otros organizadores.
          </p>
        ) : (
          <>
            <p className="player-access-modal__meta">
              {activeCount} activo{activeCount === 1 ? "" : "s"} · {rows.length} en total
            </p>
            <ul className="player-access-modal__list">
              {rows.map((entry) => (
                <li key={entry.id} className="player-access-modal__row">
                  <div className="player-access-modal__row-main">
                    <span className="player-access-modal__row-name">
                      {entry.granteeName || "Organizador"}
                    </span>
                    <span className="player-access-modal__row-email">
                      {entry.granteeEmail}
                    </span>
                    <span
                      className={`player-access-modal__status${
                        entry.isActive
                          ? " player-access-modal__status--active"
                          : " player-access-modal__status--inactive"
                      }`}
                    >
                      {entry.isActive ? "Acceso concedido" : "Acceso inactivo"}
                    </span>
                    {entry.localJugadorId ? (
                      <span className="player-access-modal__hint">
                        Disponible para este organizador
                      </span>
                    ) : (
                      <span className="player-access-modal__hint">
                        Pendiente de primer uso en torneo
                      </span>
                    )}
                  </div>
                  {entry.isActive ? (
                    <button
                      type="button"
                      className="player-access-modal__revoke"
                      disabled={busyId === entry.id}
                      onClick={() => void handleRevoke(entry)}
                    >
                      {busyId === entry.id ? "Quitando…" : "Quitar acceso"}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}

        <footer className="player-access-modal__footer">
          <button
            type="button"
            className="player-access-modal__btn"
            onClick={onClose}
          >
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  );
};
