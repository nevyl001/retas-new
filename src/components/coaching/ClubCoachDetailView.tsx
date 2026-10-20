import React, { useCallback, useEffect, useState } from "react";
import {
  fetchClubCoachDetail,
  updateCoachClubMembershipSettings,
  cancelCoachClubInvitation,
  updateCoachMembershipStatus,
  archiveCoachFromClub,
  unarchiveCoachFromClub,
  assignCoachClasses,
  removeCoachFromClub,
  generateCoachingIdempotencyKey,
  loadCoachingClubSnapshot,
  fetchClubCoachingAgenda,
} from "../../lib/coaching/coachingApi";
import {
  COACH_ESPECIALIDADES_ORDER,
  COACH_FUERZAS_ORDER,
} from "../../lib/coaching/constants";
import type {
  ClubCoachDetail,
  ClubCoachDetailStudent,
  CoachMembershipStatus,
  CoachingCoach,
  CoachScheduledSession,
} from "../../lib/coaching/types";
import type { RivieraJugadorCategoria } from "../../lib/rivieraJugadores/types";
import { JUGADOR_CATEGORIA_LABELS } from "../../lib/rivieraJugadores/constants";
import { TablerIcon } from "../ui/TablerIcon";
import { Modal } from "../ui/Modal";
import { AddStudentToCoachModal } from "./AddStudentToCoachModal";
import { ReassignCoachModal } from "./ReassignCoachModal";
import { AdjustClassBalanceModal } from "./AdjustClassBalanceModal";
import { RevertClassSessionModal } from "./RevertClassSessionModal";
import { ScheduleClassModal } from "./ScheduleClassModal";
import { RescheduleClassModal } from "./RescheduleClassModal";
import { CancelClassModal } from "./CancelClassModal";

interface ClubCoachDetailViewProps {
  organizadorId: string;
  coachId: string;
  clubName?: string;
  onBack: () => void;
  onCoachUpdated?: () => void;
}

type DetailTab = "resumen" | "alumnos" | "clases" | "agenda" | "seguimiento" | "historial";

