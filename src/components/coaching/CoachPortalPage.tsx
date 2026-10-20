import React, { useEffect, useState } from "react";
import { useUser } from "../../contexts/UserContext";
import {
  fetchCurrentCoachProfile,
  acceptCoachClubInvitation,
  fetchCoachAssignedStudents,
  recordCoachClassSession,
  generateCoachingIdempotencyKey,
  fetchCoachAgenda,
} from "../../lib/coaching/coachingApi";
import type {
  CurrentCoachProfile,
  CoachingPlayerLink,
  CoachScheduledSession,
} from "../../lib/coaching/types";
import { JUGADOR_CATEGORIA_LABELS } from "../../lib/rivieraJugadores/constants";
import { TablerIcon } from "../ui/TablerIcon";
import { Modal } from "../ui/Modal";
import { navigateToAppHome } from "../../lib/appRouting";
import "./coaching.css";

const DEFAULT_PADEL_TOPICS = [
  "Bandeja",
  "Víbora",
  "Volea de derecha",
  "Volea de revés",
  "Smash / Remate",
  "Globo defensivo",
  "Salida de pared",
  "Doble pared",
  "Saque y resto",
  "Táctica y posicionamiento",
  "Transición defensa-ataque",
  "Bloqueo en la red",
];

export const CoachPortalPage: React.FC = () => {
  const { user, loading: userLoading } = useUser();
  const [profile, setProfile] = useState<CurrentCoachProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedClubId, setSelectedClubId] = useState<string>("");
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [students, setStudents] = useState<CoachingPlayerLink[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentsError, setStudentsError] = useState<string | null>(null);

  // Agenda: Próximas Clases del Coach
  const [upcomingSessions, setUpcomingSessions] = useState<CoachScheduledSession[]>([]);
  const [loadingUpcoming, setLoadingUpcoming] = useState(false);
  const [upcomingError, setUpcomingError] = useState<string | null>(null);
  const [detailsSession, setDetailsSession] = useState<CoachScheduledSession | null>(null);
  const [modalSessionId, setModalSessionId] = useState<string | null>(null);

  // Modal: Registrar Clase Impartida
  const [modalStudent, setModalStudent] = useState<CoachingPlayerLink | null>(null);
  const [workedOnList, setWorkedOnList] = useState<string[]>([]);
  const [customTopic, setCustomTopic] = useState("");
  const [improvements, setImprovements] = useState("");
  const [nextGoals, setNextGoals] = useState("");
  const [motivationalMessage, setMotivationalMessage] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [classNotes, setClassNotes] = useState("");
  const [modalKey, setModalKey] = useState("");
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadStudents = React.useCallback(async (coachId: string, clubId: string) => {
    if (!coachId || !clubId) return;
    setLoadingStudents(true);
    setStudentsError(null);
    try {
      const data = await fetchCoachAssignedStudents(coachId, clubId);
      setStudents(data);
    } catch (err) {
      console.error("[coaching] error loading students", err);
      setStudentsError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los alumnos vinculados."
      );
    } finally {
      setLoadingStudents(false);
    }
  }, []);

  const loadUpcoming = React.useCallback(async (clubId?: string) => {
    setLoadingUpcoming(true);
    setUpcomingError(null);
    try {
      const sessions = await fetchCoachAgenda({
        organizadorId: clubId || null,
        statusFilter: "SCHEDULED",
      });
      setUpcomingSessions(sessions);
    } catch (err) {
      console.error("[coaching] error loading coach upcoming classes:", err);
      setUpcomingError(
        err instanceof Error ? err.message : "No se pudieron cargar las próximas clases."
      );
    } finally {
      setLoadingUpcoming(false);
    }
  }, []);

  useEffect(() => {
    if (profile && selectedClubId) {
      void loadStudents(profile.id, selectedClubId);
      void loadUpcoming(selectedClubId);
    } else {
      setStudents([]);
      setUpcomingSessions([]);
    }
  }, [profile, selectedClubId, loadStudents, loadUpcoming]);

  useEffect(() => {
    let isMounted = true;

    async function loadCoach() {
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const coachProfile = await fetchCurrentCoachProfile();
        if (isMounted) {
          setProfile(coachProfile);
          if (coachProfile && coachProfile.memberships.length > 0) {
            setSelectedClubId(coachProfile.memberships[0].organizadorId);
          }
        }
      } catch (err) {
        console.error("[coaching] error fetching coach profile", err);
        if (isMounted) setProfile(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (!userLoading) {
      void loadCoach();
    }

    return () => {
      isMounted = false;
    };
  }, [user, userLoading]);

  const handleAcceptInvitation = async (membershipId: string) => {
    setAcceptingId(membershipId);
    setActionError(null);
    try {
      const res = await acceptCoachClubInvitation(membershipId);
      if (res.success) {
        const updated = await fetchCurrentCoachProfile();
        setProfile(updated);
      } else {
        setActionError(res.error || "No se pudo aceptar la invitación.");
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Error al procesar la invitación"
      );
    } finally {
      setAcceptingId(null);
    }
  };

  const formatSessionDate = (iso: string) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("es-MX", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const openRecordClassModal = (st: CoachingPlayerLink) => {
    setModalStudent(st);
    setModalSessionId(null);
    setWorkedOnList([]);
    setCustomTopic("");
    setImprovements("");
    setNextGoals("");
    setMotivationalMessage("");
    setDurationMinutes(60);
    setClassNotes("");
    setModalError(null);
    setModalKey(generateCoachingIdempotencyKey("session"));
  };

  const openRecordClassForScheduled = (sess: CoachScheduledSession) => {
    const matched = students.find((st) => st.jugadorId === sess.jugadorId);
    const studentLink: CoachingPlayerLink = matched || {
      id: sess.relationshipId || "",
      coachId: sess.coachId,
      coachNombre: sess.coachNombre || profile?.nombre || "Coach",
      jugadorId: sess.jugadorId,
      jugadorNombre: sess.jugadorNombre || "Alumno",
      rivieraId: sess.rivieraId || "RIV-00000000",
      balanceClasses: sess.balanceClasses ?? 1,
      totalClassesGiven: 0,
      isPrimary: true,
      status: "ACTIVE",
    };

    setModalStudent(studentLink);
    setModalSessionId(sess.id);
    setWorkedOnList(sess.focus ? [sess.focus] : []);
    setCustomTopic("");
    setImprovements("");
    setNextGoals("");
    setMotivationalMessage("");
    setDurationMinutes(sess.durationMinutes || 60);
    setClassNotes(sess.notesSummary || "");
    setModalError(null);
    setModalKey(generateCoachingIdempotencyKey("session"));
    setDetailsSession(null);
  };

  const toggleTopic = (topic: string) => {
    setWorkedOnList((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  const addCustomTopic = () => {
    const trimmed = customTopic.trim();
    if (!trimmed) return;
    if (!workedOnList.includes(trimmed)) {
      setWorkedOnList((prev) => [...prev, trimmed]);
    }
    setCustomTopic("");
  };

  const handleConfirmClassRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalStudent) return;
    setModalBusy(true);
    setModalError(null);
    try {
      const res = await recordCoachClassSession({
        relationshipId: modalStudent.id,
        sessionId: modalSessionId || undefined,
        notas: classNotes.trim() || undefined,
        workedOn: workedOnList,
        improvements: improvements.trim() || undefined,
        nextGoals: nextGoals.trim() || undefined,
        motivationalMessage: motivationalMessage.trim() || undefined,
        durationMinutes,
        idempotencyKey: modalKey,
      });

      setSuccessMessage(
        res.idempotent
          ? `Clase ya registrada previamente. Saldo restante: ${res.remainingBalance} clase(s).`
          : `¡Clase registrada exitosamente para ${modalStudent.jugadorNombre}! Saldo restante: ${res.remainingBalance} clase(s).`
      );
      setModalStudent(null);
      setModalSessionId(null);
      if (profile && selectedClubId) {
        await Promise.all([
          loadStudents(profile.id, selectedClubId),
          loadUpcoming(selectedClubId),
        ]);
      }
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : "Error al registrar la clase impartida."
      );
    } finally {
      setModalBusy(false);
    }
  };

  if (userLoading || loading) {
    return (
      <div className="coaching-page rv-page">
        <header className="coaching-hero">
          <button
            type="button"
            className="coaching-back"
            onClick={() => navigateToAppHome()}
          >
            <TablerIcon name="arrow-left" size={16} />
            Inicio
          </button>
          <p className="coaching-kicker">Riviera Coaching</p>
          <h1 className="coaching-title">Espacio del Coach</h1>
          <p className="coaching-muted">Verificando credenciales de coach…</p>
        </header>
      </div>
    );
  }

  // Si no hay sesión autenticada
  if (!user) {
    return (
      <div className="coaching-page rv-page">
        <header className="coaching-hero">
          <button
            type="button"
            className="coaching-back"
            onClick={() => navigateToAppHome()}
          >
            <TablerIcon name="arrow-left" size={16} />
            Inicio
          </button>
          <p className="coaching-kicker">Riviera Coaching</p>
          <h1 className="coaching-title">Espacio del Coach</h1>
        </header>

        <div className="coaching-empty-card">
          <TablerIcon name="lock" size={44} className="coaching-empty-icon" />
          <h3>Sesión requerida</h3>
          <p>
            Inicia sesión con tu cuenta oficial de Riviera para acceder a tu
            espacio personal de entrenador.
          </p>
          <button
            type="button"
            className="coaching-btn coaching-btn--primary"
            onClick={() => navigateToAppHome()}
          >
            <TablerIcon name="login" size={16} />
            Iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  // Si el usuario autenticado no está registrado como coach en public.riviera_coaches
  if (!profile) {
    return (
      <div className="coaching-page rv-page">
        <header className="coaching-hero">
          <button
            type="button"
            className="coaching-back"
            onClick={() => navigateToAppHome()}
          >
            <TablerIcon name="arrow-left" size={16} />
            Inicio
          </button>
          <p className="coaching-kicker">Riviera Coaching</p>
          <h1 className="coaching-title">Espacio del Coach</h1>
        </header>

        <div className="coaching-empty-card">
          <TablerIcon
            name="user-x"
            size={44}
            className="coaching-empty-icon"
          />
          <h3>Acceso exclusivo para entrenadores</h3>
          <p>
            La cuenta autenticada (<strong>{user.email}</strong>) no está
            registrada como coach oficial en Riviera Coaching.
          </p>
          <p className="coaching-muted" style={{ maxWidth: "450px", margin: "0.5rem auto 1.5rem" }}>
            Si eres entrenador de un club asociado a Riviera Open, solicita al
            administrador del club que envíe tu invitación oficial de coach.
          </p>
          <button
            type="button"
            className="coaching-btn coaching-btn--primary"
            onClick={() => navigateToAppHome()}
          >
            <TablerIcon name="arrow-left" size={16} />
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="coaching-page rv-page">
      <header className="coaching-hero">
        <button
          type="button"
          className="coaching-back"
          onClick={() => navigateToAppHome()}
        >
          <TablerIcon name="arrow-left" size={16} />
          Inicio
        </button>
        <p className="coaching-kicker">Riviera Coaching · Espacio del Coach</p>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <h1 className="coaching-title" style={{ margin: 0 }}>
            Hola, {profile.nombre}
          </h1>
          <span
            className="coaching-badge coaching-badge--primary"
            style={{ fontSize: "0.85rem", padding: "0.35rem 0.75rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
          >
            <TablerIcon name="shield-check" size={15} />
            {profile.coachCode}
          </span>
        </div>
        <p className="coaching-lead" style={{ marginTop: "0.5rem" }}>
          Panel de control del entrenador oficial. Identidad única verificada
          mediante la infraestructura de Riviera Open.
        </p>
      </header>

      {/* Tarjeta de Identidad Oficial del Coach */}
      <div className="coaching-panel" style={{ marginBottom: "1.5rem" }}>
        <div className="coaching-card" style={{ padding: "1.5rem" }}>
          <div className="coaching-card__top">
            <div
              className="coaching-card__avatar"
              style={{ width: "56px", height: "56px", fontSize: "1.5rem" }}
              aria-hidden
            >
              {profile.nombre.slice(0, 1).toUpperCase()}
            </div>
            <div className="coaching-card__identity">
              <h2 className="coaching-card__title" style={{ fontSize: "1.25rem" }}>
                {profile.nombre}
              </h2>
              <span className="coaching-card__code" style={{ fontSize: "0.95rem" }}>
                Código Oficial: <strong>{profile.coachCode}</strong>
              </span>
              {profile.bio ? (
                <p style={{ margin: "0.4rem 0 0", color: "var(--ro-text-secondary)", fontSize: "0.85rem" }}>
                  {profile.bio}
                </p>
              ) : null}
            </div>
          </div>

          {profile.fuerzas.length > 0 ? (
            <div className="coaching-card__tags-section" style={{ marginTop: "1rem" }}>
              <span className="coaching-card__tag-label">Fuerzas que entrenas</span>
              <div className="coaching-card__tags">
                {profile.fuerzas.map((f) => (
                  <span key={f} className="coaching-tag">
                    {JUGADOR_CATEGORIA_LABELS[f] || f}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {profile.especialidades.length > 0 ? (
            <div className="coaching-card__tags-section" style={{ marginTop: "0.75rem" }}>
              <span className="coaching-card__tag-label">Especialidades</span>
              <div className="coaching-card__tags">
                {profile.especialidades.map((esp) => (
                  <span key={esp} className="coaching-tag">
                    {esp}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Membresías y Clubes Asociados (Aislamiento Multi-Club) */}
      <section className="coaching-panel" style={{ marginBottom: "1.5rem" }}>
        <div className="coaching-section-header">
          <div>
            <h2 className="coaching-section-title">Clubes afiliados</h2>
            <p className="coaching-section-desc">
              Organizaciones y clubes donde tienes membresía técnica registrada.
            </p>
          </div>
        </div>

        {actionError ? (
          <div
            className="coaching-panel"
            style={{
              padding: "0.75rem 1rem",
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              borderRadius: "8px",
              color: "#fca5a5",
              marginBottom: "1rem",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <TablerIcon name="alert-circle" size={18} />
            {actionError}
          </div>
        ) : null}

        {profile.memberships.length === 0 ? (
          <div className="coaching-empty-card">
            <TablerIcon name="building" size={36} className="coaching-empty-icon" />
            <h3>Sin membresía activa en clubes</h3>
            <p>
              Tu perfil de coach está listo. En cuanto un club te agregue a su
              academia, aparecerá aquí su entorno operativo.
            </p>
          </div>
        ) : (
          <div className="coaching-grid">
            {profile.memberships.map((m) => {
              const isActiveClub = m.organizadorId === selectedClubId;
              const isStatusActive = m.status === "ACTIVE";
              const isStatusPending = m.status === "PENDING";

              return (
                <article
                  key={m.membershipId}
                  className={`coaching-card${isActiveClub ? " coaching-card--highlight" : ""}`}
                  style={{
                    border: isActiveClub
                      ? "1px solid var(--ro-border-strong, rgba(255, 255, 255, 0.35))"
                      : undefined,
                  }}
                >
                  <div className="coaching-card__top">
                    <div className="coaching-card__identity">
                      <h3 className="coaching-card__title">
                        {m.clubNombre || `Club ${m.organizadorId.slice(0, 8)}`}
                      </h3>
                      <span className="coaching-card__code">
                        ID Club: {m.organizadorId.slice(0, 8)}…
                      </span>
                    </div>
                    {isStatusActive ? (
                      <span className="coaching-badge coaching-badge--active">
                        Activo
                      </span>
                    ) : isStatusPending ? (
                      <span className="coaching-badge coaching-badge--pending">
                        Invitación pendiente
                      </span>
                    ) : (
                      <span className="coaching-badge coaching-badge--inactive">
                        Inactivo
                      </span>
                    )}
                  </div>

                  <div className="coaching-card__actions" style={{ marginTop: "1rem" }}>
                    {isStatusPending ? (
                      <button
                        type="button"
                        className="coaching-btn coaching-btn--primary"
                        disabled={acceptingId === m.membershipId}
                        onClick={() => handleAcceptInvitation(m.membershipId)}
                      >
                        <TablerIcon name="check" size={15} />
                        {acceptingId === m.membershipId
                          ? "Aceptando…"
                          : "Aceptar invitación al club"}
                      </button>
                    ) : isActiveClub ? (
                      <span
                        className="coaching-muted"
                        style={{
                          fontSize: "0.8rem",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                        }}
                      >
                        <TablerIcon name="check" size={14} />
                        Club operativo seleccionado
                      </span>
                    ) : isStatusActive ? (
                      <button
                        type="button"
                        className="coaching-btn coaching-btn--secondary"
                        onClick={() => setSelectedClubId(m.organizadorId)}
                      >
                        Operar en este club
                      </button>
                    ) : (
                      <span className="coaching-muted" style={{ fontSize: "0.8rem" }}>
                        Membresía pausada por el club
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Mensajes de éxito de operaciones */}
      {successMessage ? (
        <div
          className="coaching-panel"
          style={{
            padding: "0.75rem 1rem",
            background: "rgba(34, 197, 94, 0.12)",
            border: "1px solid rgba(34, 197, 94, 0.35)",
            borderRadius: "8px",
            color: "#86efac",
            marginBottom: "1.5rem",
            fontSize: "0.85rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <TablerIcon name="check" size={18} />
          {successMessage}
        </div>
      ) : null}

      {/* Agenda: Próximas Clases Agendadas del Coach */}
      <section className="coaching-panel" style={{ marginBottom: "1.5rem" }}>
        <div className="coaching-section-header">
          <div>
            <h2 className="coaching-section-title">Mis Próximas Clases Agendadas</h2>
            <p className="coaching-section-desc">
              Consulta las sesiones programadas por la administración del club, revisa los detalles pedagógicos y registra la clase impartida al concluirla.
            </p>
          </div>
          {selectedClubId && (
            <button
              type="button"
              className="coaching-btn coaching-btn--secondary"
              style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem" }}
              onClick={() => void loadUpcoming(selectedClubId)}
              disabled={loadingUpcoming}
            >
              <TablerIcon name="refresh" size={14} className={loadingUpcoming ? "spin" : ""} />
              Actualizar
            </button>
          )}
        </div>

        {loadingUpcoming ? (
          <p className="coaching-muted">Cargando tus próximas clases agendadas…</p>
        ) : upcomingError ? (
          <div
            className="coaching-panel"
            style={{
              padding: "0.75rem 1rem",
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              borderRadius: "8px",
              color: "#fca5a5",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.5rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <TablerIcon name="alert-circle" size={18} />
              <span>{upcomingError}</span>
            </div>
            <button
              type="button"
              className="coaching-btn coaching-btn--secondary"
              style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}
              onClick={() => selectedClubId && void loadUpcoming(selectedClubId)}
            >
              Reintentar
            </button>
          </div>
        ) : upcomingSessions.length === 0 ? (
          <div
            style={{
              padding: "1.5rem",
              textAlign: "center",
              background: "rgba(255, 255, 255, 0.02)",
              borderRadius: "10px",
              border: "1px dashed rgba(255, 255, 255, 0.1)",
            }}
          >
            <p className="coaching-muted" style={{ margin: 0 }}>
              No tienes clases programadas pendientes en este club. Las clases agendadas por la administración aparecerán aquí automáticamente.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            {upcomingSessions.map((session) => {
              const formattedDate = formatSessionDate(session.startsAt);
              return (
                <div
                  key={session.id}
                  style={{
                    background: "rgba(255, 255, 255, 0.025)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "12px",
                    padding: "1rem 1.25rem",
                    display: "flex",
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "1rem",
                  }}
                >
                  {/* Info horario, alumno, pista */}
                  <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                    <div
                      style={{
                        background: "rgba(16, 185, 129, 0.1)",
                        border: "1px solid rgba(16, 185, 129, 0.3)",
                        borderRadius: "10px",
                        padding: "0.6rem 0.85rem",
                        textAlign: "center",
                        minWidth: "110px",
                      }}
                    >
                      <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--ro-text-main, #f8fafc)" }}>
                        {formattedDate}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--ro-text-muted, #94a3b8)", marginTop: "2px" }}>
                        {session.durationMinutes} min {session.court ? `• ${session.court}` : ""}
                      </div>
                    </div>

                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--ro-text-main, #f8fafc)" }}>
                          {session.jugadorNombre || "Alumno"}
                        </span>
                        {session.rivieraId && (
                          <span style={{ fontSize: "0.75rem", color: "var(--ro-primary, #10b981)", fontFamily: "monospace" }}>
                            {session.rivieraId}
                          </span>
                        )}
                        {session.clubNombre && (
                          <span style={{ fontSize: "0.75rem", color: "var(--ro-text-muted)" }}>
                            ({session.clubNombre})
                          </span>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.35rem", flexWrap: "wrap" }}>
                        {session.focus && (
                          <span style={{ fontSize: "0.78rem", color: "var(--ro-brand, #38bdf8)", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <TablerIcon name="target" size={13} />
                            {session.focus}
                          </span>
                        )}
                        {session.balanceClasses !== undefined && (
                          <span
                            style={{
                              fontSize: "0.72rem",
                              padding: "0.15rem 0.45rem",
                              borderRadius: "4px",
                              background: session.balanceClasses > 0 ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
                              color: session.balanceClasses > 0 ? "#34d399" : "#fbbf24",
                              fontWeight: 600,
                            }}
                          >
                            {session.balanceClasses} clases disp.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Badges y Acciones */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                    <span
                      className="coaching-badge"
                      style={{
                        background: "rgba(16, 185, 129, 0.15)",
                        color: "#34d399",
                        border: "1px solid rgba(16, 185, 129, 0.35)",
                        fontWeight: 600,
                      }}
                    >
                      PROGRAMADA
                    </span>

                    <button
                      type="button"
                      className="coaching-btn coaching-btn--secondary"
                      style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}
                      onClick={() => setDetailsSession(session)}
                    >
                      <TablerIcon name="eye" size={14} />
                      Ver detalles
                    </button>

                    <button
                      type="button"
                      className="coaching-btn coaching-btn--primary"
                      style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}
                      onClick={() => openRecordClassForScheduled(session)}
                    >
                      <TablerIcon name="check" size={14} />
                      Registrar impartida (-1)
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Gestión de Alumnos y Clases del Coach */}
      <section className="coaching-panel" style={{ marginBottom: "1.5rem" }}>
        <div className="coaching-section-header">
          <div>
            <h2 className="coaching-section-title">Alumnos y Control de Clases</h2>
            <p className="coaching-section-desc">
              Consulta los alumnos asignados por el club y registra las clases impartidas para descontar su saldo automáticamente.
            </p>
          </div>
        </div>

        {loadingStudents ? (
          <p className="coaching-muted">Cargando alumnos y saldos…</p>
        ) : studentsError ? (
          <div
            className="coaching-panel"
            style={{
              padding: "0.75rem 1rem",
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              borderRadius: "8px",
              color: "#fca5a5",
              marginBottom: "1rem",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.5rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <TablerIcon name="alert-circle" size={18} />
              <span>{studentsError}</span>
            </div>
            <button
              type="button"
              className="coaching-btn coaching-btn--secondary"
              style={{ fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}
              onClick={() =>
                profile && selectedClubId && void loadStudents(profile.id, selectedClubId)
              }
            >
              Reintentar
            </button>
          </div>
        ) : students.length === 0 ? (
          <div className="coaching-empty-card">
            <TablerIcon name="users" size={36} className="coaching-empty-icon" />
            <h3>Sin alumnos asignados en este club</h3>
            <p>
              El administrador del club te asignará los alumnos con paquetes de clases activos para impartir sesiones.
            </p>
          </div>
        ) : (
          <div className="coaching-grid">
            {students.map((s) => {
              const hasBalance = (s.balanceClasses ?? 0) > 0;
              const isModalOpenForThis = modalStudent?.id === s.id;

              return (
                <article key={s.id} className="coaching-card">
                  <div className="coaching-card__top">
                    <div className="coaching-card__avatar" aria-hidden>
                      {s.jugadorNombre.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="coaching-card__identity">
                      <h3 className="coaching-card__title">{s.jugadorNombre}</h3>
                      <span className="coaching-card__code">{s.rivieraId}</span>
                    </div>
                    <span className="coaching-badge coaching-badge--active">
                      Activo
                    </span>
                  </div>

                  {/* Estado de Clases Disponibles */}
                  <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                    <span
                      className={`coaching-badge ${hasBalance ? "coaching-badge--primary" : "coaching-badge--inactive"}`}
                      style={{ fontWeight: 600, padding: "0.35rem 0.65rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                    >
                      <TablerIcon name="calendar-event" size={14} />
                      {s.balanceClasses ?? 0} clases disponibles
                    </span>
                    {(s.totalClassesGiven ?? 0) > 0 ? (
                      <span
                        className="coaching-badge"
                        style={{ background: "rgba(255, 255, 255, 0.08)", color: "var(--ro-text-muted)" }}
                      >
                        {s.totalClassesGiven} impartidas
                      </span>
                    ) : null}
                  </div>

                  <div className="coaching-card__actions" style={{ marginTop: "1rem" }}>
                    <button
                      type="button"
                      className="coaching-btn coaching-btn--primary"
                      disabled={!hasBalance || modalBusy}
                      onClick={() => openRecordClassModal(s)}
                    >
                      <TablerIcon name="check" size={15} />
                      {modalBusy && isModalOpenForThis ? "Registrando…" : "Registrar clase impartida (-1)"}
                    </button>
                    {!hasBalance ? (
                      <span className="coaching-muted" style={{ fontSize: "0.75rem", display: "block", marginTop: "0.25rem" }}>
                        Sin saldo. Solicita recarga al administrador del club.
                      </span>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal: Registrar Clase Impartida con Seguimiento Deportivo */}
      <Modal
        open={Boolean(modalStudent)}
        onClose={() => {
          if (!modalBusy) {
            setModalStudent(null);
            setModalSessionId(null);
          }
        }}
        title={
          modalSessionId
            ? `Registrar clase agendada impartida · ${modalStudent?.jugadorNombre || ""}`
            : `Registrar clase impartida · ${modalStudent?.jugadorNombre || ""}`
        }
        size="lg"
      >
        {modalStudent ? (
          <form onSubmit={handleConfirmClassRecord} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {modalSessionId && (
              <div
                style={{
                  background: "rgba(16, 185, 129, 0.12)",
                  border: "1px solid rgba(16, 185, 129, 0.35)",
                  borderRadius: "8px",
                  padding: "0.6rem 0.85rem",
                  color: "#86efac",
                  fontSize: "0.82rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <TablerIcon name="calendar-check" size={16} />
                <span>
                  <strong>Completando clase de agenda:</strong> Esta sesión pasará a estado completada y se debitará 1 clase del saldo del alumno.
                </span>
              </div>
            )}

            {modalError ? (
              <div
                className="coaching-panel"
                style={{
                  padding: "0.75rem 1rem",
                  background: "rgba(239, 68, 68, 0.12)",
                  border: "1px solid rgba(239, 68, 68, 0.35)",
                  borderRadius: "8px",
                  color: "#fca5a5",
                  fontSize: "0.85rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <TablerIcon name="alert-circle" size={18} />
                {modalError}
              </div>
            ) : null}

            <div style={{ background: "rgba(255, 255, 255, 0.04)", borderRadius: "8px", padding: "0.85rem 1rem", border: "1px solid var(--ro-border, rgba(255, 255, 255, 0.08))" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                <div>
                  <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ro-text-muted)" }}>
                    Alumno
                  </span>
                  <p style={{ margin: "0.2rem 0 0", fontWeight: 600, color: "var(--ro-text-primary)" }}>
                    {modalStudent.jugadorNombre} ({modalStudent.rivieraId})
                  </p>
                </div>
                <div>
                  <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ro-text-muted)" }}>
                    Saldo actual
                  </span>
                  <p style={{ margin: "0.2rem 0 0", fontWeight: 700, color: "#10b981", textAlign: "right" }}>
                    {modalStudent.balanceClasses ?? 0} clase(s)
                  </p>
                </div>
              </div>
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", color: "var(--ro-text-secondary)" }}>
                Al confirmar, se descontará automáticamente <strong>1 clase</strong> del saldo del alumno y la sesión quedará registrada en su historial deportivo.
              </p>
            </div>

            {/* Duración */}
            <div className="coaching-form-group">
              <label className="coaching-form-label" htmlFor="class-duration">
                Duración de la sesión
              </label>
              <select
                id="class-duration"
                className="coaching-input"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                disabled={modalBusy}
              >
                <option value={30}>30 minutos</option>
                <option value={45}>45 minutos</option>
                <option value={60}>60 minutos (Estándar)</option>
                <option value={90}>90 minutos (Clase y partido)</option>
                <option value={120}>120 minutos (Intensivo)</option>
              </select>
            </div>

            {/* Chips de temas técnicos */}
            <div className="coaching-form-group">
              <label className="coaching-form-label">
                Temas técnicos trabajados (Pádel)
              </label>
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", color: "var(--ro-text-muted)" }}>
                Selecciona uno o más conceptos trabajados durante la clase:
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.6rem" }}>
                {DEFAULT_PADEL_TOPICS.map((topic) => {
                  const selected = workedOnList.includes(topic);
                  return (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => toggleTopic(topic)}
                      disabled={modalBusy}
                      style={{
                        padding: "0.35rem 0.7rem",
                        borderRadius: "20px",
                        fontSize: "0.8rem",
                        fontWeight: selected ? 600 : 400,
                        border: selected
                          ? "1px solid #10b981"
                          : "1px solid var(--ro-border, rgba(255, 255, 255, 0.15))",
                        background: selected ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.05)",
                        color: selected ? "#34d399" : "var(--ro-text-secondary)",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {selected ? "✓ " : "+ "}
                      {topic}
                    </button>
                  );
                })}
              </div>

              {/* Tema personalizado */}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  className="coaching-input"
                  style={{ flex: 1 }}
                  placeholder="Otro tema específico (ej. Bajada de pared paralela)…"
                  value={customTopic}
                  onChange={(e) => setCustomTopic(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomTopic();
                    }
                  }}
                  disabled={modalBusy}
                />
                <button
                  type="button"
                  className="coaching-btn coaching-btn--secondary"
                  onClick={addCustomTopic}
                  disabled={modalBusy || !customTopic.trim()}
                >
                  Agregar
                </button>
              </div>

              {workedOnList.length > 0 ? (
                <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--ro-text-muted)", alignSelf: "center", marginRight: "0.25rem" }}>
                    Seleccionados ({workedOnList.length}):
                  </span>
                  {workedOnList.map((t) => (
                    <span
                      key={t}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        padding: "0.2rem 0.5rem",
                        borderRadius: "12px",
                        fontSize: "0.75rem",
                        background: "rgba(16, 185, 129, 0.15)",
                        color: "#a7f3d0",
                        border: "1px solid rgba(16, 185, 129, 0.3)",
                      }}
                    >
                      {t}
                      <button
                        type="button"
                        onClick={() => toggleTopic(t)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#a7f3d0",
                          cursor: "pointer",
                          padding: 0,
                          fontSize: "0.85rem",
                          lineHeight: 1,
                        }}
                        aria-label={`Eliminar ${t}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Mejoras observadas */}
            <div className="coaching-form-group">
              <label className="coaching-form-label" htmlFor="improvements-field">
                Mejoras observadas (Seguimiento técnico)
              </label>
              <textarea
                id="improvements-field"
                className="coaching-input"
                rows={2}
                placeholder="¿Qué avances notaste hoy? (ej. Mayor consistencia en voleas profundas, mejor ajuste de piernas antes del impacto)…"
                value={improvements}
                onChange={(e) => setImprovements(e.target.value)}
                disabled={modalBusy}
              />
            </div>

            {/* Próximos objetivos */}
            <div className="coaching-form-group">
              <label className="coaching-form-label" htmlFor="next-goals-field">
                Próximos objetivos para el alumno
              </label>
              <textarea
                id="next-goals-field"
                className="coaching-input"
                rows={2}
                placeholder="¿Qué trabajarán en la siguiente sesión? (ej. Transición red-defensa tras globo rival, bajada de pared)…"
                value={nextGoals}
                onChange={(e) => setNextGoals(e.target.value)}
                disabled={modalBusy}
              />
            </div>

            {/* Mensaje motivacional / Feedback personal */}
            <div className="coaching-form-group">
              <label className="coaching-form-label" htmlFor="motivational-field">
                Mensaje motivacional / Feedback personal
              </label>
              <textarea
                id="motivational-field"
                className="coaching-input"
                rows={2}
                placeholder="Mensaje que verá tu alumno en su app (ej. ¡Gran intensidad hoy! Mantén esa concentración en los puntos de quiebre)…"
                value={motivationalMessage}
                onChange={(e) => setMotivationalMessage(e.target.value)}
                disabled={modalBusy}
              />
            </div>

            {/* Notas internas del coach */}
            <div className="coaching-form-group">
              <label className="coaching-form-label" htmlFor="class-notes">
                Notas internas del coach (opcional)
              </label>
              <input
                id="class-notes"
                type="text"
                className="coaching-input"
                placeholder="Observaciones adicionales o recordatorio personal…"
                value={classNotes}
                onChange={(e) => setClassNotes(e.target.value)}
                disabled={modalBusy}
              />
            </div>

            {/* Acciones */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                className="coaching-btn coaching-btn--secondary"
                disabled={modalBusy}
                onClick={() => {
                  setModalStudent(null);
                  setModalSessionId(null);
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="coaching-btn coaching-btn--primary"
                disabled={modalBusy}
              >
                <TablerIcon name="check" size={16} />
                {modalBusy ? "Registrando clase…" : "Confirmar clase impartida (-1)"}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>

      {/* Modal: Detalles de la Clase Programada */}
      <Modal
        open={Boolean(detailsSession)}
        onClose={() => setDetailsSession(null)}
        title="Detalles de la Clase Programada"
      >
        {detailsSession ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "10px",
                padding: "1rem",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "0.75rem",
              }}
            >
              <div>
                <span className="coaching-muted" style={{ fontSize: "0.75rem", display: "block" }}>
                  Alumno
                </span>
                <span style={{ fontWeight: 600, color: "var(--ro-text-main, #f8fafc)" }}>
                  {detailsSession.jugadorNombre || "Alumno"}
                </span>
                {detailsSession.rivieraId && (
                  <span style={{ display: "block", fontSize: "0.75rem", color: "var(--ro-primary, #10b981)", fontFamily: "monospace" }}>
                    {detailsSession.rivieraId}
                  </span>
                )}
              </div>

              <div>
                <span className="coaching-muted" style={{ fontSize: "0.75rem", display: "block" }}>
                  Fecha y Hora
                </span>
                <span style={{ fontWeight: 600, color: "var(--ro-text-main, #f8fafc)" }}>
                  {formatSessionDate(detailsSession.startsAt)}
                </span>
                <span style={{ display: "block", fontSize: "0.75rem", color: "var(--ro-text-muted)" }}>
                  {detailsSession.durationMinutes} minutos
                </span>
              </div>

              <div>
                <span className="coaching-muted" style={{ fontSize: "0.75rem", display: "block" }}>
                  Pista / Cancha
                </span>
                <span style={{ fontWeight: 600, color: "var(--ro-text-main, #f8fafc)" }}>
                  {detailsSession.court || "No especificada"}
                </span>
              </div>

              <div>
                <span className="coaching-muted" style={{ fontSize: "0.75rem", display: "block" }}>
                  Enfoque pedagógico
                </span>
                <span style={{ fontWeight: 600, color: "var(--ro-brand, #38bdf8)" }}>
                  {detailsSession.focus || "Técnica / Táctica general"}
                </span>
              </div>

              <div>
                <span className="coaching-muted" style={{ fontSize: "0.75rem", display: "block" }}>
                  Saldo del alumno
                </span>
                <span style={{ fontWeight: 600, color: (detailsSession.balanceClasses ?? 0) > 0 ? "#34d399" : "#fbbf24" }}>
                  {detailsSession.balanceClasses ?? "—"} clases disponibles
                </span>
              </div>

              <div>
                <span className="coaching-muted" style={{ fontSize: "0.75rem", display: "block" }}>
                  Estado
                </span>
                <span
                  className="coaching-badge"
                  style={{
                    display: "inline-block",
                    background: "rgba(16, 185, 129, 0.15)",
                    color: "#34d399",
                    border: "1px solid rgba(16, 185, 129, 0.35)",
                    fontSize: "0.72rem",
                  }}
                >
                  {detailsSession.status}
                </span>
              </div>
            </div>

            {detailsSession.notesSummary && (
              <div
                style={{
                  background: "rgba(56, 189, 248, 0.05)",
                  border: "1px solid rgba(56, 189, 248, 0.2)",
                  borderRadius: "8px",
                  padding: "0.75rem 1rem",
                }}
              >
                <div style={{ fontSize: "0.75rem", color: "#7dd3fc", fontWeight: 600, marginBottom: "0.25rem" }}>
                  Instrucciones o Enfoque de la Clase:
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--ro-text-main, #f8fafc)" }}>
                  {detailsSession.notesSummary}
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                className="coaching-btn coaching-btn--secondary"
                onClick={() => setDetailsSession(null)}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="coaching-btn coaching-btn--primary"
                onClick={() => {
                  const s = detailsSession;
                  openRecordClassForScheduled(s);
                }}
              >
                <TablerIcon name="check" size={16} />
                Registrar clase impartida (-1)
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

