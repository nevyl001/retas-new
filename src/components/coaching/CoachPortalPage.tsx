import React, { useEffect, useState } from "react";
import { useUser } from "../../contexts/UserContext";
import {
  fetchCurrentCoachProfile,
  fetchCoachAssignedStudents,
  recordCoachClassSessionWithFollowup,
  generateCoachingIdempotencyKey,
  fetchCoachAgenda,
  saveCoachSessionPreparation,
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

const PREP_TOPIC_PRESETS = [
  "Bandeja y víbora",
  "Defensa de fondo y paredes",
  "Voleas y control de red",
  "Transición y velocidad",
  "Remate por 3 / Por 4",
  "Saque y resto",
  "Estrategia y táctica de juego",
  "Físico y desplazamientos",
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
  const [prepFocus, setPrepFocus] = useState<string>("");
  const [prepNotes, setPrepNotes] = useState<string>("");
  const [savingPrep, setSavingPrep] = useState<boolean>(false);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [prepSuccess, setPrepSuccess] = useState<boolean>(false);
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

  const handleOpenDetails = (session: CoachScheduledSession) => {
    setDetailsSession(session);
    setPrepFocus(session.focus || "");
    setPrepNotes(session.notesSummary || "");
    setPrepError(null);
    setPrepSuccess(false);
  };

  const handleSavePreparation = async () => {
    if (!detailsSession) return;
    setSavingPrep(true);
    setPrepError(null);
    setPrepSuccess(false);

    try {
      const res = await saveCoachSessionPreparation({
        sessionId: detailsSession.id,
        focus: prepFocus.trim() || null,
        notesSummary: prepNotes.trim() || null,
      });

      const updated: CoachScheduledSession = {
        ...detailsSession,
        focus: res.focus ?? null,
        notesSummary: res.notesSummary ?? null,
      };
      setDetailsSession(updated);

      setUpcomingSessions((prev) =>
        prev.map((s) =>
          s.id === updated.id
            ? { ...s, focus: updated.focus, notesSummary: updated.notesSummary }
            : s
        )
      );

      setPrepSuccess(true);
      setTimeout(() => setPrepSuccess(false), 3500);
    } catch (err: any) {
      console.error("[coaching] error saving coach preparation:", err);
      setPrepError(err?.message || "No se pudo guardar la preparación de la clase.");
    } finally {
      setSavingPrep(false);
    }
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

    const effectiveFocus =
      sess.id === detailsSession?.id ? prepFocus.trim() || sess.focus : sess.focus;
    const effectiveNotes =
      sess.id === detailsSession?.id ? prepNotes.trim() || sess.notesSummary : sess.notesSummary;

    setModalStudent(studentLink);
    setModalSessionId(sess.id);
    setWorkedOnList(effectiveFocus ? [effectiveFocus] : []);
    setCustomTopic("");
    setImprovements("");
    setAreasToImprove("");
    setRecommendations("");
    setNextGoals("");
    setMotivationalMessage("");
    setDurationMinutes(sess.durationMinutes || 60);
    setClassNotes(effectiveNotes || "");
    setEditingFollowup(false);
    setFollowupBaseline(
      JSON.stringify({
        workedOn: effectiveFocus ? [effectiveFocus] : [],
        improvements: "",
        areas: "",
        recommendations: "",
        nextGoals: "",
        message: "",
        notes: effectiveNotes || "",
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
                        {/* Información principal: Alumno, Horario, Pista */}
                        <div className="coach-session-card__left">
                          <div className="coach-session-student-avatar">
                            {session.jugadorFoto ? (
                              <img src={session.jugadorFoto} alt={session.jugadorNombre || "Alumno"} />
                            ) : (
                              <span>{getInitials(session.jugadorNombre || "AL")}</span>
                            )}
                          </div>

                          <div className="coach-session-card__info">
                            <div className="coach-session-card__header-row">
                              <span className="coach-session-card__student-name">
                                {session.jugadorNombre || "Alumno"}
                              </span>
                              {session.rivieraId && (
                                <span className="coach-session-card__riviera-id">
                                  {session.rivieraId}
                                </span>
                              )}
                              <span className="coaching-badge coaching-badge--active">
                                PROGRAMADA
                              </span>
                            </div>

                            <div className="coach-session-card__meta-row">
                              <span className="coach-session-meta-item">
                                <TablerIcon name="calendar" size={13} />
                                {formattedDate}
                              </span>
                              <span className="coach-session-meta-item">
                                <TablerIcon name="clock" size={13} />
                                {session.durationMinutes} min
                              </span>
                              <span className="coach-session-meta-item">
                                <TablerIcon name="map-pin" size={13} />
                                {session.court || "Cancha por asignar"}
                              </span>
                              {session.balanceClasses !== undefined && (
                                <span
                                  className="coach-session-meta-balance"
                                  style={{
                                    color: session.balanceClasses > 0 ? "var(--coach-accent-green, #22c55e)" : "#fbbf24",
                                  }}
                                >
                                  {session.balanceClasses} {session.balanceClasses === 1 ? "clase disp." : "clases disp."}
                                </span>
                              )}
                            </div>

                            {/* Estado y visualización de la preparación pedagógica */}
                            <div className="coach-session-card__prep-row">
                              {session.focus ? (
                                <div className="coach-session-focus-container">
                                  <span className="coach-session-focus-tag">
                                    <TablerIcon name="target" size={12} />
                                    {session.focus}
                                  </span>
                                  {session.notesSummary && (
                                    <span className="coach-session-notes-preview">
                                      "{session.notesSummary}"
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="coach-session-pending-tag">
                                  <TablerIcon name="notes" size={12} />
                                  Sesión por preparar
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Acciones */}
                        <div className="coach-session-card__actions">
                          <button
                            type="button"
                            className="coaching-btn coaching-btn--secondary"
                            style={{ fontSize: "0.8rem", padding: "0.45rem 0.85rem" }}
                            onClick={() => handleOpenDetails(session)}
                          >
                            <TablerIcon name="clipboard-list" size={14} />
                            Ver clase
                          </button>

                          <button
                            type="button"
                            className="coaching-btn coaching-btn--primary"
                            style={{ fontSize: "0.8rem", padding: "0.45rem 0.85rem" }}
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
            <section className="coach-portal-section coach-students-section" aria-label="Alumnos y control de clases">
              <div className="coach-portal-section-header">
                <div>
                  <h2 className="coach-portal-section-title">Alumnos y Control de Clases</h2>
                  <p className="coach-portal-section-desc">
                    Supervisa a tus alumnos asignados, consulta sus clases restantes y registra las sesiones impartidas.
                  </p>
                </div>
                {students.length > 0 ? (
                  <span className="coach-students-count-badge">
                    <TablerIcon name="users" size={14} />
                    {students.length} {students.length === 1 ? "alumno" : "alumnos"}
                  </span>
                ) : null}
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
                <div className="coach-students-empty">
                  <div className="coach-students-empty__icon">
                    <TablerIcon name="users" size={28} />
                  </div>
                  <h3 className="coach-students-empty__title">Sin alumnos asignados en este club</h3>
                  <p className="coach-students-empty__desc">
                    El administrador del club te asignará los alumnos con paquetes de clases activos para impartir y registrar sesiones.
                  </p>
                </div>
              ) : (
                <div className="coach-students-grid">
                  {students.map((s) => {
                    const hasBalance = (s.balanceClasses ?? 0) > 0;
                    const isModalOpenForThis = modalStudent?.id === s.id;
                    const card = digestByRelationship[s.id];
                    const categoryLabel = card?.categoria
                      ? JUGADOR_CATEGORIA_LABELS[card.categoria as keyof typeof JUGADOR_CATEGORIA_LABELS] ||
                        card.categoria
                      : null;
                    const studentInitials = getInitials(s.jugadorNombre);

                    return (
                      <article key={s.id} className="coach-student-card coaching-card">
                        {/* 1. Header: Avatar + Nombre + Estado + Riviera ID */}
                        <div className="coach-student-card__header">
                          <div className="coach-student-avatar" aria-hidden>
                            {card?.fotoUrl ? (
                              <img
                                src={card.fotoUrl}
                                alt=""
                                className="coach-student-avatar__img"
                              />
                            ) : (
                              <div className="coach-student-avatar__fallback">
                                {studentInitials}
                              </div>
                            )}
                          </div>

                          <div className="coach-student-identity">
                            <div className="coach-student-identity__top">
                              <h3 className="coach-student-name" title={s.jugadorNombre}>
                                {s.jugadorNombre}
                              </h3>
                              <span
                                className={`coaching-badge coach-student-badge--status coaching-badge--${
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
                            <span className="coach-student-id">{s.rivieraId}</span>
                          </div>
                        </div>

                        {/* 2. Banner de Clases Disponibles (Nivel 1 de Jerarquía) */}
                        <div className="coach-student-balance-banner">
                          <div
                            className={`coach-student-balance-pill ${
                              hasBalance
                                ? "coach-student-balance-pill--positive"
                                : "coach-student-balance-pill--empty"
                            }`}
                          >
                            <TablerIcon name="calendar-event" size={16} />
                            <span>
                              <strong>{s.balanceClasses ?? 0}</strong>{" "}
                              {s.balanceClasses === 1 ? "clase disponible" : "clases disponibles"}
                            </span>
                          </div>
                          {(s.totalClassesGiven ?? 0) > 0 ? (
                            <span className="coach-student-impartidas-tag">
                              {s.totalClassesGiven}{" "}
                              {s.totalClassesGiven === 1 ? "impartida" : "impartidas"}
                            </span>
                          ) : null}
                        </div>

                        {/* 3. Resumen Operativo: Categoría, Última sesión, Próxima clase */}
                        <div className="coach-student-summary-grid">
                          <div className="coach-student-summary-item">
                            <span className="coach-student-summary-label">Categoría</span>
                            <span className="coach-student-summary-value coach-student-summary-value--accent">
                              {categoryLabel || "Sin categoría"}
                            </span>
                          </div>

                          <div className="coach-student-summary-item">
                            <span className="coach-student-summary-label">Última sesión</span>
                            <span
                              className={`coach-student-summary-value ${
                                card?.lastSessionAt ? "" : "coach-student-summary-value--muted"
                              }`}
                            >
                              {card?.lastSessionAt
                                ? formatSessionDate(card.lastSessionAt)
                                : "Sin clases impartidas"}
                            </span>
                          </div>

                          <div className="coach-student-summary-item coach-student-summary-item--full">
                            <span className="coach-student-summary-label">Próxima clase</span>
                            <span
                              className={`coach-student-summary-value ${
                                card?.nextSessionAt ? "" : "coach-student-summary-value--muted"
                              }`}
                            >
                              {card?.nextSessionAt
                                ? formatSessionDate(card.nextSessionAt)
                                : "Sin clase agendada"}
                            </span>
                          </div>

                          {card?.lastGoal ? (
                            <div className="coach-student-summary-item coach-student-summary-item--full">
                              <span className="coach-student-summary-label">Último objetivo</span>
                              <span className="coach-student-summary-value coach-student-summary-value--goal">
                                “{card.lastGoal}”
                              </span>
                            </div>
                          ) : null}
                        </div>

                        {/* 4. Acciones del Coach */}
                        <div className="coach-student-actions">
                          <button
                            type="button"
                            className="coaching-btn coaching-btn--secondary coach-student-btn--followup"
                            onClick={() => void openStudentFollowup(s)}
                          >
                            <TablerIcon name="history" size={15} />
                            Ver seguimiento
                          </button>
                          <button
                            type="button"
                            className="coaching-btn coaching-btn--primary coach-student-btn--record"
                            disabled={!hasBalance || modalBusy || s.status === "PAUSED"}
                            onClick={() => openRecordClassModal(s)}
                          >
                            <TablerIcon name="check" size={15} />
                            <span>
                              {modalBusy && isModalOpenForThis
                                ? "Registrando…"
                                : "Registrar clase impartida (-1)"}
                            </span>
                          </button>
                        </div>

                        {/* Alertas contextuales si aplica */}
                        {s.status === "PAUSED" ? (
                          <div className="coach-student-alert coach-student-alert--warning">
                            <TablerIcon name="alert-triangle" size={14} />
                            <span>Alumno en pausa. El club debe reactivarlo para registrar clases.</span>
                          </div>
                        ) : !hasBalance ? (
                          <div className="coach-student-alert coach-student-alert--muted">
                            <TablerIcon name="info-circle" size={14} />
                            <span>Sin saldo disponible. Solicita recarga al administrador del club.</span>
                          </div>
                        ) : null}
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

      {/* Modal: Detalle y Preparación de Clase Programada */}
      <Modal
        open={Boolean(detailsSession)}
        onClose={() => setDetailsSession(null)}
        className="coach-portal-modal coach-prep-modal"
        title="Detalle y preparación de clase"
        size="md"
      >
        {detailsSession ? (
          <div className="coach-prep-modal-body">
            {/* 1. Bloque Administrativo (Solo Lectura) */}
            <div className="coach-prep-admin-card">
              <div className="coach-prep-section-badge">
                <TablerIcon name="shield-check" size={13} />
                PROGRAMACIÓN ADMINISTRATIVA DEL CLUB
              </div>
              <p className="coach-prep-admin-notice">
                Horario, pista y alumno fijados por la administración. No modificables desde este espacio.
              </p>

              <div className="coach-prep-admin-grid">
                <div className="coach-prep-admin-item">
                  <span className="coach-prep-admin-label">Alumno</span>
                  <div className="coach-prep-admin-student">
                    <div className="coach-prep-student-avatar">
                      {detailsSession.jugadorFoto ? (
                        <img src={detailsSession.jugadorFoto} alt={detailsSession.jugadorNombre || "Alumno"} />
                      ) : (
                        <span>{getInitials(detailsSession.jugadorNombre || "AL")}</span>
                      )}
                    </div>
                    <div>
                      <span className="coach-prep-admin-value">
                        {detailsSession.jugadorNombre || "Alumno"}
                      </span>
                      {detailsSession.rivieraId && (
                        <span className="coach-prep-admin-subvalue">
                          {detailsSession.rivieraId}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="coach-prep-admin-item">
                  <span className="coach-prep-admin-label">Fecha y Horario</span>
                  <span className="coach-prep-admin-value">
                    {formatSessionDate(detailsSession.startsAt)}
                  </span>
                  <span className="coach-prep-admin-subvalue">
                    Duración: {detailsSession.durationMinutes} minutos
                  </span>
                </div>

                <div className="coach-prep-admin-item">
                  <span className="coach-prep-admin-label">Cancha asignada</span>
                  <span className="coach-prep-admin-value">
                    {detailsSession.court || "Por definir por el club"}
                  </span>
                  <span className="coach-prep-admin-subvalue">
                    {detailsSession.clubNombre || "Club Riviera"}
                  </span>
                </div>

                <div className="coach-prep-admin-item">
                  <span className="coach-prep-admin-label">Saldo de clases</span>
                  <span
                    className="coach-prep-admin-value"
                    style={{
                      color: (detailsSession.balanceClasses ?? 0) > 0 ? "var(--coach-accent-green, #22c55e)" : "#fbbf24",
                    }}
                  >
                    {detailsSession.balanceClasses ?? "—"} {detailsSession.balanceClasses === 1 ? "clase disponible" : "clases disponibles"}
                  </span>
                  <span className="coach-prep-admin-subvalue">
                    Estado: {detailsSession.status}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Bloque Técnico del Coach (Editable) */}
            <div className="coach-prep-technical-card">
              <div className="coach-prep-section-badge coach-prep-section-badge--coach">
                <TablerIcon name="target" size={13} />
                PREPARACIÓN TÉCNICA DEL ENTRENADOR
              </div>
              <p className="coach-prep-tech-subtitle">
                Define el tema pedagógico y tus notas previas. Puedes guardar tu preparación cuantas veces requieras antes de impartir la clase.
              </p>

              {/* Chips de sugerencias rápidas */}
              <div className="coach-prep-presets-container">
                <span className="coach-prep-presets-title">Sugerencias de objetivos:</span>
                <div className="coach-prep-presets-chips">
                  {PREP_TOPIC_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`coach-prep-chip ${prepFocus === preset ? "coach-prep-chip--active" : ""}`}
                      onClick={() => setPrepFocus(prepFocus === preset ? "" : preset)}
                      disabled={savingPrep}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input de tema */}
              <div className="coaching-form-group" style={{ marginBottom: "0.85rem" }}>
                <label className="coaching-label" htmlFor="coach-prep-focus-input">
                  Objetivo o Tema del entrenamiento
                </label>
                <input
                  id="coach-prep-focus-input"
                  type="text"
                  className="coaching-input schedule-input"
                  value={prepFocus}
                  onChange={(e) => setPrepFocus(e.target.value)}
                  placeholder="ej. Bandeja y víbora, o escribe un tema personalizado..."
                  disabled={savingPrep}
                />
              </div>

              {/* Textarea de notas */}
              <div className="coaching-form-group">
                <label className="coaching-label" htmlFor="coach-prep-notes-input">
                  Notas de la clase (Coach)
                </label>
                <textarea
                  id="coach-prep-notes-input"
                  className="coaching-input schedule-input"
                  rows={3}
                  value={prepNotes}
                  onChange={(e) => setPrepNotes(e.target.value)}
                  placeholder="ej. Trabajar técnica, posicionamiento y control de profundidad..."
                  disabled={savingPrep}
                />
              </div>

              {/* Alertas */}
              {prepSuccess && (
                <div className="coach-portal-alert coach-portal-alert--success" style={{ marginTop: "0.5rem" }}>
                  <TablerIcon name="check" size={16} />
                  <span>Preparación guardada exitosamente. Los temas quedarán registrados para el seguimiento de la clase.</span>
                </div>
              )}
              {prepError && (
                <div className="coach-portal-alert coach-portal-alert--error" style={{ marginTop: "0.5rem" }}>
                  <TablerIcon name="alert-circle" size={16} />
                  <span>{prepError}</span>
                </div>
              )}
            </div>

            {/* Botones de acción del Modal */}
            <div className="coach-prep-modal-actions">
              <button
                type="button"
                className="coaching-btn-ghost"
                onClick={() => setDetailsSession(null)}
                disabled={savingPrep}
              >
                Cerrar
              </button>

              <button
                type="button"
                className="coaching-btn coaching-btn--secondary"
                onClick={handleSavePreparation}
                disabled={savingPrep}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                {savingPrep ? (
                  <>
                    <TablerIcon name="loader" size={15} className="spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <TablerIcon name="device-floppy" size={15} />
                    Guardar preparación
                  </>
                )}
              </button>

              <button
                type="button"
                className="coaching-btn coaching-btn--primary"
                onClick={() => {
                  const s = detailsSession;
                  openRecordClassForScheduled(s);
                }}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <TablerIcon name="check" size={15} />
                Registrar clase impartida (-1)
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