export const ClubCoachDetailView: React.FC<ClubCoachDetailViewProps> = ({
  organizadorId,
  coachId,
  clubName,
  onBack,
  onCoachUpdated,
}) => {
  const [detail, setDetail] = useState<ClubCoachDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("resumen");
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Modales
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
  const [detailRemovalReason, setDetailRemovalReason] = useState("");
  const [assigningStudent, setAssigningStudent] = useState<ClubCoachDetailStudent | null>(null);
  const [reassigningStudent, setReassigningStudent] = useState<ClubCoachDetailStudent | null>(null);
  const [clubCoaches, setClubCoaches] = useState<CoachingCoach[]>([]);
  const [assignClassesCount, setAssignClassesCount] = useState<number>(10);
  const [assignClassesNotes, setAssignClassesNotes] = useState<string>("");
  const [assignIdempotencyKey, setAssignIdempotencyKey] = useState<string>("");

  // Ajustes de saldo y reversión de clases
  const [adjustingBalance, setAdjustingBalance] = useState<{
    coachId: string;
    coachNombre: string;
    studentId: string;
    studentNombre: string;
    rivieraId?: string;
    currentBalance: number;
    referenceLedgerId?: string | null;
  } | null>(null);

  const [revertingSession, setRevertingSession] = useState<{
    id: string;
    startsAt: string;
    jugadorNombre?: string;
    coachNombre?: string;
    durationMinutes?: number | null;
    focus?: string | null;
  } | null>(null);

  // Agenda del coach
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [reschedulingSession, setReschedulingSession] = useState<CoachScheduledSession | null>(null);
  const [cancellingSession, setCancellingSession] = useState<CoachScheduledSession | null>(null);
  const [coachAgendaSessions, setCoachAgendaSessions] = useState<CoachScheduledSession[]>([]);
  const [coachAgendaLoading, setCoachAgendaLoading] = useState(false);

  const loadCoachAgenda = useCallback(async () => {
    try {
      setCoachAgendaLoading(true);
      const list = await fetchClubCoachingAgenda({
        organizadorId,
        coachId,
      });
      setCoachAgendaSessions(list);
    } catch (e) {
      console.error("[coaching] error loading coach agenda:", e);
    } finally {
      setCoachAgendaLoading(false);
    }
  }, [organizadorId, coachId]);

  useEffect(() => {
    if (activeTab === "agenda") {
      void loadCoachAgenda();
    }
  }, [activeTab, loadCoachAgenda]);

  // Campos de edición local
  const [editFuerzas, setEditFuerzas] = useState<RivieraJugadorCategoria[]>([]);
  const [editEspecialidades, setEditEspecialidades] = useState<string[]>([]);
  const [editNotas, setEditNotas] = useState<string>("");
  const [editDisponibilidad, setEditDisponibilidad] = useState<string>("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, snap] = await Promise.all([
        fetchClubCoachDetail(organizadorId, coachId),
        loadCoachingClubSnapshot(organizadorId),
      ]);
      setDetail(data);
      setClubCoaches(snap.coaches);

      // Precargar datos de edición local
      const mem = data.membership;
      setEditFuerzas(
        mem.clubFuerzas && mem.clubFuerzas.length > 0
          ? mem.clubFuerzas
          : data.coach.fuerzas
      );
      setEditEspecialidades(
        mem.clubEspecialidades && mem.clubEspecialidades.length > 0
          ? mem.clubEspecialidades
          : data.coach.especialidades
      );
      setEditNotas(mem.clubNotas || "");
      setEditDisponibilidad(mem.clubDisponibilidad || "");
    } catch (err) {
      console.error("[coaching] error loading coach detail:", err);
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar la información del coach."
      );
    } finally {
      setLoading(false);
    }
  }, [organizadorId, coachId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Guardar configuración local del club
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await updateCoachClubMembershipSettings(organizadorId, coachId, {
        fuerzas: editFuerzas,
        especialidades: editEspecialidades,
        notas: editNotas.trim() || undefined,
        disponibilidad: editDisponibilidad.trim() || undefined,
      });
      setActionSuccess(res.message);
      setIsEditModalOpen(false);
      await loadData();
      if (onCoachUpdated) onCoachUpdated();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Error al guardar la configuración."
      );
    } finally {
      setBusy(false);
    }
  };

  // Cancelar invitación pendiente
  const handleCancelInvitation = async () => {
    if (!window.confirm("¿Seguro que deseas cancelar esta invitación? El coach no podrá activarse con este código.")) {
      return;
    }
    setBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await cancelCoachClubInvitation(organizadorId, coachId);
      setActionSuccess(res.message);
      setIsManageModalOpen(false);
      await loadData();
      if (onCoachUpdated) onCoachUpdated();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Error al cancelar la invitación."
      );
    } finally {
      setBusy(false);
    }
  };

  // Desvincular coach activo
  const handleDeactivate = async () => {
    if (
      !window.confirm(
        "¿Desvincular coach del club? El coach pasará a estado Inactivo. Se conservan todas las clases, alumnos y el historial de sesiones."
      )
    ) {
      return;
    }
    setBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await updateCoachMembershipStatus(organizadorId, coachId, "INACTIVE");
      setActionSuccess("Coach desvinculado del club exitosamente. El historial se mantiene intacto.");
      setIsManageModalOpen(false);
      await loadData();
      if (onCoachUpdated) onCoachUpdated();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Error al desvincular al coach."
      );
    } finally {
      setBusy(false);
    }
  };

  // Reincorporar coach inactivo o cancelado
  const handleReincorporate = async () => {
    setBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await updateCoachMembershipStatus(organizadorId, coachId, "ACTIVE");
      setActionSuccess("Solicitud de reincorporación registrada en estado PENDING para aceptación del coach.");
      setIsManageModalOpen(false);
      await loadData();
      if (onCoachUpdated) onCoachUpdated();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Error al solicitar reincorporación."
      );
    } finally {
      setBusy(false);
    }
  };

  // Archivar coach
  const handleArchive = async () => {
    if (
      !window.confirm(
        "¿Archivar coach? Se ocultará de la lista principal de entrenadores del club. Podrás desarchivarlo cuando lo requieras."
      )
    ) {
      return;
    }
    setBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await archiveCoachFromClub(organizadorId, coachId);
      setActionSuccess(res.message);
      setIsManageModalOpen(false);
      await loadData();
      if (onCoachUpdated) onCoachUpdated();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Error al archivar coach."
      );
    } finally {
      setBusy(false);
    }
  };

  // Desarchivar coach
  const handleUnarchive = async () => {
    setBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await unarchiveCoachFromClub(organizadorId, coachId);
      setActionSuccess(res.message);
      setIsManageModalOpen(false);
      await loadData();
      if (onCoachUpdated) onCoachUpdated();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Error al desarchivar coach."
      );
    } finally {
      setBusy(false);
    }
  };

  const openAssignModal = (st: ClubCoachDetailStudent) => {
    setAssigningStudent(st);
    setAssignClassesCount(10);
    setAssignClassesNotes("");
    setAssignIdempotencyKey(generateCoachingIdempotencyKey("assign"));
  };

  // Asignar clases a un alumno desde el panel
  const handleAssignClasses = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningStudent || assignClassesCount <= 0) return;
    setBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      await assignCoachClasses(
        organizadorId,
        assigningStudent.relationshipId,
        assignClassesCount,
        assignClassesNotes.trim() || undefined,
        assignIdempotencyKey || undefined
      );
      setActionSuccess(
        `Se asignaron +${assignClassesCount} clases a ${assigningStudent.nombre} exitosamente.`
      );
      setAssigningStudent(null);
      setAssignClassesCount(10);
      setAssignClassesNotes("");
      setAssignIdempotencyKey("");
      await loadData();
      if (onCoachUpdated) onCoachUpdated();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Error al asignar clases."
      );
    } finally {
      setBusy(false);
    }
  };

  // Eliminar coach de mi club de forma atómica e irreversible para el club
  const handleRemoveCoach = async () => {
    if (!organizadorId || !coachId) return;
    setBusy(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await removeCoachFromClub(
        organizadorId,
        coachId,
        detailRemovalReason.trim() || undefined
      );
      setActionSuccess(res.message || "Coach eliminado exitosamente del club.");
      setIsRemoveModalOpen(false);
      setDetailRemovalReason("");
      await loadData();
      if (onCoachUpdated) onCoachUpdated();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Error al eliminar coach de este club."
      );
    } finally {
      setBusy(false);
    }
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return "—";
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("es-MX", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const getStatusBadge = (status: CoachMembershipStatus) => {
    switch (status) {
      case "ACTIVE":
        return <span className="coaching-badge coaching-badge--active">Activo en tu club</span>;
      case "PENDING":
        return (
          <span className="coaching-badge coaching-badge--pending">
            <TablerIcon name="clock" size={13} />
            Invitación pendiente
          </span>
        );
      case "INACTIVE":
        return <span className="coaching-badge coaching-badge--inactive">Inactivo en tu club</span>;
      case "CANCELLED":
        return <span className="coaching-badge coaching-badge--inactive">Invitación cancelada</span>;
      case "ARCHIVED":
        return <span className="coaching-badge coaching-badge--neutral">Archivado</span>;
      case "REMOVED":
        return (
          <span
            className="coaching-badge"
            style={{
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#fca5a5",
            }}
          >
            <TablerIcon name="user-x" size={13} />
            Eliminado del club
          </span>
        );
      default:
        return <span className="coaching-badge coaching-badge--neutral">{status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="coaching-page rv-page">
        <header className="coaching-hero">
          <button type="button" className="coaching-back" onClick={onBack}>
            <TablerIcon name="arrow-left" size={16} />
            Volver a Coaches
          </button>
          <p className="coaching-kicker">Riviera Coaching · {clubName || "Club"}</p>
          <h1 className="coaching-title">Panel del Coach</h1>
          <p className="coaching-muted">Cargando expediente y actividad del entrenador…</p>
        </header>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="coaching-page rv-page">
        <header className="coaching-hero">
          <button type="button" className="coaching-back" onClick={onBack}>
            <TablerIcon name="arrow-left" size={16} />
            Volver a Coaches
          </button>
          <p className="coaching-kicker">Riviera Coaching</p>
          <h1 className="coaching-title">Panel del Coach</h1>
        </header>
        <div className="coaching-empty-card" style={{ border: "1px solid rgba(255, 71, 87, 0.3)" }}>
          <span style={{ color: "#ff6b81", display: "inline-flex" }}>
            <TablerIcon name="alert-circle" size={44} />
          </span>
          <h3>No se pudo cargar el panel del coach</h3>
          <p>{error || "Información no disponible."}</p>
          <button type="button" className="coaching-btn coaching-btn--primary" onClick={loadData}>
            <TablerIcon name="reload" size={16} />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const { coach, membership, club, students, sessions, ledger, auditLog, stats } = detail;
  const effectiveFuerzas =
    membership.clubFuerzas && membership.clubFuerzas.length > 0
      ? membership.clubFuerzas
      : coach.fuerzas;
  const effectiveEspecialidades =
    membership.clubEspecialidades && membership.clubEspecialidades.length > 0
      ? membership.clubEspecialidades
      : coach.especialidades;

  return (
    <div className="coaching-page rv-page">
      {/* ── HEADER Y NAVEGACIÓN PRINCIPAL ────────────────────────────── */}
      <header className="coaching-hero" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <button type="button" className="coaching-back" style={{ margin: 0 }} onClick={onBack}>
            <TablerIcon name="arrow-left" size={16} />
            Volver a Coaches
          </button>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="coaching-btn coaching-btn--secondary"
              onClick={() => setIsEditModalOpen(true)}
            >
              <TablerIcon name="edit" size={15} />
              Editar coach en club
            </button>
            <button
              type="button"
              className="coaching-btn coaching-btn--ghost"
              onClick={() => setIsManageModalOpen(true)}
            >
              <TablerIcon name="settings" size={15} />
              Gestionar acceso
            </button>
            {membership.status !== "REMOVED" ? (
              <button
                type="button"
                className="coaching-btn coaching-btn--ghost"
                style={{ color: "#f87171", borderColor: "rgba(239, 68, 68, 0.3)" }}
                onClick={() => setIsRemoveModalOpen(true)}
                title="Eliminar este coach de mi club"
              >
                <TablerIcon name="trash" size={15} />
                Eliminar coach de mi club
              </button>
            ) : null}
          </div>
        </div>

        {/* Banner si el coach fue eliminado de este club */}
        {membership.status === "REMOVED" && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "8px",
              padding: "0.85rem 1.25rem",
              marginBottom: "1rem",
              color: "#fca5a5",
              fontSize: "0.88rem",
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
            }}
          >
            <TablerIcon name="alert-circle" size={20} />
            <div>
              <strong>Entrenador eliminado de este club.</strong> Desvinculado el{" "}
              {formatDate(membership.removedAt)}
              {membership.removalReason ? ` (Motivo: "${membership.removalReason}")` : ""}.
              El historial de sesiones, alumnos y balances permanece íntegro y protegido.
            </div>
          </div>
        )}

        {/* Notificaciones de acción */}
        {actionSuccess && (
          <div className="coaching-demo-banner" style={{ border: "1px solid rgba(34, 197, 94, 0.3)", background: "rgba(34, 197, 94, 0.08)", marginBottom: "1rem" }}>
            <span style={{ color: "#4ade80", display: "inline-flex" }}>
              <TablerIcon name="check" size={18} />
            </span>
            <span style={{ color: "#4ade80", fontSize: "0.88rem", fontWeight: 600 }}>{actionSuccess}</span>
          </div>
        )}
        {actionError && (
          <div className="coaching-demo-banner" style={{ border: "1px solid rgba(255, 71, 87, 0.3)", background: "rgba(255, 71, 87, 0.08)", marginBottom: "1rem" }}>
            <span style={{ color: "#ff6b81", display: "inline-flex" }}>
              <TablerIcon name="alert-circle" size={18} />
            </span>
            <span style={{ color: "#ff6b81", fontSize: "0.88rem", fontWeight: 600 }}>{actionError}</span>
          </div>
        )}

        {/* Ficha de identidad del Coach */}
        <div className="coaching-student-header-grid" style={{ background: "rgba(255, 255, 255, 0.025)", border: "1px solid rgba(255, 255, 255, 0.08)", padding: "1.25rem 1.5rem", borderRadius: "12px" }}>
          <div className="coaching-student-coach-info">
            <div className="coaching-student-avatar" style={{ width: 64, height: 64, fontSize: "1.6rem" }}>
              {coach.fotoUrl ? (
                <img src={coach.fotoUrl} alt={coach.nombre} className="coaching-student-avatar-img" />
              ) : (
                <span>{coach.nombre.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div>
              <div className="coaching-student-coach-badge">
                <TablerIcon name="certificate" size={13} />
                <span>Coach Oficial</span>
                <span className="coaching-code-pill" style={{ letterSpacing: "0.04em" }}>{coach.coachCode}</span>
                {getStatusBadge(membership.status)}
              </div>
              <h1 className="coaching-title" style={{ margin: "0.2rem 0", fontSize: "1.75rem" }}>{coach.nombre}</h1>
              {coach.email && (
                <span style={{ fontSize: "0.84rem", color: "var(--ro-text-muted, rgba(255,255,255,0.6))" }}>
                  <span style={{ display: "inline-flex", verticalAlign: "middle", marginRight: 4 }}>
                    <TablerIcon name="mail" size={13} />
                  </span>
                  {coach.email}
                </span>
              )}
            </div>
          </div>

          <div className="coaching-student-club-info">
            <span className="coaching-student-club-eyebrow">Asociación de Club</span>
            <h3 className="coaching-student-club-name">
              <TablerIcon name="building-community" size={16} />
              {club.nombre}
            </h3>
            <span className="coaching-student-member-since">
              {membership.status === "PENDING"
                ? `Invitación emitida: ${formatDate(membership.invitedAt)}`
                : membership.activatedAt
                ? `Activo desde: ${formatDate(membership.activatedAt)}`
                : `Registrado: ${formatDate(membership.createdAt)}`}
            </span>
          </div>
        </div>
      </header>

      {/* ── MÉTRICAS CLAVE EN ESTE CLUB ────────────────────────────── */}
      <div className="coaching-student-metrics-grid" style={{ marginBottom: "1.5rem" }}>
        <div className="coaching-student-metric-card coaching-metric--active">
          <div className="coaching-metric-top">
            <span className="coaching-metric-label">Alumnos Activos</span>
            <TablerIcon name="users" size={16} />
          </div>
          <div className="coaching-metric-value">{stats.activeStudents}</div>
          <p className="coaching-metric-desc">Alumnos vinculados formalmente a este coach en tu club.</p>
        </div>

        <div className="coaching-student-metric-card coaching-metric--neutral">
          <div className="coaching-metric-top">
            <span className="coaching-metric-label">Clases Disponibles</span>
            <TablerIcon name="credit-card" size={16} />
          </div>
          <div className="coaching-metric-value">{stats.currentBalance}</div>
          <p className="coaching-metric-desc">Saldo vigente asignado por tu club pendiente de impartir.</p>
        </div>

        <div className="coaching-student-metric-card coaching-metric--neutral">
          <div className="coaching-metric-top">
            <span className="coaching-metric-label">Clases Impartidas</span>
            <TablerIcon name="check" size={16} />
          </div>
          <div className="coaching-metric-value">{stats.totalClassesGiven}</div>
          <p className="coaching-metric-desc">Sesiones presenciales impartidas en tus canchas.</p>
        </div>

        <div className="coaching-student-metric-card coaching-metric--neutral">
          <div className="coaching-metric-top">
            <span className="coaching-metric-label">Total Asignadas</span>
            <TablerIcon name="plus" size={16} />
          </div>
          <div className="coaching-metric-value">{stats.totalClassesAssigned}</div>
          <p className="coaching-metric-desc">Paquetes de clases autorizados por la administración.</p>
        </div>
      </div>

      {/* ── SUB-NAVEGACIÓN POR PESTAÑAS ────────────────────────────── */}
      <div className="coaching-tabs-wrap" style={{ marginBottom: "1.25rem" }}>
        <nav className="coaching-tabs" aria-label="Secciones del coach">
          <button
            type="button"
            className={`coaching-tab ${activeTab === "resumen" ? "is-active" : ""}`}
            onClick={() => setActiveTab("resumen")}
          >
            <TablerIcon name="layout-dashboard" size={16} />
            Resumen
          </button>
          <button
            type="button"
            className={`coaching-tab ${activeTab === "alumnos" ? "is-active" : ""}`}
            onClick={() => setActiveTab("alumnos")}
          >
            <TablerIcon name="users" size={16} />
            Alumnos ({students.length})
          </button>
          <button
            type="button"
            className={`coaching-tab ${activeTab === "clases" ? "is-active" : ""}`}
            onClick={() => setActiveTab("clases")}
          >
            <TablerIcon name="credit-card" size={16} />
            Clases y Saldos
          </button>
          <button
            type="button"
            className={`coaching-tab ${activeTab === "agenda" ? "is-active" : ""}`}
            onClick={() => setActiveTab("agenda")}
          >
            <TablerIcon name="calendar" size={16} />
            Agenda ({sessions.length})
          </button>
          <button
            type="button"
            className={`coaching-tab ${activeTab === "seguimiento" ? "is-active" : ""}`}
            onClick={() => setActiveTab("seguimiento")}
          >
            <TablerIcon name="target" size={16} />
            Seguimiento
          </button>
          <button
            type="button"
            className={`coaching-tab ${activeTab === "historial" ? "is-active" : ""}`}
            onClick={() => setActiveTab("historial")}
          >
            <TablerIcon name="history" size={16} />
            Historial ({ledger.length})
          </button>
        </nav>
      </div>

      {/* ── CONTENIDO POR PESTAÑA ──────────────────────────────────── */}

      {/* 1. RESUMEN */}
      {activeTab === "resumen" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.25rem" }}>
          {/* Configuración local del club */}
          <div className="coaching-student-relation-card" style={{ padding: "1.25rem" }}>
            <h3 style={{ margin: "0 0 1rem", fontSize: "1.05rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <TablerIcon name="adjustments" size={18} />
              Configuración en {club.nombre}
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", fontSize: "0.88rem" }}>
              <div>
                <span style={{ color: "var(--ro-text-muted, rgba(255,255,255,0.55))", display: "block", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.3rem" }}>
                  Fuerzas que entrena en tu club
                </span>
                <div className="coaching-card__tags">
                  {effectiveFuerzas.length > 0 ? (
                    effectiveFuerzas.map((f) => (
                      <span key={f} className="coaching-tag">
                        {JUGADOR_CATEGORIA_LABELS[f] || f}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: "var(--ro-text-muted)" }}>Sin especificar</span>
                  )}
                </div>
              </div>

              <div>
                <span style={{ color: "var(--ro-text-muted, rgba(255,255,255,0.55))", display: "block", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.3rem" }}>
                  Especialidades técnicas ofrecidas
                </span>
                <div className="coaching-card__tags">
                  {effectiveEspecialidades.length > 0 ? (
                    effectiveEspecialidades.map((esp) => (
                      <span key={esp} className="coaching-tag">
                        {esp}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: "var(--ro-text-muted)" }}>Sin especificar</span>
                  )}
                </div>
              </div>

              <div>
                <span style={{ color: "var(--ro-text-muted, rgba(255,255,255,0.55))", display: "block", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.2rem" }}>
                  Disponibilidad y Horarios
                </span>
                <p style={{ margin: 0, color: "var(--ro-text-secondary, #e0e0e0)" }}>
                  {membership.clubDisponibilidad || "Sin horarios registrados. Puedes configurarlos en 'Editar coach'."}
                </p>
              </div>

              <div>
                <span style={{ color: "var(--ro-text-muted, rgba(255,255,255,0.55))", display: "block", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.2rem" }}>
                  Notas internas del club
                </span>
                <p style={{ margin: 0, color: "var(--ro-text-secondary, #e0e0e0)", fontStyle: membership.clubNotas ? "normal" : "italic" }}>
                  {membership.clubNotas || "Sin notas internas registradas."}
                </p>
              </div>
            </div>
          </div>

          {/* Información global y estado */}
          <div className="coaching-student-relation-card" style={{ padding: "1.25rem" }}>
            <h3 style={{ margin: "0 0 1rem", fontSize: "1.05rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <TablerIcon name="shield-check" size={18} />
              Identidad Oficial Riviera Open
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", fontSize: "0.88rem" }}>
              <div>
                <span style={{ color: "var(--ro-text-muted)", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase" }}>Código Oficial Inmutable</span>
                <p style={{ margin: "0.15rem 0 0", fontWeight: 700, fontSize: "1.05rem", color: "var(--brand-accent, #38bdf8)" }}>
                  {coach.coachCode}
                </p>
              </div>

              <div>
                <span style={{ color: "var(--ro-text-muted)", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase" }}>Estado de la Asociación</span>
                <div style={{ marginTop: "0.25rem" }}>{getStatusBadge(membership.status)}</div>
              </div>

              {coach.bio && (
                <div>
                  <span style={{ color: "var(--ro-text-muted)", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase" }}>Biografía / Perfil</span>
                  <p style={{ margin: "0.15rem 0 0", color: "var(--ro-text-secondary)" }}>{coach.bio}</p>
                </div>
              )}

              {coach.certificaciones && (
                <div>
                  <span style={{ color: "var(--ro-text-muted)", fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase" }}>Certificaciones</span>
                  <p style={{ margin: "0.15rem 0 0", color: "var(--ro-text-secondary)" }}>{coach.certificaciones}</p>
                </div>
              )}

              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "0.75rem", display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--ro-text-muted)" }}>
                <span>Fecha de alta global:</span>
                <span>{formatDate(coach.createdAt)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. ALUMNOS */}
      {activeTab === "alumnos" && (
        <section className="coaching-panel" style={{ padding: "1.25rem", background: "rgba(255,255,255,0.02)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="coaching-section-header" style={{ marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <h2 className="coaching-section-title" style={{ fontSize: "1.2rem" }}>Alumnos en {club.nombre}</h2>
              <p className="coaching-section-desc">Jugadores vinculados oficialmente a este entrenador dentro de tu academia.</p>
            </div>
            {membership.status === "ACTIVE" ? (
              <button
                type="button"
                className="coaching-btn coaching-btn--primary"
                style={{ fontSize: "0.85rem" }}
                onClick={() => setIsAddStudentModalOpen(true)}
              >
                <TablerIcon name="user-plus" size={15} />
                Agregar alumno
              </button>
            ) : null}
          </div>

          {students.length === 0 ? (
            <div className="coaching-empty-card">
              <TablerIcon name="users" size={40} className="coaching-empty-icon" />
              <h3>Sin alumnos vinculados en este club</h3>
              <p>El entrenador aún no tiene alumnos asignados en tu club. Como administrador, puedes asignarle un alumno mediante su Riviera ID oficial y recargar su paquete de clases.</p>
              {membership.status === "ACTIVE" ? (
                <button
                  type="button"
                  className="coaching-btn coaching-btn--primary"
                  style={{ marginTop: "1rem", fontSize: "0.85rem" }}
                  onClick={() => setIsAddStudentModalOpen(true)}
                >
                  <TablerIcon name="user-plus" size={15} />
                  Asignar alumno a este coach
                </button>
              ) : null}
            </div>
          ) : (
            <div className="coaching-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
              {students.map((st) => (
                <div key={st.relationshipId} className="coaching-card" style={{ padding: "1.1rem" }}>
                  <div className="coaching-card__top">
                    <div className="coaching-card__avatar">
                      {st.fotoUrl ? (
                        <img src={st.fotoUrl} alt={st.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        st.nombre.slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div className="coaching-card__identity">
                      <h4 className="coaching-card__title">{st.nombre}</h4>
                      {st.rivieraId && <span className="coaching-card__code">{st.rivieraId}</span>}
                      <span className="coaching-card__meta-item">
                        {st.categoria ? JUGADOR_CATEGORIA_LABELS[st.categoria as RivieraJugadorCategoria] || st.categoria : "Sin categoría"}
                      </span>
                    </div>
                    <span className={`coaching-status-pill ${st.balanceClasses > 0 ? "pill--success" : "pill--warning"}`}>
                      {st.balanceClasses > 0 ? `${st.balanceClasses} clases disp.` : "Sin saldo"}
                    </span>
                  </div>

                  <div style={{ margin: "0.85rem 0", display: "flex", justifyContent: "space-between", background: "rgba(255,255,255,0.03)", padding: "0.5rem 0.75rem", borderRadius: "6px", fontSize: "0.82rem" }}>
                    <span>Impartidas: <strong>{st.totalClassesGiven}</strong></span>
                    <span>Vinculado: <strong>{formatDate(st.startedAt).split(",")[0]}</strong></span>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      type="button"
                      className="coaching-btn coaching-btn--primary"
                      style={{ flex: 1, padding: "0.45rem 0.75rem", fontSize: "0.82rem" }}
                      onClick={() => openAssignModal(st)}
                    >
                      <TablerIcon name="plus" size={14} />
                      Asignar clases
                    </button>
                    <button
                      type="button"
                      className="coaching-btn coaching-btn--secondary"
                      style={{ padding: "0.45rem 0.75rem", fontSize: "0.82rem" }}
                      onClick={() => setReassigningStudent(st)}
                      title="Cambiar a otro entrenador del club"
                    >
                      <TablerIcon name="arrows-exchange" size={14} />
                      Cambiar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 3. CLASES Y SALDOS */}
      {activeTab === "clases" && (
        <section className="coaching-panel" style={{ padding: "1.25rem", background: "rgba(255,255,255,0.02)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="coaching-section-header" style={{ marginBottom: "1rem" }}>
            <div>
              <h2 className="coaching-section-title" style={{ fontSize: "1.2rem" }}>Balance de Clases</h2>
              <p className="coaching-section-desc">Control administrativo de paquetes asignados por el club y sesiones impartidas por el coach.</p>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", color: "var(--ro-text-muted)" }}>
                  <th style={{ padding: "0.75rem 1rem" }}>Alumno</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Riviera ID</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Clases Disponibles</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Clases Impartidas</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "right" }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {students.map((st) => (
                  <tr key={st.relationshipId} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>{st.nombre}</td>
                    <td style={{ padding: "0.75rem 1rem", fontFamily: "monospace" }}>{st.rivieraId || "—"}</td>
                    <td style={{ padding: "0.75rem 1rem", textAlign: "center", fontWeight: 700, color: st.balanceClasses > 0 ? "#4ade80" : "#ffb86c" }}>
                      {st.balanceClasses}
                    </td>
                    <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>{st.totalClassesGiven}</td>
                    <td style={{ padding: "0.75rem 1rem", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        className="coaching-btn coaching-btn--secondary"
                        style={{ padding: "0.35rem 0.65rem", fontSize: "0.78rem", marginRight: "0.4rem" }}
                        onClick={() => openAssignModal(st)}
                      >
                        <TablerIcon name="plus" size={13} />
                        Recargar
                      </button>
                      <button
                        type="button"
                        className="coaching-btn coaching-btn--secondary"
                        style={{ padding: "0.35rem 0.65rem", fontSize: "0.78rem", marginRight: "0.4rem" }}
                        onClick={() => {
                          if (!detail) return;
                          setAdjustingBalance({
                            coachId: detail.coach.id,
                            coachNombre: detail.coach.nombre,
                            studentId: st.jugadorId,
                            studentNombre: st.nombre,
                            rivieraId: st.rivieraId,
                            currentBalance: st.balanceClasses,
                            referenceLedgerId: null,
                          });
                        }}
                        title="Corregir saldo de clases por error de captura o ajuste"
                      >
                        <TablerIcon name="adjustments" size={13} />
                        Ajustar
                      </button>
                      <button
                        type="button"
                        className="coaching-btn coaching-btn--secondary"
                        style={{ padding: "0.35rem 0.65rem", fontSize: "0.78rem" }}
                        onClick={() => setReassigningStudent(st)}
                        title="Cambiar a otro entrenador del club"
                      >
                        <TablerIcon name="arrows-exchange" size={13} />
                        Cambiar
                      </button>
                    </td>
                  </tr>
                ))}
                {students.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "var(--ro-text-muted)" }}>
                      No hay registros de alumnos ni saldos para este entrenador en tu club.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 4. AGENDA Y SESIONES */}
      {activeTab === "agenda" && (
        <section className="coaching-panel" style={{ padding: "1.25rem", background: "rgba(255,255,255,0.02)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="coaching-section-header" style={{ marginBottom: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <h2 className="coaching-section-title" style={{ fontSize: "1.2rem" }}>Agenda de Clases</h2>
              <p className="coaching-section-desc">Historial y programación de sesiones con {detail.coach.nombre}.</p>
            </div>
            <button
              type="button"
              className="coaching-btn coaching-btn--primary"
              onClick={() => setIsScheduleModalOpen(true)}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
            >
              <TablerIcon name="calendar-plus" size={16} />
              Agendar Clase
            </button>
          </div>

          {/* Indicador de carga */}
          {coachAgendaLoading && (
            <div style={{ padding: "0.75rem", textAlign: "center", color: "var(--ro-text-muted)", fontSize: "0.85rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
              <TablerIcon name="loader" size={16} className="spin" /> Actualizando agenda del coach...
            </div>
          )}

          {/* Sesiones Agendadas (Próximas) */}
          {coachAgendaSessions.filter((s) => s.status === "SCHEDULED").length > 0 && (
            <div style={{ marginBottom: "1.5rem" }}>
              <h3 style={{ fontSize: "0.95rem", color: "var(--ro-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.6rem" }}>
                Clases Programadas ({coachAgendaSessions.filter((s) => s.status === "SCHEDULED").length})
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {coachAgendaSessions
                  .filter((s) => s.status === "SCHEDULED")
                  .map((ses) => (
                    <div
                      key={ses.id}
                      style={{
                        background: "rgba(16, 185, 129, 0.04)",
                        border: "1px solid rgba(16, 185, 129, 0.2)",
                        borderRadius: "10px",
                        padding: "0.85rem 1rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "0.75rem",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--ro-text-main)" }}>
                            {formatDate(ses.startsAt)}
                          </span>
                          <span style={{ fontSize: "0.75rem", color: "var(--ro-text-muted)" }}>
                            ({ses.durationMinutes} min {ses.court ? `• ${ses.court}` : ""})
                          </span>
                        </div>
                        <div style={{ fontSize: "0.85rem", marginTop: "0.2rem" }}>
                          Alumno: <strong>{ses.jugadorNombre}</strong>{" "}
                          {ses.rivieraId && (
                            <span style={{ fontSize: "0.75rem", color: "var(--ro-primary, #10b981)", fontFamily: "monospace" }}>
                              ({ses.rivieraId})
                            </span>
                          )}
                          {ses.focus && <span style={{ color: "var(--ro-brand, #38bdf8)", marginLeft: "0.5rem" }}>• {ses.focus}</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                          type="button"
                          className="coaching-btn coaching-btn--secondary"
                          style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                          onClick={() => setReschedulingSession(ses)}
                        >
                          <TablerIcon name="calendar" size={13} />
                          Reprogramar
                        </button>
                        <button
                          type="button"
                          className="coaching-btn coaching-btn--ghost"
                          style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem", color: "#f87171" }}
                          onClick={() => setCancellingSession(ses)}
                        >
                          <TablerIcon name="calendar-x" size={13} />
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Historial de Sesiones Impartidas */}
          <div>
            <h3 style={{ fontSize: "0.95rem", color: "var(--ro-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.6rem" }}>
              Sesiones Impartidas ({sessions.length})
            </h3>
            {sessions.length === 0 ? (
              <div className="coaching-empty-card">
                <TablerIcon name="calendar" size={40} className="coaching-empty-icon" />
                <h3>Sin sesiones registradas aún</h3>
                <p>El entrenador aún no tiene clases impartidas con sus alumnos en tu club.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {sessions.map((ses) => {
                  const isCompleted = ses.status === "COMPLETED";
                  return (
                    <div key={ses.id} className="coaching-ledger-row">
                      <div className="coaching-ledger-row__left">
                        <span className={`coaching-ledger-badge ${isCompleted ? "badge--session" : "badge--neutral"}`}>
                          <TablerIcon name="check" size={13} />
                          {isCompleted ? "Clase Impartida" : "Sesión"}
                        </span>
                        <span className="coaching-ledger-date">{formatDate(ses.startsAt)}</span>
                        {ses.durationMinutes && (
                          <span style={{ fontSize: "0.75rem", color: "var(--ro-text-muted)" }}>
                            Duración: {ses.durationMinutes} min
                          </span>
                        )}
                      </div>
                      <div className="coaching-ledger-row__details">
                        <p style={{ margin: "0 0 0.25rem", fontWeight: 700, fontSize: "0.92rem" }}>
                          Alumno: {ses.jugadorNombre}
                        </p>
                        {ses.focus && (
                          <p className="coaching-session-focus" style={{ marginBottom: "0.25rem" }}>
                            <TablerIcon name="target" size={14} />
                            Enfoque técnico: {ses.focus}
                          </p>
                        )}
                        {ses.notesSummary && <p className="coaching-session-feedback">{ses.notesSummary}</p>}
                      </div>
                      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
                        <button
                          type="button"
                          className="coaching-btn"
                          style={{
                            fontSize: "0.75rem",
                            padding: "0.25rem 0.5rem",
                            background: "rgba(245, 158, 11, 0.15)",
                            color: "#fbbf24",
                            border: "1px solid rgba(245, 158, 11, 0.35)",
                          }}
                          onClick={() => {
                            setRevertingSession({
                              id: ses.id,
                              startsAt: ses.startsAt,
                              jugadorNombre: ses.jugadorNombre,
                              coachNombre: detail.coach.nombre,
                              durationMinutes: ses.durationMinutes,
                              focus: ses.focus,
                            });
                          }}
                        >
                          <TablerIcon name="rotate-2" size={13} />
                          Revertir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* 5. SEGUIMIENTO DEPORTIVO */}
      {activeTab === "seguimiento" && (
        <section className="coaching-panel" style={{ padding: "1.25rem", background: "rgba(255,255,255,0.02)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="coaching-section-header" style={{ marginBottom: "1rem" }}>
            <div>
              <h2 className="coaching-section-title" style={{ fontSize: "1.2rem" }}>Seguimiento Deportivo</h2>
              <p className="coaching-section-desc">Evolución técnica compartida de los alumnos que entrenan con {coach.nombre}.</p>
            </div>
          </div>

          {sessions.filter((s) => Boolean(s.focus || s.notesSummary || s.improvements || s.nextGoals || s.motivationalMessage || (s.workedOn && s.workedOn.length > 0))).length === 0 ? (
            <div className="coaching-empty-card">
              <TablerIcon name="target" size={40} className="coaching-empty-icon" />
              <h3>Sin observaciones técnicas registradas</h3>
              <p>A medida que el coach registre clases con enfoque técnico, temas trabajados y retroalimentación, aparecerán en este panel de supervisión.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              {sessions
                .filter((s) => Boolean(s.focus || s.notesSummary || s.improvements || s.nextGoals || s.motivationalMessage || (s.workedOn && s.workedOn.length > 0)))
                .map((ses) => (
                  <div key={ses.id} className="coaching-session-box" style={{ background: "rgba(255,255,255,0.03)", padding: "1rem 1.25rem", borderLeft: "3px solid #38bdf8", borderRadius: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem", flexWrap: "wrap", gap: "0.5rem" }}>
                      <strong style={{ fontSize: "1rem", color: "var(--ro-text-main)" }}>{ses.jugadorNombre}</strong>
                      <span style={{ fontSize: "0.78rem", color: "var(--ro-text-muted)" }}>{formatDate(ses.startsAt)}</span>
                    </div>

                    {ses.focus && (
                      <div className="coaching-session-focus" style={{ marginBottom: "0.4rem" }}>
                        <TablerIcon name="target" size={14} />
                        <span>{ses.focus}</span>
                      </div>
                    )}

                    {ses.workedOn && ses.workedOn.length > 0 && (
                      <div style={{ margin: "0.4rem 0" }}>
                        <span style={{ fontSize: "0.74rem", textTransform: "uppercase", color: "var(--ro-text-muted)", letterSpacing: "0.05em", display: "block", marginBottom: "0.2rem" }}>
                          Temas trabajados:
                        </span>
                        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                          {ses.workedOn.map((w) => (
                            <span key={w} className="coaching-tag" style={{ fontSize: "0.75rem", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", border: "1px solid rgba(56, 189, 248, 0.3)" }}>
                              {w}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {ses.improvements && (
                      <div style={{ marginTop: "0.45rem", fontSize: "0.85rem", lineHeight: 1.45 }}>
                        <strong style={{ color: "#4ade80" }}>Mejoras observadas:</strong>{" "}
                        <span style={{ color: "var(--ro-text-main)" }}>{ses.improvements}</span>
                      </div>
                    )}

                    {ses.nextGoals && (
                      <div style={{ marginTop: "0.35rem", fontSize: "0.85rem", lineHeight: 1.45 }}>
                        <strong style={{ color: "#facc15" }}>Próximos objetivos:</strong>{" "}
                        <span style={{ color: "var(--ro-text-main)" }}>{ses.nextGoals}</span>
                      </div>
                    )}

                    {ses.motivationalMessage && (
                      <div
                        style={{
                          marginTop: "0.6rem",
                          padding: "0.6rem 0.85rem",
                          background: "rgba(168, 85, 247, 0.08)",
                          borderLeft: "3px solid #a855f7",
                          borderRadius: "4px",
                          fontSize: "0.85rem",
                          fontStyle: "italic",
                          color: "#f3e8ff",
                        }}
                      >
                        <span style={{ fontWeight: 700, fontStyle: "normal", display: "block", marginBottom: "0.2rem", color: "#c084fc", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Mensaje motivante para el alumno:
                        </span>
                        &quot;{ses.motivationalMessage}&quot;
                      </div>
                    )}

                    {ses.notesSummary && (
                      <p className="coaching-session-feedback" style={{ marginTop: "0.5rem" }}>
                        {ses.notesSummary}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          )}
        </section>
      )}

      {/* 6. HISTORIAL INMUTABLE */}
      {activeTab === "historial" && (
        <section className="coaching-panel" style={{ padding: "1.25rem", background: "rgba(255,255,255,0.02)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="coaching-section-header" style={{ marginBottom: "1rem" }}>
            <div>
              <h2 className="coaching-section-title" style={{ fontSize: "1.2rem" }}>Historial Inmutable de Operaciones</h2>
              <p className="coaching-section-desc">Auditoría completa de movimientos de clases y modificaciones de membresía en este club.</p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {/* Movimientos de Clases */}
            <div>
              <h3 style={{ fontSize: "0.95rem", color: "var(--ro-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                Movimientos de Clases ({ledger.length})
              </h3>
              {ledger.length === 0 ? (
                <p style={{ color: "var(--ro-text-muted)", fontSize: "0.85rem", fontStyle: "italic" }}>Sin movimientos de clases registrados aún.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {ledger.map((l) => {
                    const renderCoachLedgerBadge = () => {
                      switch (l.tipo) {
                        case "PACKAGE_CREDIT":
                        case "ASSIGN":
                          return (
                            <span className="coaching-ledger-badge badge--assign">
                              <TablerIcon name="plus" size={13} />
                              +{l.delta} Clases asignadas
                            </span>
                          );
                        case "CLASS_DEBIT":
                          return (
                            <span className="coaching-ledger-badge badge--session">
                              <TablerIcon name="check" size={13} />
                              {l.delta} Clase impartida
                            </span>
                          );
                        case "TRANSFER_OUT":
                          return (
                            <span
                              className="coaching-ledger-badge"
                              style={{
                                background: "rgba(245, 158, 11, 0.15)",
                                color: "#f59e0b",
                                border: "1px solid rgba(245, 158, 11, 0.35)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.25rem",
                              }}
                            >
                              <TablerIcon name="arrow-right" size={13} />
                              {l.delta} Transferidas (Salida)
                            </span>
                          );
                        case "TRANSFER_IN":
                          return (
                            <span
                              className="coaching-ledger-badge"
                              style={{
                                background: "rgba(6, 182, 212, 0.15)",
                                color: "#22d3ee",
                                border: "1px solid rgba(6, 182, 212, 0.35)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.25rem",
                              }}
                            >
                              <TablerIcon name="arrow-left" size={13} />
                              +{l.delta} Transferidas (Entrada)
                            </span>
                          );
                        case "ADJUSTMENT":
                          return (
                            <span
                              className="coaching-ledger-badge"
                              style={{
                                background: "rgba(148, 163, 184, 0.15)",
                                color: "#cbd5e1",
                                border: "1px solid rgba(148, 163, 184, 0.35)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.25rem",
                              }}
                            >
                              <TablerIcon name="adjustments" size={13} />
                              {l.delta > 0 ? `+${l.delta}` : l.delta} Ajuste
                            </span>
                          );
                        default:
                          return (
                            <span className={`coaching-ledger-badge ${l.delta > 0 ? "badge--assign" : "badge--session"}`}>
                              {l.delta > 0 ? `+${l.delta}` : l.delta} {l.tipo}
                            </span>
                          );
                      }
                    };

                    return (
                      <div key={l.id} className="coaching-ledger-row">
                        <div className="coaching-ledger-row__left">
                          {renderCoachLedgerBadge()}
                          <span className="coaching-ledger-date">{formatDate(l.createdAt)}</span>
                        </div>
                        <div className="coaching-ledger-row__details">
                          <p style={{ margin: "0 0 0.15rem", fontWeight: 600 }}>Alumno: {l.jugadorNombre}</p>
                          {l.notas && <p className="coaching-ledger-notes">Detalle: {l.notas}</p>}
                        </div>
                        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
                          {(l.tipo === "PACKAGE_CREDIT" || l.tipo === "ASSIGN" || l.tipo === "ADJUSTMENT") && (
                            <button
                              type="button"
                              className="coaching-btn coaching-btn--secondary"
                              style={{ fontSize: "0.75rem", padding: "0.25rem 0.55rem" }}
                              onClick={() => {
                                const st = students.find((s) => s.jugadorId === l.jugadorId);
                                setAdjustingBalance({
                                  coachId: detail.coach.id,
                                  coachNombre: detail.coach.nombre,
                                  studentId: l.jugadorId,
                                  studentNombre: l.jugadorNombre,
                                  rivieraId: st?.rivieraId,
                                  currentBalance: st?.balanceClasses ?? 0,
                                  referenceLedgerId: l.id,
                                });
                              }}
                              title="Corregir saldo de clases"
                            >
                              <TablerIcon name="adjustments" size={13} />
                              Corregir
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Auditoría de Membresía */}
            {auditLog.length > 0 && (
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "1rem" }}>
                <h3 style={{ fontSize: "0.95rem", color: "var(--ro-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                  Bitácora de Membresía ({auditLog.length})
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {auditLog.map((a) => (
                    <div key={a.id} style={{ padding: "0.6rem 0.85rem", background: "rgba(255,255,255,0.02)", borderRadius: "6px", fontSize: "0.82rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <strong>{a.action}</strong>
                        {a.previousStatus && a.newStatus && a.previousStatus !== a.newStatus && (
                          <span style={{ color: "var(--ro-text-muted)", marginLeft: "0.5rem" }}>
                            ({a.previousStatus} → {a.newStatus})
                          </span>
                        )}
                      </div>
                      <span style={{ color: "var(--ro-text-muted)", fontSize: "0.75rem" }}>{formatDate(a.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── MODAL: EDITAR COACH EN ESTE CLUB ───────────────────────── */}
      <Modal
        open={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Editar Coach: ${coach.nombre}`}
      >
        <form onSubmit={handleSaveSettings} className="coaching-modal-form">
          <div className="coaching-demo-banner" style={{ background: "rgba(56, 189, 248, 0.08)", border: "1px solid rgba(56, 189, 248, 0.25)", marginBottom: "1rem" }}>
            <span style={{ color: "#38bdf8", display: "inline-flex" }}>
              <TablerIcon name="info-circle" size={18} />
            </span>
            <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.85)" }}>
              Estás modificando la configuración del coach exclusivamente para <strong>{club.nombre}</strong>.
              Su identidad global de Riviera Open y código <strong>{coach.coachCode}</strong> se preservan intactos.
            </span>
          </div>

          {actionError && (
            <div className="coaching-error" style={{ marginBottom: "1rem" }}>
              <TablerIcon name="alert-circle" size={16} />
              <span>{actionError}</span>
            </div>
          )}

          {/* Fuerzas que entrena */}
          <div className="coaching-field">
            <span style={{ fontWeight: 600, marginBottom: "0.4rem", display: "block" }}>Fuerzas que entrena en tu club</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "0.4rem" }}>
              {COACH_FUERZAS_ORDER.map((f) => {
                const checked = editFuerzas.includes(f);
                return (
                  <label key={f} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setEditFuerzas((prev) =>
                          prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
                        );
                      }}
                      disabled={busy}
                    />
                    <span>{JUGADOR_CATEGORIA_LABELS[f] || f}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Especialidades técnicas */}
          <div className="coaching-field" style={{ marginTop: "1rem" }}>
            <span style={{ fontWeight: 600, marginBottom: "0.4rem", display: "block" }}>Especialidades técnicas ofrecidas</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "0.4rem" }}>
              {COACH_ESPECIALIDADES_ORDER.map((esp) => {
                const checked = editEspecialidades.includes(esp);
                return (
                  <label key={esp} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setEditEspecialidades((prev) =>
                          prev.includes(esp) ? prev.filter((x) => x !== esp) : [...prev, esp]
                        );
                      }}
                      disabled={busy}
                    />
                    <span>{esp}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Horarios / Disponibilidad */}
          <label className="coaching-field" style={{ marginTop: "1rem" }}>
            <span>Disponibilidad y Horarios en cancha</span>
            <input
              type="text"
              value={editDisponibilidad}
              onChange={(e) => setEditDisponibilidad(e.target.value)}
              placeholder="Ej. Martes y Jueves 8:00 AM - 1:00 PM"
              disabled={busy}
            />
          </label>

          {/* Notas internas del club */}
          <label className="coaching-field" style={{ marginTop: "1rem" }}>
            <span>Notas internas del club (privadas para la administración)</span>
            <textarea
              rows={3}
              value={editNotas}
              onChange={(e) => setEditNotas(e.target.value)}
              placeholder="Notas operativas, acuerdos de academia, condiciones de horario..."
              disabled={busy}
            />
          </label>

          <div className="coaching-modal-footer" style={{ marginTop: "1.5rem" }}>
            <button
              type="button"
              className="coaching-btn coaching-btn--ghost"
              onClick={() => setIsEditModalOpen(false)}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="coaching-btn coaching-btn--primary"
              disabled={busy}
            >
              {busy ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL: GESTIONAR ASOCIACIÓN / QUITAR DE MI CLUB ────────── */}
      <Modal
        open={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
        title={`Gestionar Asociación: ${coach.nombre}`}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div>
            <span style={{ fontSize: "0.78rem", color: "var(--ro-text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
              Estado actual en {club.nombre}
            </span>
            <div style={{ marginTop: "0.35rem" }}>{getStatusBadge(membership.status)}</div>
          </div>

          {/* ACCIÓN SEGÚN EL ESTADO */}
          {membership.status === "PENDING" && (
            <div style={{ background: "rgba(255, 184, 108, 0.08)", border: "1px solid rgba(255, 184, 108, 0.25)", padding: "1rem", borderRadius: "8px" }}>
              <h4 style={{ margin: "0 0 0.4rem", color: "#ffb86c", fontSize: "0.95rem" }}>Invitación en espera</h4>
              <p style={{ margin: "0 0 0.85rem", fontSize: "0.85rem", color: "var(--ro-text-secondary)" }}>
                El coach aún no ha aceptado la invitación desde su cuenta personal de Riviera Open. Si fue enviada por error o ya no se requiere, puedes cancelarla.
              </p>
              <button
                type="button"
                className="coaching-btn coaching-btn--ghost"
                style={{ color: "#ff6b81", borderColor: "rgba(255, 71, 87, 0.3)" }}
                onClick={handleCancelInvitation}
                disabled={busy}
              >
                <TablerIcon name="trash" size={15} />
                {busy ? "Cancelando…" : "Cancelar invitación"}
              </button>
            </div>
          )}

          {membership.status === "ACTIVE" && (
            <div style={{ background: "rgba(255, 71, 87, 0.08)", border: "1px solid rgba(255, 71, 87, 0.25)", padding: "1rem", borderRadius: "8px" }}>
              <h4 style={{ margin: "0 0 0.4rem", color: "#ff6b81", fontSize: "0.95rem" }}>Desvincular del club</h4>
              <p style={{ margin: "0 0 0.85rem", fontSize: "0.85rem", color: "var(--ro-text-secondary)" }}>
                Al desvincular al entrenador, su membresía pasa a <strong>Inactivo</strong>. Se conservan todas las clases asignadas, saldos e historiales. El coach no podrá registrar nuevas clases ni vincular alumnos en tu club.
              </p>
              <button
                type="button"
                className="coaching-btn coaching-btn--ghost"
                style={{ color: "#ff6b81", borderColor: "rgba(255, 71, 87, 0.3)" }}
                onClick={handleDeactivate}
                disabled={busy}
              >
                <TablerIcon name="user-off" size={15} />
                {busy ? "Desvinculando…" : "Desvincular de mi club"}
              </button>
            </div>
          )}

          {(membership.status === "INACTIVE" || membership.status === "CANCELLED") && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <div style={{ background: "rgba(34, 197, 94, 0.08)", border: "1px solid rgba(34, 197, 94, 0.25)", padding: "1rem", borderRadius: "8px" }}>
                <h4 style={{ margin: "0 0 0.4rem", color: "#4ade80", fontSize: "0.95rem" }}>Reincorporar coach</h4>
                <p style={{ margin: "0 0 0.85rem", fontSize: "0.85rem", color: "var(--ro-text-secondary)" }}>
                  Envía una nueva solicitud de incorporación formal para que el coach la acepte y vuelva a activarse en tu club.
                </p>
                <button
                  type="button"
                  className="coaching-btn coaching-btn--primary"
                  onClick={handleReincorporate}
                  disabled={busy}
                >
                  <TablerIcon name="user-check" size={15} />
                  {busy ? "Solicitando…" : "Solicitar reincorporación"}
                </button>
              </div>

              <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)", padding: "1rem", borderRadius: "8px" }}>
                <h4 style={{ margin: "0 0 0.4rem", fontSize: "0.95rem" }}>Archivar de la lista principal</h4>
                <p style={{ margin: "0 0 0.85rem", fontSize: "0.85rem", color: "var(--ro-text-secondary)" }}>
                  Oculta este coach inactivo de la lista general. Podrás consultarlo en la pestaña &quot;Archivados&quot; en cualquier momento.
                </p>
                <button
                  type="button"
                  className="coaching-btn coaching-btn--secondary"
                  onClick={handleArchive}
                  disabled={busy}
                >
                  <TablerIcon name="archive" size={15} />
                  {busy ? "Archivando…" : "Archivar coach"}
                </button>
              </div>
            </div>
          )}

          {membership.status === "ARCHIVED" && (
            <div style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.08)", padding: "1rem", borderRadius: "8px" }}>
              <h4 style={{ margin: "0 0 0.4rem", fontSize: "0.95rem" }}>Coach archivado</h4>
              <p style={{ margin: "0 0 0.85rem", fontSize: "0.85rem", color: "var(--ro-text-secondary)" }}>
                Este coach se encuentra archivado. Puedes restaurarlo a la lista de inactivos para reanudar su gestión.
              </p>
              <button
                type="button"
                className="coaching-btn coaching-btn--secondary"
                onClick={handleUnarchive}
                disabled={busy}
              >
                <TablerIcon name="archive-off" size={15} />
                {busy ? "Restaurando…" : "Desarchivar coach"}
              </button>
            </div>
          )}

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "0.75rem", fontSize: "0.8rem", color: "var(--ro-text-muted)" }}>
            <p style={{ margin: 0 }}>
              <strong>Nota sobre clubes erróneos:</strong> Si este coach fue registrado por error en tu club y pertenece a otra organización, cancela o desvincula la asociación. El otro club podrá incorporarlo formalmente conservando su Riviera ID global ({coach.coachCode}) sin mezclar datos deportivos.
            </p>
          </div>

          <div className="coaching-modal-footer">
            <button
              type="button"
              className="coaching-btn coaching-btn--ghost"
              onClick={() => setIsManageModalOpen(false)}
            >
              Cerrar
            </button>
          </div>
        </div>
      </Modal>

      {/* ── MODAL: ASIGNAR CLASES DESDE EL PANEL ─────────────────────── */}
      <Modal
        open={Boolean(assigningStudent)}
        onClose={() => setAssigningStudent(null)}
        title={`Asignar clases a ${assigningStudent?.nombre || "alumno"}`}
      >
        <form onSubmit={handleAssignClasses} className="coaching-modal-form">
          <p style={{ fontSize: "0.88rem", color: "var(--ro-text-secondary)", margin: "0 0 1rem" }}>
            Autoriza un paquete de clases para este alumno con <strong>{coach.nombre}</strong>. Solo el club puede agregar o recargar clases disponibles.
          </p>

          <label className="coaching-field">
            <span>Cantidad de clases a sumar *</span>
            <input
              type="number"
              min={1}
              max={100}
              value={assignClassesCount}
              onChange={(e) => setAssignClassesCount(Number(e.target.value))}
              required
              disabled={busy}
            />
          </label>

          <label className="coaching-field" style={{ marginTop: "0.85rem" }}>
            <span>Notas o referencia del paquete (opcional)</span>
            <input
              type="text"
              value={assignClassesNotes}
              onChange={(e) => setAssignClassesNotes(e.target.value)}
              placeholder="Ej. Paquete 10 clases mensual"
              disabled={busy}
            />
          </label>

          <div className="coaching-modal-footer" style={{ marginTop: "1.5rem" }}>
            <button
              type="button"
              className="coaching-btn coaching-btn--ghost"
              onClick={() => setAssigningStudent(null)}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="coaching-btn coaching-btn--primary"
              disabled={busy}
            >
              {busy ? "Asignando…" : `Confirmar +${assignClassesCount} clases`}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL: ELIMINAR COACH DE MI CLUB ──────────────────────────── */}
      <Modal
        open={isRemoveModalOpen}
        onClose={() => {
          setIsRemoveModalOpen(false);
          setDetailRemovalReason("");
        }}
        title="Eliminar coach de mi club"
        size="md"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div
            style={{
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              borderRadius: "8px",
              padding: "1rem",
              color: "#fca5a5",
              fontSize: "0.88rem",
              lineHeight: 1.5,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 700, marginBottom: "0.35rem" }}>
              <TablerIcon name="alert-triangle" size={18} />
              <span>Desvincular a {coach.nombre} ({coach.coachCode}) de {club.nombre}</span>
            </div>
            <p style={{ margin: 0 }}>
              Esta acción desvinculará al entrenador de tu club y pausará las relaciones activas de alumnos en este club.
            </p>
            <p style={{ margin: "0.5rem 0 0", color: "#fecaca" }}>
              <strong>Se conservará íntegramente</strong> todo el historial de clases impartidas, ledger de movimientos, sesiones y saldos disponibles para efectos de balance y auditoría. La identidad deportiva del coach no será destruida.
            </p>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
              Motivo de la baja en este club (opcional):
            </label>
            <input
              type="text"
              className="coaching-input"
              placeholder="Ej. Conclusión de periodo laboral, mutuo acuerdo..."
              value={detailRemovalReason}
              onChange={(e) => setDetailRemovalReason(e.target.value)}
              disabled={busy}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
            <button
              type="button"
              className="coaching-btn coaching-btn--secondary"
              onClick={() => {
                setIsRemoveModalOpen(false);
                setDetailRemovalReason("");
              }}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="coaching-btn coaching-btn--danger"
              style={{ background: "#dc2626", borderColor: "#ef4444", color: "#ffffff" }}
              onClick={handleRemoveCoach}
              disabled={busy}
            >
              <TablerIcon name="trash" size={16} />
              {busy ? "Eliminando…" : "Eliminar coach de mi club"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: Asignar Alumno a este Coach */}
      <AddStudentToCoachModal
        open={isAddStudentModalOpen}
        onClose={() => setIsAddStudentModalOpen(false)}
        organizadorId={organizadorId}
        coaches={
          clubCoaches.length > 0
            ? clubCoaches
            : detail
            ? [
                {
                  id: detail.coach.id,
                  nombre: detail.coach.nombre,
                  coachCode: detail.coach.coachCode,
                  membershipStatus: detail.membership.status,
                  fuerzas: detail.coach.fuerzas,
                  especialidades: detail.coach.especialidades,
                } as any,
              ]
            : []
        }
        defaultCoachId={coachId}
        onSuccess={(studentName, coachName, classes) => {
          setActionSuccess(
            `Alumno ${studentName} asignado a ${coachName} con ${classes} clases disponibles exitosamente.`
          );
          void loadData();
          if (onCoachUpdated) onCoachUpdated();
        }}
      />

      {/* Modal: Cambiar Entrenador del Alumno */}
      <ReassignCoachModal
        open={Boolean(reassigningStudent)}
        onClose={() => setReassigningStudent(null)}
        organizadorId={organizadorId}
        student={
          reassigningStudent
            ? {
                id: reassigningStudent.jugadorId,
                nombre: reassigningStudent.nombre,
                rivieraId: reassigningStudent.rivieraId,
              }
            : null
        }
        fromCoach={
          detail
            ? {
                id: detail.coach.id,
                nombre: detail.coach.nombre,
                coachCode: detail.coach.coachCode,
              }
            : null
        }
        balanceClasses={reassigningStudent?.balanceClasses ?? 0}
        coaches={clubCoaches}
        onSuccess={(studentName, toCoachName, transferredClasses) => {
          setActionSuccess(
            `Se transfirió a ${studentName} con ${transferredClasses} clases a ${toCoachName} exitosamente.`
          );
          setReassigningStudent(null);
          void loadData();
          if (onCoachUpdated) onCoachUpdated();
        }}
      />

      {/* Modal: Ajuste Compensatorio de Saldo */}
      {adjustingBalance && (
        <AdjustClassBalanceModal
          open={Boolean(adjustingBalance)}
          onClose={() => setAdjustingBalance(null)}
          organizadorId={organizadorId}
          coachId={adjustingBalance.coachId}
          coachNombre={adjustingBalance.coachNombre}
          studentId={adjustingBalance.studentId}
          studentNombre={adjustingBalance.studentNombre}
          rivieraId={adjustingBalance.rivieraId}
          currentBalance={adjustingBalance.currentBalance}
          referenceLedgerId={adjustingBalance.referenceLedgerId}
          onSuccess={(newBalance, delta, prevBalance) => {
            const pText = prevBalance != null ? `Saldo anterior: ${prevBalance} clases. ` : "";
            const dText = delta >= 0 ? `+${delta}` : `${delta}`;
            setActionSuccess(
              `Saldo corregido correctamente. ${pText}Ajuste: ${dText} clases. Saldo actual: ${newBalance} clases.`
            );
            void loadData();
            if (onCoachUpdated) onCoachUpdated();
          }}
        />
      )}

      {/* Modal: Revertir Clase */}
      {revertingSession && (
        <RevertClassSessionModal
          open={Boolean(revertingSession)}
          onClose={() => setRevertingSession(null)}
          organizadorId={organizadorId}
          session={revertingSession}
          onSuccess={(_sessionId, newBalance) => {
            setActionSuccess(
              `Clase revertida y devuelta al alumno exitosamente.${
                newBalance !== undefined ? ` Nuevo saldo: ${newBalance} clases.` : ""
              }`
            );
            void loadData();
            void loadCoachAgenda();
            if (onCoachUpdated) onCoachUpdated();
          }}
        />
      )}

      {/* Modal: Agendar Clase con este Coach */}
      <ScheduleClassModal
        open={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        organizadorId={organizadorId}
        coaches={
          clubCoaches.length > 0
            ? clubCoaches
            : detail
            ? [
                {
                  id: detail.coach.id,
                  nombre: detail.coach.nombre,
                  coachCode: detail.coach.coachCode,
                  membershipStatus: detail.membership.status,
                } as any,
              ]
            : []
        }
        preselectedCoachId={coachId}
        onSuccess={(_sessionId) => {
          setActionSuccess("Clase agendada exitosamente en el calendario.");
          void loadData();
          void loadCoachAgenda();
          if (onCoachUpdated) onCoachUpdated();
        }}
      />

      {/* Modal: Reprogramar Clase */}
      {reschedulingSession && (
        <RescheduleClassModal
          open={Boolean(reschedulingSession)}
          onClose={() => setReschedulingSession(null)}
          organizadorId={organizadorId}
          session={reschedulingSession}
          onSuccess={(_sessionId) => {
            setActionSuccess("Clase reprogramada exitosamente.");
            void loadCoachAgenda();
          }}
        />
      )}

      {/* Modal: Cancelar Clase */}
      {cancellingSession && (
        <CancelClassModal
          open={Boolean(cancellingSession)}
          onClose={() => setCancellingSession(null)}
          organizadorId={organizadorId}
          session={cancellingSession}
          onSuccess={(_sessionId) => {
            setActionSuccess("Clase cancelada exitosamente.");
            void loadCoachAgenda();
          }}
        />
      )}
    </div>
  );
};
