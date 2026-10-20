import React, { useState, useEffect, useRef } from "react";
import { Modal } from "../ui/Modal";
import { TablerIcon } from "../ui/TablerIcon";
import { revertCoachClassSession } from "../../lib/coaching/coachingApi";

export interface RevertClassSessionModalProps {
  open: boolean;
  onClose: () => void;
  organizadorId: string;
  session: {
    id: string;
    startsAt: string;
    jugadorNombre?: string;
    coachNombre?: string;
    durationMinutes?: number | null;
    focus?: string | null;
  } | null;
  onSuccess: (sessionId: string, newBalance?: number) => void;
}

const REVERT_PRESETS = [
  "Sesión marcada como completada por error",
  "El alumno no se presentó y se acordó reprogramar",
  "Cancelación imprevista posterior al registro",
  "Prueba técnica o corrección administrativa",
  "Otro motivo específico",
];

export const RevertClassSessionModal: React.FC<RevertClassSessionModalProps> = ({
  open,
  onClose,
  organizadorId,
  session,
  onSuccess,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<string>(REVERT_PRESETS[0]);
  const [customReason, setCustomReason] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setError(null);
      setSelectedPreset(REVERT_PRESETS[0]);
      setCustomReason("");
    }
    wasOpenRef.current = open;
  }, [open]);

  if (!session) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const finalReason =
      selectedPreset === "Otro motivo específico"
        ? customReason.trim()
        : customReason.trim()
        ? `${selectedPreset} — ${customReason.trim()}`
        : selectedPreset;

    if (!finalReason) {
      setError("Debes indicar un motivo de reversión para la auditoría.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await revertCoachClassSession(organizadorId, session.id, finalReason);
      onSuccess(session.id, res.newBalance);
      onClose();
    } catch (err: any) {
      console.error("[coaching] error reverting class session:", err);
      setError(err?.message || "No se pudo revertir la sesión.");
    } finally {
      setSaving(false);
    }
  };

  const formattedDate = (() => {
    try {
      return new Date(session.startsAt).toLocaleString("es-MX", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return session.startsAt;
    }
  })();

  return (
    <Modal open={open} onClose={onClose} title="Revertir Clase Impartida">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {/* Banner explicativo */}
        <div
          style={{
            padding: "0.85rem 1rem",
            background: "rgba(245, 158, 11, 0.1)",
            border: "1px solid rgba(245, 158, 11, 0.3)",
            borderRadius: "10px",
            display: "flex",
            alignItems: "flex-start",
            gap: "0.75rem",
          }}
        >
          <TablerIcon name="alert-triangle" size={20} style={{ color: "#fbbf24", flexShrink: 0, marginTop: "2px" }} />
          <div style={{ fontSize: "0.82rem", color: "#fef3c7", lineHeight: 1.45 }}>
            <strong>Acción Compensatoria:</strong> Esta acción devolverá <strong>+1 clase</strong> al saldo disponible del alumno y descontará 1 del total de clases impartidas por el coach. Quedará registrada una compensación inmutable de auditoría.
          </div>
        </div>

        {/* Tarjeta de detalles de la sesión */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "10px",
            padding: "0.85rem 1rem",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.75rem",
          }}
        >
          <div>
            <span style={{ fontSize: "0.72rem", color: "var(--ro-text-muted, #94a3b8)", textTransform: "uppercase" }}>
              Alumno
            </span>
            <div style={{ fontWeight: 600, color: "var(--ro-text-main, #f8fafc)", fontSize: "0.95rem" }}>
              {session.jugadorNombre || "Alumno"}
            </div>
          </div>
          {session.coachNombre && (
            <div>
              <span style={{ fontSize: "0.72rem", color: "var(--ro-text-muted, #94a3b8)", textTransform: "uppercase" }}>
                Entrenador
              </span>
              <div style={{ fontWeight: 600, color: "var(--ro-text-main, #f8fafc)", fontSize: "0.95rem" }}>
                {session.coachNombre}
              </div>
            </div>
          )}
          <div>
            <span style={{ fontSize: "0.72rem", color: "var(--ro-text-muted, #94a3b8)", textTransform: "uppercase" }}>
              Fecha y Hora
            </span>
            <div style={{ color: "var(--ro-text-main, #f8fafc)", fontSize: "0.88rem" }}>
              {formattedDate}
            </div>
          </div>
          <div>
            <span style={{ fontSize: "0.72rem", color: "var(--ro-text-muted, #94a3b8)", textTransform: "uppercase" }}>
              Duración / Enfoque
            </span>
            <div style={{ color: "var(--ro-text-main, #f8fafc)", fontSize: "0.88rem" }}>
              {session.durationMinutes || 60} min {session.focus ? `• ${session.focus}` : ""}
            </div>
          </div>
        </div>

        {/* Motivo de la reversión */}
        <div className="coaching-form-group">
          <label className="coaching-label" htmlFor="revert-reason-preset">
            Motivo de la reversión (Obligatorio) *
          </label>
          <select
            id="revert-reason-preset"
            className="coaching-input"
            value={selectedPreset}
            onChange={(e) => setSelectedPreset(e.target.value)}
            disabled={saving}
          >
            {REVERT_PRESETS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="coaching-form-group">
          <label className="coaching-label" htmlFor="revert-reason-custom">
            Comentarios adicionales
          </label>
          <input
            id="revert-reason-custom"
            type="text"
            className="coaching-input"
            placeholder="ej. Clase registrada por error durante la captura"
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            disabled={saving}
          />
        </div>

        {error && (
          <div
            style={{
              padding: "0.75rem",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "8px",
              color: "#fca5a5",
              fontSize: "0.85rem",
            }}
          >
            {error}
          </div>
        )}

        {/* Botones */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
          <button
            type="button"
            className="coaching-btn-ghost"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="coaching-btn-primary"
            disabled={saving}
            style={{
              background: "#d97706",
              borderColor: "#b45309",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            {saving ? (
              <>
                <TablerIcon name="loader" size={16} className="spin" /> Revirtiendo...
              </>
            ) : (
              <>
                <TablerIcon name="rotate-2" size={16} /> Confirmar Reversión (+1 clase)
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
