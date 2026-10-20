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

const FOCUS_PRESETS = [
  "Bandeja y víbora",
  "Defensa de fondo y paredes",
  "Voleas y control de red",
  "Remate por 3 / Por 4",
  "Estrategia de juego y colocación",
  "Saque y resto",
  "Sesión de evaluación y técnica",
];

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
  const [focus, setFocus] = useState<string>(FOCUS_PRESETS[0]);
  const [customFocus, setCustomFocus] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const wasOpenRef = useRef(false);
  const idempotencyKeyRef = useRef<string>("");

  // Inicialización al abrir
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

      // Default date to today
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      setDate(`${yyyy}-${mm}-${dd}`);

      // Default time rounded to next hour
      const currentHour = now.getHours();
      const nextHour = (currentHour + 1) % 24;
      setTime(`${String(nextHour).padStart(2, "0")}:00`);

      setDurationMinutes(60);
      setCourt("");
      setFocus(FOCUS_PRESETS[0]);
      setCustomFocus("");
      setNotes("");
    }
    wasOpenRef.current = open;
  }, [open, preselectedCoachId, preselectedStudentId, activeCoaches]);

  // Cargar alumnos asociados al coach seleccionado
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

    const effectiveFocus =
      focus === "Otro" ? customFocus.trim() : customFocus.trim() ? `${focus} — ${customFocus.trim()}` : focus;

    setSaving(true);
    setError(null);

    try {
      const startsAtIso = new Date(`${date}T${time}:00`).toISOString();

      const res = await scheduleCoachClass({
        organizadorId,
        coachId,
        studentId,
        startsAt: startsAtIso,
        durationMinutes,
        court: court.trim() || null,
        focus: effectiveFocus || null,
        notes: notes.trim() || null,
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
    <Modal open={open} onClose={onClose} title="Agendar Clase de Coaching">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.15rem" }}>
        {/* Selector de Entrenador */}
        <div className="coaching-form-group">
          <label className="coaching-label" htmlFor="schedule-coach-select">
            Entrenador *
          </label>
          <select
            id="schedule-coach-select"
            className="coaching-input"
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label className="coaching-label" htmlFor="schedule-student-select">
              Alumno Asignado *
            </label>
            {selectedStudent && (
              <span
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  color: selectedStudent.balanceClasses > 0 ? "var(--ro-primary, #10b981)" : "#f59e0b",
                }}
              >
                {selectedStudent.balanceClasses}{" "}
                {selectedStudent.balanceClasses === 1 ? "clase disponible" : "clases disponibles"}
              </span>
            )}
          </div>

          {loadingStudents ? (
            <div style={{ fontSize: "0.85rem", color: "var(--ro-text-muted, #94a3b8)", padding: "0.5rem 0" }}>
              Cargando alumnos asignados a este entrenador...
            </div>
          ) : coachStudents.length === 0 ? (
            <div
              style={{
                padding: "0.75rem",
                background: "rgba(245, 158, 11, 0.1)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                borderRadius: "8px",
                color: "#fef3c7",
                fontSize: "0.82rem",
              }}
            >
              Este entrenador aún no tiene alumnos asignados en tu club. Puedes asignarle un alumno desde la pestaña
              "Alumnos".
            </div>
          ) : (
            <select
              id="schedule-student-select"
              className="coaching-input"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              disabled={saving}
            >
              {coachStudents.map((s) => (
                <option key={s.jugadorId} value={s.jugadorId}>
                  {s.nombre} ({s.rivieraId}) — {s.balanceClasses} {s.balanceClasses === 1 ? "clase" : "clases"} disp.
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

        {/* Fecha, Hora y Duración */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          <div className="coaching-form-group">
            <label className="coaching-label" htmlFor="schedule-date-input">
              Fecha *
            </label>
            <input
              id="schedule-date-input"
              type="date"
              className="coaching-input"
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
          <label className="coaching-label">Duración de la clase</label>
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
          <label className="coaching-label" htmlFor="schedule-court-input">
            Cancha asignada (Opcional)
          </label>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
            {COURT_SUGGESTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCourt(court === c ? "" : c)}
                style={{
                  padding: "0.3rem 0.6rem",
                  borderRadius: "6px",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  border: court === c ? "1px solid var(--ro-primary, #10b981)" : "1px solid rgba(255,255,255,0.08)",
                  background: court === c ? "rgba(16, 185, 129, 0.15)" : "rgba(255,255,255,0.03)",
                  color: court === c ? "var(--ro-primary, #10b981)" : "var(--ro-text-muted, #94a3b8)",
                }}
              >
                {c}
              </button>
            ))}
          </div>
          <input
            id="schedule-court-input"
            type="text"
            className="coaching-input"
            value={court}
            onChange={(e) => setCourt(e.target.value)}
            placeholder="Escribe el nombre de la cancha (ej. Central, Techada 1, Cancha 2…)"
            disabled={saving}
          />
        </div>

        {/* Tema / Enfoque */}
        <div className="coaching-form-group">
          <label className="coaching-label" htmlFor="schedule-focus-select">
            Objetivo o Tema del entrenamiento
          </label>
          <select
            id="schedule-focus-select"
            className="coaching-input"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            disabled={saving}
          >
            {FOCUS_PRESETS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
            <option value="Otro">Otro objetivo personalizado...</option>
          </select>
        </div>

        {focus === "Otro" && (
          <div className="coaching-form-group">
            <input
              type="text"
              className="coaching-input"
              value={customFocus}
              onChange={(e) => setCustomFocus(e.target.value)}
              placeholder="Describe el objetivo del entrenamiento..."
              disabled={saving}
              autoFocus
            />
          </div>
        )}

        {/* Notas adicionales */}
        <div className="coaching-form-group">
          <label className="coaching-label" htmlFor="schedule-notes-input">
            Notas de la clase (Opcional)
          </label>
          <textarea
            id="schedule-notes-input"
            className="coaching-input"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ej. Traer palas de prueba, calentar 10 minutos antes en gimnasio..."
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
              gap: "0.4rem",
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
