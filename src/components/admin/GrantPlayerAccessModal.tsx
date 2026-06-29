import React, { useCallback, useEffect, useState } from "react";
import {
  adminGrantOrganizerPlayerAccess,
  searchOrganizersForGrant,
  type AdminOrganizerOption,
} from "../../lib/rivieraJugadores/organizerPlayerAccess";
import "./GrantPlayerAccessModal.css";

interface GrantPlayerAccessModalProps {
  open: boolean;
  onClose: () => void;
  sourceOrganizadorId: string;
  jugadorIds: string[];
  jugadorLabels: string[];
  onGranted: (message: string) => void;
  onError: (message: string) => void;
}

export const GrantPlayerAccessModal: React.FC<GrantPlayerAccessModalProps> = ({
  open,
  onClose,
  sourceOrganizadorId,
  jugadorIds,
  jugadorLabels,
  onGranted,
  onError,
}) => {
  const [query, setQuery] = useState("");
  const [organizers, setOrganizers] = useState<AdminOrganizerOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadOrganizers = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await searchOrganizersForGrant(query, sourceOrganizadorId);
      setOrganizers(rows);
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudieron cargar organizadores");
    } finally {
      setLoading(false);
    }
  }, [query, sourceOrganizadorId, onError]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedId(null);
    void loadOrganizers();
  }, [open, loadOrganizers]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void loadOrganizers(), 250);
    return () => clearTimeout(t);
  }, [open, query, loadOrganizers]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!selectedId) {
      onError("Selecciona el organizador destino");
      return;
    }
    setSubmitting(true);
    try {
      const result = await adminGrantOrganizerPlayerAccess(
        jugadorIds,
        selectedId,
        false
      );
      const parts: string[] = [];
      if (result.granted > 0) {
        parts.push(
          `${result.granted} acceso${result.granted === 1 ? "" : "s"} concedido${result.granted === 1 ? "" : "s"}`
        );
      }
      if (result.reactivated > 0) {
        parts.push(`${result.reactivated} reactivado${result.reactivated === 1 ? "" : "s"}`);
      }
      if (result.skipped > 0) {
        parts.push(`${result.skipped} ya tenía acceso`);
      }
      onGranted(parts.join(" · ") || "Acceso actualizado");
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : "No se pudo otorgar acceso");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grant-access-modal" role="dialog" aria-modal="true" aria-labelledby="grant-access-title">
      <button
        type="button"
        className="grant-access-modal__backdrop"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div className="grant-access-modal__panel">
        <header className="grant-access-modal__header">
          <h2 id="grant-access-title">Otorgar acceso</h2>
          <button type="button" className="grant-access-modal__close" onClick={onClose}>
            ×
          </button>
        </header>

        <p className="grant-access-modal__intro">
          {jugadorIds.length === 1 ? (
            <>
              Jugador concedido: <strong>{jugadorLabels[0]}</strong>
            </>
          ) : (
            <>
              {jugadorIds.length} jugadores seleccionados para compartir con otro
              organizador.
            </>
          )}
        </p>

        <label className="grant-access-modal__label" htmlFor="grant-access-search">
          Organizador destino
        </label>
        <input
          id="grant-access-search"
          type="search"
          className="grant-access-modal__search"
          placeholder="Buscar por nombre o correo…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={submitting}
        />

        <ul className="grant-access-modal__list" aria-busy={loading}>
          {loading && organizers.length === 0 ? (
            <li className="grant-access-modal__empty">Buscando…</li>
          ) : null}
          {!loading && organizers.length === 0 ? (
            <li className="grant-access-modal__empty">Ningún organizador coincide.</li>
          ) : null}
          {organizers.map((org) => (
            <li key={org.id}>
              <button
                type="button"
                className={`grant-access-modal__option${
                  selectedId === org.id ? " grant-access-modal__option--selected" : ""
                }`}
                onClick={() => setSelectedId(org.id)}
                disabled={submitting}
              >
                <span className="grant-access-modal__option-name">{org.name}</span>
                <span className="grant-access-modal__option-email">{org.email}</span>
              </button>
            </li>
          ))}
        </ul>

        <footer className="grant-access-modal__footer">
          <button
            type="button"
            className="grant-access-modal__btn grant-access-modal__btn--ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="grant-access-modal__btn grant-access-modal__btn--primary"
            onClick={() => void handleSubmit()}
            disabled={submitting || !selectedId}
          >
            {submitting ? "Otorgando…" : "Otorgar acceso"}
          </button>
        </footer>
      </div>
    </div>
  );
};
