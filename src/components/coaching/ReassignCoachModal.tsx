import React, { useState, useEffect, useMemo, useRef } from "react";
import { Modal } from "../ui/Modal";
import { TablerIcon } from "../ui/TablerIcon";
import {
  reassignStudentCoach,
  generateCoachingIdempotencyKey,
} from "../../lib/coaching/coachingApi";
import type { CoachingCoach } from "../../lib/coaching/types";

interface ReassignCoachModalProps {
  open: boolean;
  onClose: () => void;
  organizadorId: string;
  student: {
    id: string; // jugadorId
    nombre: string;
    rivieraId?: string;
  } | null;
  fromCoach: {
    id: string;
    nombre: string;
    coachCode?: string;
  } | null;
  balanceClasses: number;
  coaches: CoachingCoach[];
  onSuccess: (
    studentName: string,
    toCoachName: string,
    transferredClasses: number
  ) => void;
}

export const ReassignCoachModal: React.FC<ReassignCoachModalProps> = ({
  open,
  onClose,
  organizadorId,
  student,
  fromCoach,
  balanceClasses,
  coaches,
  onSuccess,
}) => {
  // Entrenadores activos de destino (excluyendo al entrenador actual)
  const availableCoaches = useMemo(
    () =>
      coaches.filter(
        (c) => c.membershipStatus === "ACTIVE" && c.id !== fromCoach?.id
      ),
    [coaches, fromCoach?.id]
  );

  const [selectedCoachId, setSelectedCoachId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [operationKey, setOperationKey] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setError(null);
      setNotes("");
      setOperationKey(generateCoachingIdempotencyKey("reassign"));
      if (availableCoaches.length > 0) {
        setSelectedCoachId(availableCoaches[0].id);
      } else {
        setSelectedCoachId("");
      }
    }
    wasOpenRef.current = open;
  }, [open, availableCoaches]);

  useEffect(() => {
    if (open && !selectedCoachId && availableCoaches.length > 0) {
      setSelectedCoachId(availableCoaches[0].id);
    }
  }, [open, selectedCoachId, availableCoaches]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!student || !fromCoach) {
      setError("Datos del alumno o entrenador de origen no disponibles.");
      return;
    }
    if (!selectedCoachId) {
      setError("Selecciona el nuevo entrenador.");
      return;
    }

    const targetCoach = availableCoaches.find((c) => c.id === selectedCoachId);
    if (!targetCoach) {
      setError("El entrenador de destino no está activo en este club.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const effectiveKey =
        operationKey || generateCoachingIdempotencyKey("reassign");

      const res = await reassignStudentCoach(
        organizadorId,
        student.id,
        fromCoach.id,
        selectedCoachId,
        notes.trim() || undefined,
        effectiveKey
      );

      onSuccess(
        student.nombre,
        targetCoach.nombre,
        res.transferredClasses
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al cambiar de entrenador al alumno."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cambiar Entrenador"
      size="md"
    >
      <div className="coaching-modal-form" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {/* Resumen del Alumno y Entrenador Actual */}
        <div
          style={{
            background: "rgba(59, 130, 246, 0.08)",
            border: "1px solid rgba(59, 130, 246, 0.25)",
            borderRadius: "10px",
            padding: "1rem",
            fontSize: "0.88rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.6rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <span style={{ color: "var(--ro-text-muted, #94a3b8)" }}>Alumno:</span>
            <strong style={{ color: "#fff", display: "inline-flex", alignItems: "center", gap: "6px" }}>
              {student?.nombre || "—"}
              {student?.rivieraId && (
                <span className="coaching-badge coaching-badge--primary" style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                  {student.rivieraId}
                </span>
              )}
            </strong>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <span style={{ color: "var(--ro-text-muted, #94a3b8)" }}>Entrenador Actual:</span>
            <strong style={{ color: "#fff" }}>
              {fromCoach?.nombre || "—"} {fromCoach?.coachCode ? `(${fromCoach.coachCode})` : ""}
            </strong>
          </div>

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "0.6rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "var(--ro-text-muted, #94a3b8)" }}>Clases a transferir:</span>
            <span
              className="coaching-badge"
              style={{
                background: balanceClasses > 0 ? "rgba(34, 197, 94, 0.15)" : "rgba(255, 255, 255, 0.08)",
                color: balanceClasses > 0 ? "#4ade80" : "var(--ro-text-muted)",
                fontWeight: 700,
                fontSize: "0.85rem",
                padding: "0.3rem 0.6rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
              }}
            >
              <TablerIcon name="calendar-event" size={14} />
              {balanceClasses} {balanceClasses === 1 ? "clase" : "clases"}
            </span>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--ro-text-muted, #94a3b8)", lineHeight: 1.5 }}>
          Se transferirán exactamente <strong>{balanceClasses} clases pendientes</strong> al nuevo entrenador. Las sesiones impartidas con el entrenador anterior y sus comentarios quedarán conservados en su historial.
        </p>

        {/* Selector de Nuevo Entrenador */}
        <div className="coaching-form-group">
          <label className="coaching-label" htmlFor="new-coach-select">
            Nuevo Entrenador (Mismo Club) *
          </label>
          {availableCoaches.length === 0 ? (
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
              No hay otros entrenadores activos en este club para transferir al alumno.
            </div>
          ) : (
            <select
              id="new-coach-select"
              className="coaching-input"
              value={selectedCoachId}
              onChange={(e) => setSelectedCoachId(e.target.value)}
              disabled={saving}
            >
              {availableCoaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.coachCode})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Motivo de la reasignación */}
        <div className="coaching-form-group">
          <label className="coaching-label" htmlFor="reassign-notes-input">
            Motivo o Nota de Transferencia (Opcional)
          </label>
          <input
            id="reassign-notes-input"
            type="text"
            className="coaching-input"
            placeholder="ej. Cambio de horario solicitado por el alumno / Solicitud del club"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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

        {/* Botones de acción */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
          <button
            type="button"
            className="coaching-btn coaching-btn--secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="coaching-btn coaching-btn--primary"
            onClick={handleSubmit}
            disabled={saving || availableCoaches.length === 0 || !selectedCoachId}
          >
            {saving ? (
              <>
                <TablerIcon name="loader" size={16} className="coaching-spin" />
                Transfiriendo…
              </>
            ) : (
              <>
                <TablerIcon name="arrows-exchange" size={16} />
                Confirmar Cambio de Entrenador
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};
