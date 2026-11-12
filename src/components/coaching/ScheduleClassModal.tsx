import React, { useState, useEffect, useMemo, useRef } from "react";
import { Modal } from "../ui/Modal";
import { TablerIcon } from "../ui/TablerIcon";
import {
  scheduleCoachClass,
  fetchClubCoachDetail,
  generateCoachingIdempotencyKey,
} from "../../lib/coaching/coachingApi";
import type { ClubCoachDetailStudent } from "../../lib/coaching/types";

export interface ScheduleClassModalProps {
  open: boolean;
  onClose: () => void;
  organizadorId: string;
  coaches: Array<{
    id: string;
    nombre: string;
    coachCode?: string;
    fotoUrl?: string | null;
    membershipStatus?: string;
  }>;
  preselectedCoachId?: string;
  preselectedStudentId?: string;
  onSuccess: (sessionId: string) => void;
}

const DURATION_OPTIONS = [60, 90, 120];

const COURT_SUGGESTIONS = [
  "Cancha Central",
  "Cancha Techada",
  "Cancha 1",
  "Cancha 2",
  "Cancha 3",
];

export const ScheduleClassModal: React.FC<ScheduleClassModalProps> = ({
  open,
  onClose,
  organizadorId,
  coaches,
  preselectedCoachId,
  preselectedStudentId,
  onSuccess,
}) => {
  const activeCoaches = useMemo(
    () => coaches.filter((c) => c.membershipStatus === "ACTIVE" || !c.membershipStatus),
    [coaches]
  );

  const [coachId, setCoachId] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("");
  const [coachStudents, setCoachStudents] = useState<ClubCoachDetailStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState<boolean>(false);

  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("09:00");
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [court, setCourt] = useState<string>("");

  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const wasOpenRef = useRef(false);
  const idempotencyKeyRef = useRef<string>("");

  // Inicialización al abrir el modal
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setError(null);
      idempotencyKeyRef.current = generateCoachingIdempotencyKey("sched");
      const initialCoach =
        preselectedCoachId && activeCoaches.some((c) => c.id === preselectedCoachId)
          ? preselectedCoachId
          : activeCoaches[0]?.id || "";

      setCoachId(initialCoach);
      setStudentId(preselectedStudentId || "");

      // Fecha por defecto: hoy
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      setDate(`${yyyy}-${mm}-${dd}`);

      // Hora por defecto: siguiente hora redondeada
      const currentHour = now.getHours();
      const nextHour = (currentHour + 1) % 24;
      setTime(`${String(nextHour).padStart(2, "0")}:00`);

      setDurationMinutes(60);
      setCourt("");
    }
    wasOpenRef.current = open;
  }, [open, preselectedCoachId, preselectedStudentId, activeCoaches]);

  // Cargar alumnos asignados al coach seleccionado
  useEffect(() => {
    if (!open || !coachId) {
      setCoachStudents([]);
      return;
    }

    let isMounted = true;
    setLoadingStudents(true);

    fetchClubCoachDetail(organizadorId, coachId)
      .then((detail) => {
        if (!isMounted) return;
        setCoachStudents(detail.students || []);
        if (detail.students && detail.students.length > 0) {
          if (preselectedStudentId && detail.students.some((s) => s.jugadorId === preselectedStudentId)) {
            setStudentId(preselectedStudentId);
          } else {
            setStudentId((prev) =>
              detail.students.some((s) => s.jugadorId === prev) ? prev : detail.students[0].jugadorId
            );
          }
        } else {
          setStudentId("");
        }
      })
      .catch((err) => {
        console.error("[coaching] error loading coach students for schedule:", err);
      })
      .finally(() => {
        if (isMounted) setLoadingStudents(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open, coachId, organizadorId, preselectedStudentId]);

  const selectedStudent = useMemo(
    () => coachStudents.find((s) => s.jugadorId === studentId),
    [coachStudents, studentId]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!coachId) {
      setError("Selecciona el entrenador para la clase.");
      return;
    }
    if (!studentId) {
      setError("Selecciona el alumno asignado a este entrenador.");
      return;
    }
    if (!date || !time) {
      setError("Indica la fecha y hora de inicio de la clase.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const startsAtIso = new Date(`${date}T${time}:00`).toISOString();

      // Regla de producto: El club SOLO agenda la clase administrativa (fecha, hora, duración, pista).
      // El tema técnico y las notas pedagógicas son responsabilidad exclusiva del coach en su espacio.
      const res = await scheduleCoachClass({
        organizadorId,
        coachId,
        studentId,
        startsAt: startsAtIso,
        durationMinutes,
        court: court.trim() || null,
        focus: null,
        notes: null,
        idempotencyKey: idempotencyKeyRef.current || null,
      });

      if (res.sessionId) {
        onSuccess(res.sessionId);
      }
      onClose();
    } catch (err: any) {
      console.error("[coaching] error scheduling class:", err);
      setError(err?.message || "No se pudo agendar la clase.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Agendar clase"
      className="coach-portal-modal schedule-class-modal"
      size="md"
    >
      <form onSubmit={handleSubmit} className="schedule-class-form">
        <p className="schedule-modal-subtitle">
          Programa una sesión deportiva entre un entrenador activo y su alumno asignado. La preparación pedagógica y los objetivos técnicos serán definidos por el coach desde su espacio.
        </p>

        {/* Selector de Entrenador */}
        <div className="coaching-form-group">
          <label className="coaching-label" htmlFor="schedule-coach-select">
            Entrenador *
          </label>
          <select
            id="schedule-coach-select"
            className="coaching-input schedule-input"
            value={coachId}
            onChange={(e) => setCoachId(e.target.value)}
            disabled={saving}
          >
            {activeCoaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} {c.coachCode ? `(${c.coachCode})` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Selector de Alumno */}
        <div className="coaching-form-group">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
            <label className="coaching-label" htmlFor="schedule-student-select" style={{ margin: 0 }}>
              Alumno Asignado *
            </label>
            {selectedStudent && (
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: selectedStudent.balanceClasses > 0 ? "var(--coach-accent-green, #22c55e)" : "#f59e0b",
                  fontFamily: "var(--font-mono, monospace)",
                }}
              >
                {selectedStudent.balanceClasses}{" "}
                {selectedStudent.balanceClasses === 1 ? "clase disponible" : "clases disponibles"}
              </span>
            )}
          </div>

          {loadingStudents ? (
            <div style={{ fontSize: "0.85rem", color: "var(--coach-text-muted, #858588)", padding: "0.5rem 0" }}>
              Cargando alumnos asignados a este entrenador...
            </div>
          ) : coachStudents.length === 0 ? (
            <div
              style={{
                padding: "0.75rem",
                background: "rgba(245, 158, 11, 0.1)",
                border: "1px solid rgba(245, 158, 11, 0.25)",
                borderRadius: "8px",
                color: "#fef3c7",
                fontSize: "0.82rem",
              }}
            >
              Este entrenador aún no tiene alumnos asignados en tu club. Puedes asignarle un alumno desde la pestaña "Alumnos".
            </div>
          ) : (
            <select
              id="schedule-student-select"
              className="coaching-input schedule-input"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              disabled={saving}
            >
              {coachStudents.map((s) => (
                <option key={s.jugadorId} value={s.jugadorId}>
                  {s.nombre} ({s.rivieraId || "Sin ID"})
                </option>
              ))}
            </select>
          )}

          {selectedStudent && selectedStudent.balanceClasses <= 0 && (
            <div
              style={{
                fontSize: "0.8rem",
                color: "#fca5a5",
                background: "rgba(239, 68, 68, 0.12)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "8px",
                padding: "0.6rem 0.8rem",
                marginTop: "0.5rem",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              <TablerIcon name="alert-circle" size={16} /> El alumno no cuenta con clases disponibles para agendar. Asigna o abona clases antes de programar una cita.
            </div>
          )}
        </div>

        {/* Fecha y Hora de Inicio */}
        <div className="schedule-grid-2col">
          <div className="coaching-form-group">
            <label className="coaching-label" htmlFor="schedule-date-input">
              Fecha *
            </label>
            <input
              id="schedule-date-input"
              type="date"
              className="coaching-input schedule-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={saving}
              required
            />
          </div>

          <div className="coaching-form-group">
            <label className="coaching-label" htmlFor="schedule-time-input">
              Hora de Inicio *
            </label>
            <input
              id="schedule-time-input"
              type="time"
              className="coaching-input schedule-input"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={saving}
              required
            />
          </div>
        </div>

        {/* Duración de la clase */}
        <div className="coaching-form-group">
          <label className="coaching-label">Duración de la clase</label>
          <div className="schedule-duration-group">
            {DURATION_OPTIONS.map((mins) => (
              <button
                key={mins}
                type="button"
                className={`schedule-duration-chip ${durationMinutes === mins ? "schedule-duration-chip--active" : ""}`}
                onClick={() => setDurationMinutes(mins)}
                disabled={saving}
              >
                {mins} min
              </button>
            ))}
          </div>
        </div>

        {/* Cancha asignada (Opcional) */}
        <div className="coaching-form-group">
          <label className="coaching-label" htmlFor="schedule-court-input">
            Cancha asignada (Opcional)
          </label>
          <div className="schedule-court-suggestions">
            {COURT_SUGGESTIONS.map((c) => (
              <button
                key={c}
                type="button"
                className={`schedule-court-chip ${court === c ? "schedule-court-chip--active" : ""}`}
                onClick={() => setCourt(court === c ? "" : c)}
                disabled={saving}
              >
                {c}
              </button>
            ))}
          </div>
          <input
            id="schedule-court-input"
            type="text"
            className="coaching-input schedule-input"
            value={court}
            onChange={(e) => setCourt(e.target.value)}
            placeholder="Escribe el nombre de la cancha (ej. Central, Techada 1, Cancha 2…)"
            disabled={saving}
          />
        </div>

        {error && (
          <div className="coach-portal-alert coach-portal-alert--error" style={{ fontSize: "0.85rem" }}>
            <TablerIcon name="alert-circle" size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Botones de acción */}
        <div className="schedule-modal-actions">
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
            disabled={
              saving ||
              !coachId ||
              !studentId ||
              coachStudents.length === 0 ||
              (selectedStudent?.balanceClasses ?? 0) <= 0
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.45rem",
            }}
          >
            {saving ? (
              <>
                <TablerIcon name="loader" size={16} className="spin" /> Agendando...
              </>
            ) : (
              <>
                <TablerIcon name="calendar-plus" size={16} /> Agendar Clase
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
};
