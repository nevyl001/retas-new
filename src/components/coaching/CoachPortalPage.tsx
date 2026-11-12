import React, { useEffect, useState } from "react";
import { useUser } from "../../contexts/UserContext";
import {
  fetchCurrentCoachProfile,
  fetchCoachAssignedStudents,
  recordCoachClassSessionWithFollowup,
  generateCoachingIdempotencyKey,
  fetchCoachAgenda,
  fetchCoachClassFollowup,
  fetchCoachFollowupDigest,
  updateCoachClassFollowup,
} from "../../lib/coaching/coachingApi";
import type {
  CurrentCoachProfile,
  CoachingPlayerLink,
  CoachScheduledSession,
  CoachClassFollowup,
  CoachFollowupDigest,
} from "../../lib/coaching/types";
import { selectOperativeCoachClubId } from "../../lib/coaching/studentTrainingScope";
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
  "Derecha y revés",
  "Defensa de fondo",
  "Desplazamiento",
  "Condición física",
  "Toma de decisiones",
];

function getInitials(nameOrEmail: string): string {
  const clean = nameOrEmail.trim();
  if (!clean) return "CO";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

export const CoachPortalPage: React.FC = () => {
  const { user, loading: userLoading } = useUser();
  const [profile, setProfile] = useState<CurrentCoachProfile | null>(null);
  const [photoBroken, setPhotoBroken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedClubId, setSelectedClubId] = useState<string>("");
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
  const [areasToImprove, setAreasToImprove] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [editingFollowup, setEditingFollowup] = useState(false);
  const [digestByRelationship, setDigestByRelationship] = useState<
    Record<string, CoachFollowupDigest>
  >({});
  const [followupStudent, setFollowupStudent] = useState<CoachingPlayerLink | null>(null);
  const [followupSessions, setFollowupSessions] = useState<CoachClassFollowup[]>([]);
  const [followupError, setFollowupError] = useState<string | null>(null);
  const [modalKey, setModalKey] = useState("");
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [followupBaseline, setFollowupBaseline] = useState("");

  const loadStudents = React.useCallback(async (coachId: string, clubId: string) => {
    if (!coachId || !clubId) return;
    setLoadingStudents(true);
    setStudentsError(null);
    try {
      const data = await fetchCoachAssignedStudents(coachId, clubId);
      setStudents(data);
      try {
        const digest = await fetchCoachFollowupDigest(clubId);
        const map: Record<string, CoachFollowupDigest> = {};
        for (const row of digest) map[row.relationshipId] = row;
        setDigestByRelationship(map);
      } catch (digestErr) {
        console.error("[coaching] followup digest", digestErr);
        setDigestByRelationship({});
      }
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

  const selectedMembership =
    profile?.memberships.find(
      (membership) => membership.organizadorId === selectedClubId
    ) ?? null;
  const canOperateClub = selectedMembership?.status === "ACTIVE";

  useEffect(() => {
    if (profile && selectedClubId && canOperateClub) {
      void loadStudents(profile.id, selectedClubId);
      void loadUpcoming(selectedClubId);
    } else {
      setStudents([]);
      setUpcomingSessions([]);
    }
  }, [profile, selectedClubId, canOperateClub, loadStudents, loadUpcoming]);

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
          if (coachProfile) {
            setSelectedClubId(
              selectOperativeCoachClubId(coachProfile.memberships) ?? ""
            );
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
    if (st.status === "PAUSED") {
      setStudentsError(
        "El alumno está en pausa. El administrador del club debe reactivar la relación para registrar clases."
      );
      return;
    }
    setModalStudent(st);
    setModalSessionId(null);
    setWorkedOnList([]);
    setCustomTopic("");
    setImprovements("");
    setAreasToImprove("");
    setRecommendations("");
    setNextGoals("");
    setMotivationalMessage("");
    setDurationMinutes(60);
    setClassNotes("");
    setEditingFollowup(false);
    setFollowupBaseline(
      JSON.stringify({
        workedOn: [] as string[],
        improvements: "",
        areas: "",
        recommendations: "",
        nextGoals: "",
        message: "",
        notes: "",
      })
    );
    setModalError(null);
    setModalKey(generateCoachingIdempotencyKey("session"));
  };

  const openRecordClassForScheduled = (sess: CoachScheduledSession) => {
    const matched = students.find((st) => st.jugadorId === sess.jugadorId);
    if (matched && matched.status === "PAUSED") {
      setUpcomingError(
        "No se puede registrar una clase para un alumno en pausa. El administrador debe reactivar la relación."
      );
      return;
    }
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
    setAreasToImprove("");
    setRecommendations("");
    setNextGoals("");
    setMotivationalMessage("");
    setDurationMinutes(sess.durationMinutes || 60);
    setClassNotes("");
    setEditingFollowup(false);
    setFollowupBaseline(
      JSON.stringify({
        workedOn: sess.focus ? [sess.focus] : [],
        improvements: "",
        areas: "",
        recommendations: "",
        nextGoals: "",
        message: "",
        notes: "",
      })
    );
    setModalError(null);
    setModalKey(generateCoachingIdempotencyKey("session"));
    setDetailsSession(null);
  };

  const toggleTopic = (topic: string) => {
    setWorkedOnList((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
    );
  };

  const openStudentFollowup = async (student: CoachingPlayerLink) => {
    setFollowupStudent(student);
    setFollowupSessions([]);
    setFollowupError(null);
    try {
      setFollowupSessions(await fetchCoachClassFollowup(student.id));
    } catch (err) {
      setFollowupError(err instanceof Error ? err.message : "No se pudo abrir el seguimiento.");
    }
  };

  const openEditFollowup = (session: CoachClassFollowup) => {
    if (!followupStudent) return;
    setModalStudent(followupStudent);
    setModalSessionId(session.id);
    setEditingFollowup(true);
    setWorkedOnList(session.workedOn);
    setCustomTopic("");
    setImprovements(session.improvements ?? "");
    setAreasToImprove(session.areasToImprove ?? "");
    setRecommendations(session.recommendations ?? "");
    setNextGoals(session.nextGoals ?? "");
    setMotivationalMessage(session.motivationalMessage ?? "");
    setClassNotes(session.privateNotes ?? "");
    setDurationMinutes(session.durationMinutes || 60);
    setFollowupBaseline(
      JSON.stringify({
        workedOn: session.workedOn,
        improvements: session.improvements ?? "",
        areas: session.areasToImprove ?? "",
        recommendations: session.recommendations ?? "",
        nextGoals: session.nextGoals ?? "",
        message: session.motivationalMessage ?? "",
        notes: session.privateNotes ?? "",
      })
    );
    setModalError(null);
  };

  const closeClassModal = () => {
    if (modalBusy) return;
    const dirty =
      JSON.stringify({
        workedOn: workedOnList,
        improvements,
        areas: areasToImprove,
        recommendations,
        nextGoals,
        message: motivationalMessage,
        notes: classNotes,
      }) !== followupBaseline;
    if (dirty && !window.confirm("Hay cambios sin guardar. ¿Salir sin guardar?")) return;
    setModalStudent(null);
    setModalSessionId(null);
    setEditingFollowup(false);
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
      const followup = {
        workedOn: workedOnList,
        improvements: improvements.trim() || null,
        areasToImprove: areasToImprove.trim() || null,
        recommendations: recommendations.trim() || null,
        nextGoals: nextGoals.trim() || null,
        motivationalMessage: motivationalMessage.trim() || null,
        privateNotes: classNotes.trim() || null,
      };
      if (editingFollowup && modalSessionId) {
        await updateCoachClassFollowup({ sessionId: modalSessionId, ...followup });
        setSuccessMessage("Seguimiento actualizado. No se descontó otra clase.");
        setModalStudent(null);
        setEditingFollowup(false);
        if (followupStudent) {
          setFollowupSessions(await fetchCoachClassFollowup(followupStudent.id));
        }
        if (profile && selectedClubId) {
          await loadStudents(profile.id, selectedClubId);
        }
        return;
      }
      // Una sola RPC: descuento + seguimiento. Si falla el seguimiento, no queda debito parcial.
      const res = await recordCoachClassSessionWithFollowup({
        relationshipId: modalStudent.id,
        sessionId: modalSessionId || undefined,
        workedOn: workedOnList,
        improvements: improvements.trim() || undefined,
        areasToImprove: areasToImprove.trim() || undefined,
        recommendations: recommendations.trim() || undefined,
        nextGoals: nextGoals.trim() || undefined,
        motivationalMessage: motivationalMessage.trim() || undefined,
        privateNotes: classNotes.trim() || undefined,
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
      <div className="coaching-page coaching-coach-portal rv-page">
        <div className="coach-portal-container">
          <header className="coach-portal-hero">
            <div className="coach-portal-topbar">
              <button
                type="button"
                className="coach-portal-back"
                onClick={() => navigateToAppHome()}
              >
                <TablerIcon name="arrow-left" size={15} />
                Inicio
              </button>
            </div>
            <p className="coach-portal-kicker">Riviera Coaching · Espacio del Coach</p>
            <h1 className="coach-portal-title">Espacio del Coach</h1>
            <p className="coach-portal-subtitle">Verificando credenciales de coach…</p>
          </header>
        </div>
      </div>
    );
  }

  // Si no hay sesión autenticada
  if (!user) {
    return (
      <div className="coaching-page coaching-coach-portal rv-page">
        <div className="coach-portal-container">
          <header className="coach-portal-hero">
            <div className="coach-portal-topbar">
              <button
                type="button"
                className="coach-portal-back"
                onClick={() => navigateToAppHome()}
              >
                <TablerIcon name="arrow-left" size={15} />
                Inicio
              </button>
            </div>
            <p className="coach-portal-kicker">Riviera Coaching · Espacio del Coach</p>
            <h1 className="coach-portal-title">Espacio del Coach</h1>
          </header>

          <div className="coaching-empty-card" style={{ padding: "2.5rem 1.5rem", textAlign: "center" }}>
            <TablerIcon name="lock" size={44} className="coaching-empty-icon" />
            <h3 style={{ marginTop: "1rem", fontSize: "1.2rem" }}>Sesión requerida</h3>
            <p style={{ maxWidth: "480px", margin: "0.5rem auto 1.5rem" }}>
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
      </div>
    );
  }

  // Si el usuario autenticado no está registrado como coach en public.riviera_coaches
  if (!profile) {
    return (
      <div className="coaching-page coaching-coach-portal rv-page">
        <div className="coach-portal-container">
          <header className="coach-portal-hero">
            <div className="coach-portal-topbar">
              <button
                type="button"
                className="coach-portal-back"
                onClick={() => navigateToAppHome()}
              >
                <TablerIcon name="arrow-left" size={15} />
                Inicio
              </button>
            </div>
            <p className="coach-portal-kicker">Riviera Coaching · Espacio del Coach</p>
            <h1 className="coach-portal-title">Espacio del Coach</h1>
          </header>

          <div className="coaching-empty-card" style={{ padding: "2.5rem 1.5rem", textAlign: "center" }}>
            <TablerIcon
              name="user-x"
              size={44}
              className="coaching-empty-icon"
            />
            <h3 style={{ marginTop: "1rem", fontSize: "1.2rem" }}>Acceso exclusivo para entrenadores</h3>
            <p style={{ maxWidth: "480px", margin: "0.5rem auto 0.5rem" }}>
              La cuenta autenticada (<strong>{user.email}</strong>) no está
              registrada como coach oficial en Riviera Coaching.
            </p>
            <p className="coaching-muted" style={{ maxWidth: "450px", margin: "0.5rem auto 1.5rem" }}>
              Si entrenas en un club de Riviera Open, el administrador del club
              registra tu acceso y te entrega las credenciales.
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
      </div>
    );
  }

  const coachFirstName = profile.nombre.trim().split(/\s+/)[0] || profile.nombre;
  const coachPhotoUrl =
    profile.fotoUrl ||
    (typeof user?.user_metadata?.avatar_url === "string"
      ? user.user_metadata.avatar_url.trim()
      : null) ||
    null;
  const coachInitials = getInitials(profile.nombre);

  return (
    <div className="coaching-page coaching-coach-portal rv-page">
      <div className="coach-portal-container">
        {/* Encabezado Principal */}
        <header className="coach-portal-hero">
          <div className="coach-portal-topbar">
            <button
              type="button"
              className="coach-portal-back"
              onClick={() => navigateToAppHome()}
            >
              <TablerIcon name="arrow-left" size={15} />
              Inicio
            </button>
          </div>
          <p className="coach-portal-kicker">Riviera Coaching · Espacio del Coach</p>
          <h1 className="coach-portal-title">
            Hola, {coachFirstName}
          </h1>
          <p className="coach-portal-subtitle">
            Gestiona tu actividad como coach desde un solo lugar.
          </p>
        </header>

        {/* Tarjeta de Identidad Oficial del Coach */}
        <section className="coach-identity-card" aria-label="Identidad del Coach">
          <div className="coach-identity-card__header">
            <div className="coach-identity-avatar-wrap">
              <div className="coach-identity-avatar" aria-hidden>
                {coachPhotoUrl && !photoBroken ? (
                  <img
                    src={coachPhotoUrl}
                    alt={profile.nombre}
                    className="coach-identity-avatar__img"
                    onError={() => setPhotoBroken(true)}
                  />
                ) : (
                  <div className="coach-identity-avatar__fallback">
                    {coachInitials}
                  </div>
                )}
              </div>
            </div>

            <div className="coach-identity-info">
              <div className="coach-identity-title-row">
                <h2 className="coach-identity-name">{profile.nombre}</h2>
                <div className="coach-identity-badge">
                  <span className="coach-identity-badge__label">COACH ID</span>
                  <span className="coach-identity-badge__code">{profile.coachCode}</span>
                </div>
              </div>

              {profile.bio ? (
                <p className="coach-identity-bio">{profile.bio}</p>
              ) : null}

              {(profile.fuerzas.length > 0 || profile.especialidades.length > 0) && (
                <div className="coach-identity-meta-grid">
                  {profile.fuerzas.length > 0 ? (
                    <div className="coach-identity-group">
                      <span className="coach-identity-group__label">Fuerzas que entrenas</span>
                      <div className="coach-identity-chips">
                        {profile.fuerzas.map((f) => (
                          <span key={f} className="coach-identity-chip">
                            {JUGADOR_CATEGORIA_LABELS[f] || f}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {profile.especialidades.length > 0 ? (
                    <div className="coach-identity-group">
                      <span className="coach-identity-group__label">Especialidades</span>
                      <div className="coach-identity-chips">
                        {profile.especialidades.map((esp) => (
                          <span key={esp} className="coach-identity-chip coach-identity-chip--spec">
                            {esp}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Membresías y Clubes Asociados (Aislamiento Multi-Club) */}
        <section className="coach-portal-section" aria-label="Clubes afiliados">
          <div className="coach-portal-section-header">
            <div>
              <h2 className="coach-portal-section-title">Clubes afiliados</h2>
              <p className="coach-portal-section-desc">
                Organizaciones y clubes donde tienes membresía técnica registrada.
              </p>
            </div>
          </div>

          {profile.memberships.length === 0 ? (
            <div className="coaching-empty-card" style={{ padding: "2rem", textAlign: "center" }}>
              <TablerIcon name="building" size={36} className="coaching-empty-icon" />
              <h3>Sin membresía activa en clubes</h3>
              <p>
                Tu perfil de coach está listo. En cuanto un club te agregue a su
                academia, aparecerá aquí su entorno operativo.
              </p>
            </div>
          ) : (
            <div className="coach-clubs-grid">
              {profile.memberships.map((m) => {
                const isStatusActive = m.status === "ACTIVE";
                const isActiveClub =
                  isStatusActive && m.organizadorId === selectedClubId;
                const isStatusPending = m.status === "PENDING";

                return (
                  <article
                    key={m.membershipId}
                    className={`coach-club-card coaching-card${isActiveClub ? " coaching-card--highlight" : ""}`}
                  >
                    <div className="coach-club-card__header">
                      <h3 className="coach-club-card__name">
                        {m.clubNombre?.trim() || "Club"}
                      </h3>
                      {isStatusActive ? (
                        <span className="coaching-badge coaching-badge--active">
                          Activo
                        </span>
                      ) : isStatusPending ? (
                        <span className="coaching-badge coaching-badge--pending">
                          Pendiente de configuración
                        </span>
                      ) : (
                        <span className="coaching-badge coaching-badge--inactive">
                          Inactivo
                        </span>
                      )}
                    </div>

                    <div className="coach-club-card__footer">
                      {isStatusPending ? (
                        <span className="coach-club-card__note">
                          El club todavía no habilitó este acceso.
                        </span>
                      ) : isActiveClub ? (
                        <span className="coach-club-status-selected">
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
                        <span className="coach-club-card__note">
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
          <div className="coach-portal-alert coach-portal-alert--success">
            <TablerIcon name="check" size={18} />
            <span>{successMessage}</span>
          </div>
        ) : null}

        {canOperateClub ? (
          <>
            {/* Agenda: Próximas Clases Agendadas del Coach */}
            <section className="coach-portal-section" aria-label="Próximas clases">
              <div className="coach-portal-section-header">
                <div>
                  <h2 className="coach-portal-section-title">Mis Próximas Clases Agendadas</h2>
                  <p className="coach-portal-section-desc">
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
                <div className="coach-portal-alert coach-portal-alert--error" style={{ justifyContent: "space-between" }}>
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
                    padding: "1.75rem",
                    textAlign: "center",
                    background: "var(--coach-surface)",
                    borderRadius: "12px",
                    border: "1px dashed var(--coach-border)",
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
                        className="coach-session-card"
                      >
                        {/* Info horario, alumno, pista */}
                        <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
                          <div className="coach-session-card__date-box">
                            <div className="coach-session-card__date">
                              {formattedDate}
                            </div>
                            <div className="coach-session-card__duration">
                              {session.durationMinutes} min {session.court ? `• ${session.court}` : ""}
                            </div>
                          </div>

                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                              <span className="coach-session-card__student-name">
                                {session.jugadorNombre || "Alumno"}
                              </span>
                              {session.rivieraId && (
                                <span className="coach-session-card__riviera-id">
                                  {session.rivieraId}
                                </span>
                              )}
                              {session.clubNombre && (
                                <span className="coach-session-card__club-name">
                                  ({session.clubNombre})
                                </span>
                              )}
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
                              {session.focus && (
                                <span className="coach-session-card__focus">
                                  <TablerIcon name="target" size={13} />
                                  {session.focus}
                                </span>
                              )}
                              {session.balanceClasses !== undefined && (
                                <span
                                  className="coaching-badge"
                                  style={{
                                    background: session.balanceClasses > 0 ? "var(--coach-accent-green-bg)" : "rgba(245, 158, 11, 0.12)",
                                    color: session.balanceClasses > 0 ? "var(--coach-accent-green)" : "#fbbf24",
                                    border: session.balanceClasses > 0 ? "1px solid var(--coach-accent-green-border)" : "1px solid rgba(245, 158, 11, 0.3)",
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
                          <span className="coaching-badge coaching-badge--active">
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
            <section className="coach-portal-section" aria-label="Alumnos y control de clases">
              <div className="coach-portal-section-header">
                <div>
                  <h2 className="coach-portal-section-title">Alumnos y Control de Clases</h2>
                  <p className="coach-portal-section-desc">
                    Consulta los alumnos asignados por el club y registra las clases impartidas para descontar su saldo automáticamente.
                  </p>
                </div>
              </div>

              {loadingStudents ? (
                <p className="coaching-muted">Cargando alumnos y saldos…</p>
              ) : studentsError ? (
                <div className="coach-portal-alert coach-portal-alert--error" style={{ justifyContent: "space-between" }}>
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
                <div className="coaching-empty-card" style={{ padding: "2rem", textAlign: "center" }}>
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
                    const card = digestByRelationship[s.id];
                    const categoryLabel = card?.categoria
                      ? JUGADOR_CATEGORIA_LABELS[card.categoria as keyof typeof JUGADOR_CATEGORIA_LABELS] ||
                        card.categoria
                      : null;

                    return (
                      <article key={s.id} className="coaching-card" style={{ padding: "1.25rem" }}>
                        <div className="coaching-card__top">
                          <div className="coaching-card__avatar" aria-hidden>
                            {card?.fotoUrl ? (
                              <img src={card.fotoUrl} alt="" />
                            ) : (
                              s.jugadorNombre.slice(0, 1).toUpperCase()
                            )}
                          </div>
                          <div className="coaching-card__identity">
                            <h3 className="coaching-card__title">{s.jugadorNombre}</h3>
                            <span className="coaching-card__code">{s.rivieraId}</span>
                          </div>
                          <span
                            className={`coaching-badge coaching-badge--${
                              s.status === "ACTIVE"
                                ? "active"
                                : s.status === "PAUSED"
                                ? "pending"
                                : "inactive"
                            }`}
                          >
                            {s.status === "ACTIVE"
                              ? "Activo"
                              : s.status === "PAUSED"
                              ? "En pausa"
                              : "Inactivo"}
                          </span>
                        </div>

                        {/* Estado de Clases Disponibles */}
                        <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                          <span
                            className={`coaching-badge ${hasBalance ? "coaching-badge--active" : "coaching-badge--inactive"}`}
                            style={{ fontWeight: 600, padding: "0.3rem 0.65rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                          >
                            <TablerIcon name="calendar-event" size={14} />
                            {s.balanceClasses ?? 0} clases disponibles
                          </span>
                          {(s.totalClassesGiven ?? 0) > 0 ? (
                            <span
                              className="coaching-badge coaching-badge--inactive"
                            >
                              {s.totalClassesGiven} impartidas
                            </span>
                          ) : null}
                        </div>

                        <p className="coaching-follow__meta" style={{ marginTop: "0.6rem" }}>
                          {categoryLabel ? `Categoría: ${categoryLabel}. ` : ""}
                          Última sesión: {card?.lastSessionAt ? formatSessionDate(card.lastSessionAt) : "sin clases impartidas"}.
                          {" "}
                          Próxima: {card?.nextSessionAt ? formatSessionDate(card.nextSessionAt) : "sin clase agendada"}.
                          {card?.lastGoal ? ` Objetivo: ${card.lastGoal}` : ""}
                        </p>

                        <div className="coaching-card__actions" style={{ marginTop: "1rem" }}>
                          <button
                            type="button"
                            className="coaching-btn coaching-btn--secondary"
                            onClick={() => void openStudentFollowup(s)}
                          >
                            Ver seguimiento
                          </button>
                          <button
                            type="button"
                            className="coaching-btn coaching-btn--primary"
                            disabled={!hasBalance || modalBusy || s.status === "PAUSED"}
                            onClick={() => openRecordClassModal(s)}
                          >
                            <TablerIcon name="check" size={15} />
                            {modalBusy && isModalOpenForThis ? "Registrando…" : "Registrar clase impartida (-1)"}
                          </button>
                          {s.status === "PAUSED" ? (
                            <span className="coaching-muted" style={{ fontSize: "0.75rem", display: "block", marginTop: "0.25rem", color: "#fbbf24" }}>
                              Alumno en pausa. El administrador del club debe reactivarlo para registrar clases.
                            </span>
                          ) : !hasBalance ? (
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
          </>
        ) : profile.memberships.length > 0 ? (
          <section className="coach-portal-section" aria-label="Sin club activo">
            <div className="coaching-empty-card" style={{ padding: "2rem", textAlign: "center" }}>
              <TablerIcon name="building" size={36} className="coaching-empty-icon" />
              <h3>Sin club activo para operar</h3>
              <p>
                Acepta una invitación pendiente o espera a que el club reactive tu
                membresía. Mientras tanto no se cargan alumnos ni se registran clases.
              </p>
            </div>
          </section>
        ) : null}
      </div>

      {/* Modal: Registrar Clase Impartida con Seguimiento Deportivo */}
      <Modal
        open={Boolean(modalStudent)}
        onClose={closeClassModal}
        className="coach-portal-modal"
        title={
          editingFollowup
            ? `Editar seguimiento · ${modalStudent?.jugadorNombre || ""}`
            : modalSessionId
            ? `Registrar clase agendada impartida · ${modalStudent?.jugadorNombre || ""}`
            : `Registrar clase impartida · ${modalStudent?.jugadorNombre || ""}`
        }
        size="lg"
      >
        {modalStudent ? (
          <form className="coach-class-form" onSubmit={handleConfirmClassRecord}>
            {modalSessionId && !editingFollowup && (
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

            <div className="coach-class-form__student">
              <div>
                <span className="coach-class-form__kicker">Alumno</span>
                <p className="coach-class-form__student-name">
                  {modalStudent.jugadorNombre}
                  <span>{modalStudent.rivieraId}</span>
                </p>
              </div>
              <div className="coach-class-form__balance">
                <span className="coach-class-form__kicker">Saldo</span>
                <p>{modalStudent.balanceClasses ?? 0} clases</p>
              </div>
            </div>
            <p className="coach-class-form__note">
              {editingFollowup
                ? "Guardar actualiza el seguimiento. No descuenta otra clase ni cambia la fecha."
                : "Al confirmar se descuenta 1 clase y este seguimiento queda en el historial del alumno."}
            </p>

            <section className="coach-class-form__section">
              <h3>La clase</h3>
              <div className="coaching-form-group">
                <label className="coaching-form-label" htmlFor="class-duration">
                  Duración
                </label>
                <select
                  id="class-duration"
                  className="coaching-input"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  disabled={modalBusy || editingFollowup}
                >
                  <option value={30}>30 minutos</option>
                  <option value={45}>45 minutos</option>
                  <option value={60}>60 minutos</option>
                  <option value={90}>90 minutos</option>
                  <option value={120}>120 minutos</option>
                </select>
              </div>

              <div className="coaching-form-group">
                <span className="coaching-form-label">Temas trabajados</span>
                <p className="coach-class-form__hint">Toca los que se practicaron hoy.</p>
                <div className="coach-class-form__topics">
                  {DEFAULT_PADEL_TOPICS.map((topic) => {
                    const selected = workedOnList.includes(topic);
                    return (
                      <button
                        key={topic}
                        type="button"
                        className={`coach-class-form__topic${selected ? " is-on" : ""}`}
                        onClick={() => toggleTopic(topic)}
                        disabled={modalBusy}
                        aria-pressed={selected}
                      >
                        {topic}
                      </button>
                    );
                  })}
                </div>

                <div className="coach-class-form__custom">
                  <input
                    type="text"
                    className="coaching-input"
                    placeholder="Otro tema, por ejemplo bajada de pared"
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

                {workedOnList.some((topic) => !DEFAULT_PADEL_TOPICS.includes(topic)) ? (
                  <div className="coach-class-form__topics">
                    {workedOnList
                      .filter((topic) => !DEFAULT_PADEL_TOPICS.includes(topic))
                      .map((topic) => (
                        <button
                          key={topic}
                          type="button"
                          className="coach-class-form__topic is-on"
                          onClick={() => toggleTopic(topic)}
                          aria-label={`Quitar ${topic}`}
                        >
                          {topic}
                        </button>
                      ))}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="coach-class-form__section">
              <h3>Seguimiento del alumno</h3>
              <p className="coach-class-form__hint">
                El alumno ve estos cuatro puntos en su panel. Escríbelos en una frase clara.
              </p>
              <div className="coaching-form-group">
                <label className="coaching-form-label" htmlFor="improvements-field">
                  Qué mejoró hoy
                </label>
                <textarea
                  id="improvements-field"
                  className="coaching-input"
                  rows={2}
                  placeholder="Ejemplo: las voleas ya llegan más profundas."
                  value={improvements}
                  onChange={(e) => setImprovements(e.target.value)}
                  disabled={modalBusy}
                />
              </div>
              <div className="coaching-form-group">
                <label className="coaching-form-label" htmlFor="areas-field">
                  Qué debe seguir trabajando
                </label>
                <textarea
                  id="areas-field"
                  className="coaching-input"
                  rows={2}
                  placeholder="Ejemplo: el primer paso hacia la red."
                  value={areasToImprove}
                  onChange={(e) => setAreasToImprove(e.target.value)}
                  disabled={modalBusy}
                />
              </div>
              <div className="coaching-form-group">
                <label className="coaching-form-label" htmlFor="recommendations-field">
                  Qué practicar
                </label>
                <textarea
                  id="recommendations-field"
                  className="coaching-input"
                  rows={2}
                  placeholder="Ejemplo: 20 voleas de derecha antes del partido."
                  value={recommendations}
                  onChange={(e) => setRecommendations(e.target.value)}
                  disabled={modalBusy}
                />
              </div>
              <div className="coaching-form-group">
                <label className="coaching-form-label" htmlFor="next-goals-field">
                  Objetivo de la siguiente clase
                </label>
                <textarea
                  id="next-goals-field"
                  className="coaching-input"
                  rows={2}
                  placeholder="Ejemplo: bajar la pared sin regalar el punto."
                  value={nextGoals}
                  onChange={(e) => setNextGoals(e.target.value)}
                  disabled={modalBusy}
                />
              </div>
              <div className="coaching-form-group">
                <label className="coaching-form-label" htmlFor="motivational-field">
                  Mensaje para el alumno
                </label>
                <textarea
                  id="motivational-field"
                  className="coaching-input"
                  rows={2}
                  placeholder="Una frase que verá en su panel."
                  value={motivationalMessage}
                  onChange={(e) => setMotivationalMessage(e.target.value)}
                  disabled={modalBusy}
                />
              </div>
            </section>

            <section className="coach-class-form__section coach-class-form__section--private">
              <h3>Nota privada</h3>
              <p className="coach-class-form__hint">
                Solo la ven el coach, el club y un administrador. El alumno no la ve.
              </p>
              <textarea
                id="class-notes"
                className="coaching-input"
                rows={2}
                placeholder="Apunte interno de la sesión."
                value={classNotes}
                onChange={(e) => setClassNotes(e.target.value)}
                disabled={modalBusy}
              />
            </section>

            {/* Acciones */}
            <div className="coach-class-form__actions">
              {JSON.stringify({
                workedOn: workedOnList,
                improvements,
                areas: areasToImprove,
                recommendations,
                nextGoals,
                message: motivationalMessage,
                notes: classNotes,
              }) !== followupBaseline ? (
                <span className="coaching-follow__meta">Cambios sin guardar</span>
              ) : null}
              <button
                type="button"
                className="coaching-btn coaching-btn--secondary"
                disabled={modalBusy}
                onClick={closeClassModal}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="coaching-btn coaching-btn--primary"
                disabled={modalBusy}
              >
                <TablerIcon name="check" size={16} />
                {modalBusy
                  ? "Guardando…"
                  : editingFollowup
                  ? "Guardar seguimiento"
                  : "Confirmar clase impartida (-1)"}
              </button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(followupStudent)}
        onClose={() => setFollowupStudent(null)}
        className="coach-portal-modal"
        title={`Seguimiento · ${followupStudent?.jugadorNombre || ""}`}
        size="lg"
      >
        {followupError ? <p className="coaching-muted">{followupError}</p> : null}
        {followupSessions.length === 0 && !followupError ? (
          <p className="coaching-muted">Todavía no hay clases impartidas para este alumno.</p>
        ) : (
          <div className="coach-follow-history">
            {followupSessions.map((session) => (
              <article key={session.id} className="coach-follow-history__item">
                <header className="coach-follow-history__head">
                  <strong className="coach-follow-history__date">
                    {formatSessionDate(session.startsAt)}
                  </strong>
                  <span className="coach-follow-history__meta">
                    {session.durationMinutes
                      ? `${session.durationMinutes} min`
                      : "Duración no indicada"}
                  </span>
                </header>

                {session.workedOn.length > 0 ? (
                  <div className="coach-follow-history__block">
                    <span className="coach-follow-history__label">Temas trabajados</span>
                    <div className="coach-follow-history__chips">
                      {session.workedOn.map((topic) => (
                        <span key={topic} className="coach-follow-history__chip">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="coach-follow-history__meta">Sin temas registrados</p>
                )}

                {session.improvements ? (
                  <div className="coach-follow-history__block">
                    <span className="coach-follow-history__label">Avances</span>
                    <p className="coach-follow-history__text">{session.improvements}</p>
                  </div>
                ) : null}
                {session.areasToImprove ? (
                  <div className="coach-follow-history__block">
                    <span className="coach-follow-history__label">Aspectos por mejorar</span>
                    <p className="coach-follow-history__text">{session.areasToImprove}</p>
                  </div>
                ) : null}
                {session.recommendations ? (
                  <div className="coach-follow-history__block">
                    <span className="coach-follow-history__label">Recomendaciones</span>
                    <p className="coach-follow-history__text">{session.recommendations}</p>
                  </div>
                ) : null}
                {session.nextGoals ? (
                  <div className="coach-follow-history__block">
                    <span className="coach-follow-history__label">Objetivo siguiente</span>
                    <p className="coach-follow-history__text">{session.nextGoals}</p>
                  </div>
                ) : null}
                {session.motivationalMessage ? (
                  <div className="coach-follow-history__message">
                    <span className="coach-follow-history__label">Mensaje para el alumno</span>
                    <p className="coach-follow-history__text">{session.motivationalMessage}</p>
                  </div>
                ) : null}
                {session.privateNotes ? (
                  <div className="coach-follow-history__private">
                    <span className="coach-follow-history__label">Nota privada</span>
                    <p className="coach-follow-history__hint">
                      Entrenador, club de la relación y administrador maestro. El alumno no la ve.
                    </p>
                    <p className="coach-follow-history__text">{session.privateNotes}</p>
                  </div>
                ) : null}
                <div className="coach-follow-history__actions">
                  <button
                    type="button"
                    className="coaching-btn coaching-btn--secondary"
                    onClick={() => openEditFollowup(session)}
                  >
                    Editar seguimiento de clase
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Modal>

      {/* Modal: Detalles de la Clase Programada */}
      <Modal
        open={Boolean(detailsSession)}
        onClose={() => setDetailsSession(null)}
        className="coach-portal-modal"
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

