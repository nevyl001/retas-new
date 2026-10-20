import React, { useState, useEffect, useRef } from "react";
import { Modal } from "../ui/Modal";
import { TablerIcon } from "../ui/TablerIcon";
import { rescheduleCoachClass } from "../../lib/coaching/coachingApi";
import type { CoachScheduledSession } from "../../lib/coaching/types";

export interface RescheduleClassModalProps {
  open: boolean;
  onClose: () => void;
  organizadorId: string;
  session: CoachScheduledSession | null;
  onSuccess: (sessionId: string) => void;
}

const DURATION_OPTIONS = [60, 90, 120];

export const RescheduleClassModal: React.FC<RescheduleClassModalProps> = ({
  open,
  onClose,
  organizadorId,
  session,
  onSuccess,
}) => {
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [court, setCourt] = useState<string>("");
  const [reason, setReason] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && session && !wasOpenRef.current) {
      setError(null);
      try {
        const d = new Date(session.startsAt);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        setDate(`${yyyy}-${mm}-${dd}`);

        const hh = String(d.getHours()).padStart(2, "0");
        const min = String(d.getMinutes()).padStart(2, "0");
        setTime(`${hh}:${min}`);
      } catch {
        setDate("");
        setTime("");
      }

      setDurationMinutes(session.durationMinutes || 60);
      setCourt(session.court || "");
      setReason("");
    }
    wasOpenRef.current = open;
  }, [open, session]);

  if (!session) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!date || !time) {
      setError("Indica la nueva fecha y hora para la clase.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const newStartsAtIso = new Date(`${date}T${time}:00`).toISOString();

      await rescheduleCoachClass({
        organizadorId,
        sessionId: session.id,
        newStartsAt: newStartsAtIso,
        durationMinutes,
        court: court.trim() || null,
        reason: reason.trim() || null,
      });

      onSuccess(session.id);
      onClose();
    } catch (err: any) {
      console.error("[coaching] error rescheduling class:", err);
      setError(err?.message || "No se pudo reprogramar la clase.");
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
    <Modal open={open} onClose={onClose} title="Reprogramar Clase Agendada">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.15rem" }}>
        {/* Contexto actual */}
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
              Horario Programado Anterior
            </span>
            <div style={{ color: "#fbbf24", fontSize: "0.88rem", fontWeight: 500 }}>
              {currentFormatted} {session.court ? `• ${session.court}` : ""}
            </div>
          </div>
        </div>

        {/* Nueva Fecha y Hora */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div className="coaching-form-group">
            <label className="coaching-label" htmlFor="reschedule-date-input">
              Nueva Fecha *
            </label>
            <input
              id="reschedule-date-input"
              type="date"
              className="coaching-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={saving}
              required
            />
          </div>

          <div className="coaching-form-group">
            <label className="coaching-label" htmlFor="reschedule-time-input">
              Nueva Hora *
            </label>
            <input
              id="reschedule-time-input"
              type="time"
              className="coaching-input"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={saving}
              required
            />
          </div>
        </div>

        {/* Duración */}
        <div className="coaching-form-group">
          <label className="coaching-label">Duración</label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {DURATION_OPTIONS.map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => setDurationMinutes(mins)}
                style={{
                  flex: 1,
                  padding: "0.5rem",
                  borderRadius: "8px",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  border:
                    durationMinutes === mins
                      ? "1px solid var(--ro-primary, #10b981)"
                      : "1px solid rgba(255,255,255,0.1)",
                  background: durationMinutes === mins ? "rgba(16, 185, 129, 0.15)" : "transparent",
                  color: durationMinutes === mins ? "var(--ro-primary, #10b981)" : "var(--ro-text-muted, #94a3b8)",
                  transition: "all 0.15s ease",
                }}
              >
                {mins} min
              </button>
            ))}
          </div>
        </div>

        {/* Cancha */}
        <div className="coaching-form-group">
          <label className="coaching-label" htmlFor="reschedule-court-input">
            Cancha
          </label>
          <input
            id="reschedule-court-input"
            type="text"
            className="coaching-input"
            value={court}
            onChange={(e) => setCourt(e.target.value)}
            placeholder="ej. Cancha 2, Cancha Central"
            disabled={saving}
          />
        </div>

        {/* Motivo de la reprogramación */}
        <div className="coaching-form-group">
          <label className="coaching-label" htmlFor="reschedule-reason-input">
            Motivo de reprogramación (Opcional)
          </label>
          <input
            id="reschedule-reason-input"
            type="text"
            className="coaching-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="ej. Cambio de horario solicitado por el alumno"
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
            disabled={saving || !date || !time}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            {saving ? (
              <>
                <TablerIcon name="loader" size={16} className="spin" /> Guardando...
              </>
            ) : (
              <>
                <TablerIcon name="calendar" size={16} /> Confirmar Reprogramación
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
