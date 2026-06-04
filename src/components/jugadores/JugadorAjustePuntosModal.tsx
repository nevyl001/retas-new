import React, { useEffect, useState } from "react";
import { adjustRankingPuntosManual } from "../../lib/rivieraJugadores/rivieraJugadoresService";
import type { RivieraJugadorWithStats } from "../../lib/rivieraJugadores/types";

interface JugadorAjustePuntosModalProps {
  open: boolean;
  jugador: RivieraJugadorWithStats | null;
  organizadorId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export const JugadorAjustePuntosModal: React.FC<JugadorAjustePuntosModalProps> = ({
  open,
  jugador,
  organizadorId,
  onClose,
  onSaved,
}) => {
  const [delta, setDelta] = useState("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDelta("");
      setMotivo("");
      setError(null);
    }
  }, [open, jugador?.id]);

  if (!open || !jugador) return null;

  const puntosActuales = jugador.stats?.puntos_totales ?? 0;
  const deltaNum = delta.trim() === "" ? null : Number(delta);
  const deltaValid =
    deltaNum !== null && Number.isFinite(deltaNum) && Math.trunc(deltaNum) !== 0;
  const puntosNuevos =
    deltaValid && deltaNum !== null
      ? puntosActuales + Math.trunc(deltaNum)
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deltaValid || deltaNum === null) {
      setError("Escribe un número distinto de cero (positivo suma, negativo resta).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await adjustRankingPuntosManual(
        organizadorId,
        jugador.id,
        Math.trunc(deltaNum),
        motivo
      );
      await onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo guardar el ajuste"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rj-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="rj-modal"
        role="dialog"
        aria-labelledby="rj-ajuste-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="rj-ajuste-title">Ajustar puntos</h2>
        <p className="rj-modal__sub">{jugador.nombre}</p>
        <p className="rj-ajuste-actual">
          Puntos actuales:{" "}
          <strong>{puntosActuales.toLocaleString("es-MX")}</strong>
        </p>
        <form onSubmit={handleSubmit}>
          <div className="rj-field">
            <label htmlFor="rj-ajuste-delta">Puntos a sumar o restar</label>
            <input
              id="rj-ajuste-delta"
              type="number"
              step={1}
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="Ej. 50 o -20"
              autoFocus
              required
            />
            <p className="rj-field__hint">
              Número positivo suma; negativo resta del ranking.
            </p>
          </div>
          {puntosNuevos !== null && (
            <p className="rj-ajuste-preview">
              Nuevo total:{" "}
              <strong>{Math.max(0, puntosNuevos).toLocaleString("es-MX")}</strong>{" "}
              pts
            </p>
          )}
          <div className="rj-field">
            <label htmlFor="rj-ajuste-motivo">Nota (opcional)</label>
            <input
              id="rj-ajuste-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo del ajuste"
              maxLength={120}
            />
          </div>
          {error && (
            <p style={{ color: "#ff3b30", fontSize: "0.8125rem" }}>{error}</p>
          )}
          <div className="rj-modal__actions">
            <button
              type="button"
              className="rj-btn rj-btn--ghost"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="rj-btn rj-btn--primary"
              disabled={saving || !deltaValid}
            >
              {saving ? "Guardando…" : "Aplicar ajuste"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
