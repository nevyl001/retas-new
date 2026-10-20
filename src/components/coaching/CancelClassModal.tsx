import React, { useState, useEffect, useRef } from "react";
import { Modal } from "../ui/Modal";
import { TablerIcon } from "../ui/TablerIcon";
import { cancelCoachClass } from "../../lib/coaching/coachingApi";
import type { CoachScheduledSession } from "../../lib/coaching/types";

export interface CancelClassModalProps {
  open: boolean;
  onClose: () => void;
  organizadorId: string;
  session: CoachScheduledSession | null;
  onSuccess: (sessionId: string) => void;
}

const CANCEL_PRESETS = [
  "Cancelación solicitada por el alumno con previo aviso",
  "Condiciones climáticas adversas / Lluvia",
  "Incapacidad médica o imprevisto del entrenador",
  "Mantenimiento o indisponibilidad de la cancha",
  "Otro motivo específico",
];

export const CancelClassModal: React.FC<CancelClassModalProps> = ({
  open,
  onClose,
  organizadorId,
  session,
  onSuccess,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<string>(CANCEL_PRESETS[0]);
  const [customReason, setCustomReason] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && session && !wasOpenRef.current) {
      setError(null);
      setSelectedPreset(CANCEL_PRESETS[0]);
      setCustomReason("");
    }
    wasOpenRef.current = open;
  }, [open, session]);

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
      setError("Debes indicar el motivo de la cancelación.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await cancelCoachClass({
        organizadorId,
        sessionId: session.id,
        reason: finalReason,
      });

      onSuccess(session.id);
      onClose();
    } catch (err: any) {
      console.error("[coaching] error cancelling class:", err);
      setError(err?.message || "No se pudo cancelar la clase.");
    } finally {
      setSaving(false);
    }
  };

  const currentFormatted = (() => {
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
    <Modal open={open} onClose={onClose} title="Cancelar Clase Agendada">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.15rem" }}>
        {/* Banner informativo */}
        <div
          style={{
            padding: "0.85rem 1rem",
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            borderRadius: "10px",
            display: "flex",
            alignItems: "flex-start",
            gap: "0.75rem",
          }}
        >
          <TablerIcon name="info-circle" size={20} style={{ color: "#f87171", flexShrink: 0, marginTop: "2px" }} />
          <div style={{ fontSize: "0.82rem", color: "#fca5a5", lineHeight: 1.45 }}>
            El horario de la clase quedará libre. Dado que la clase no había sido impartida, el saldo de clases del alumno no se ve afectado.
          </div>
        </div>

        {/* Detalle de la clase */}
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
            {session.rivieraId && (
              <span style={{ fontSize: "0.75rem", color: "var(--ro-primary, #10b981)", fontFamily: "monospace" }}>
                {session.rivieraId}
              </span>
            )}
          </div>
          <div>
            <span style={{ fontSize: "0.72rem", color: "var(--ro-text-muted, #94a3b8)", textTransform: "uppercase" }}>
              Entrenador
            </span>
            <div style={{ fontWeight: 600, color: "var(--ro-text-main, #f8fafc)", fontSize: "0.95rem" }}>
              {session.coachNombre || "Entrenador"}
            </div>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <span style={{ fontSize: "0.72rem", color: "var(--ro-text-muted, #94a3b8)", textTransform: "uppercase" }}>
              Horario Programado
            </span>
            <div style={{ color: "var(--ro-text-main, #f8fafc)", fontSize: "0.88rem" }}>
              {currentFormatted} {session.court ? `• ${session.court}` : ""}
            </div>
          </div>
        </div>

        {/* Motivo de Cancelación */}
        <div className="coaching-form-group">
          <label className="coaching-label" htmlFor="cancel-reason-preset">
            Motivo de la cancelación (Obligatorio) *
          </label>
          <select
            id="cancel-reason-preset"
            className="coaching-input"
            value={selectedPreset}
            onChange={(e) => setSelectedPreset(e.target.value)}
            disabled={saving}
          >
            {CANCEL_PRESETS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="coaching-form-group">
          <label className="coaching-label" htmlFor="cancel-reason-custom">
            Comentarios adicionales
          </label>
          <input
            id="cancel-reason-custom"
            type="text"
            className="coaching-input"
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            placeholder="ej. Avisó con 4 horas de anticipación por lluvia torrencial"
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
            Volver
          </button>
          <button
            type="submit"
            className="coaching-btn-primary"
            disabled={saving}
            style={{
              background: "#dc2626",
              borderColor: "#b91c1c",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            {saving ? (
              <>
                <TablerIcon name="loader" size={16} className="spin" /> Cancelando...
              </>
            ) : (
              <>
                <TablerIcon name="calendar-x" size={16} /> Confirmar Cancelación
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
