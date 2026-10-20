import React, { useEffect, useState } from "react";
import { useUser } from "../../contexts/UserContext";
import {
  fetchCurrentCoachProfile,
  acceptCoachClubInvitation,
  fetchCoachAssignedStudents,
  linkPlayerByRivieraId,
  recordCoachClassSession,
} from "../../lib/coaching/coachingApi";
import type { CurrentCoachProfile, CoachingPlayerLink } from "../../lib/coaching/types";
import { JUGADOR_CATEGORIA_LABELS } from "../../lib/rivieraJugadores/constants";
import { TablerIcon } from "../ui/TablerIcon";
import { navigateToAppHome } from "../../lib/appRouting";
import "./coaching.css";

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
  const [rivieraIdInput, setRivieraIdInput] = useState("");
  const [linkingStudent, setLinkingStudent] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [sessionNotes, setSessionNotes] = useState("");

  const loadStudents = React.useCallback(async (coachId: string, clubId: string) => {
    if (!coachId || !clubId) return;
    setLoadingStudents(true);
    try {
      const data = await fetchCoachAssignedStudents(coachId, clubId);
      setStudents(data);
    } catch (err) {
      console.error("[coaching] error loading students", err);
    } finally {
      setLoadingStudents(false);
    }
  }, []);

  useEffect(() => {
    if (profile && selectedClubId) {
      void loadStudents(profile.id, selectedClubId);
    } else {
      setStudents([]);
    }
  }, [profile, selectedClubId, loadStudents]);

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

  const handleLinkStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !selectedClubId || !rivieraIdInput.trim()) return;
    setLinkingStudent(true);
    setActionError(null);
    setSuccessMessage(null);
    try {
      await linkPlayerByRivieraId(selectedClubId, profile.id, rivieraIdInput.trim());
      setRivieraIdInput("");
      setSuccessMessage("¡Alumno vinculado exitosamente al club!");
      await loadStudents(profile.id, selectedClubId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error al vincular alumno");
    } finally {
      setLinkingStudent(false);
    }
  };

  const handleRecordClass = async (relationshipId: string) => {
    setRecordingId(relationshipId);
    setActionError(null);
    setSuccessMessage(null);
    try {
      const res = await recordCoachClassSession(relationshipId, sessionNotes.trim() || undefined);
      setSuccessMessage(`¡Clase registrada exitosamente! Saldo restante: ${res.remainingBalance} clase(s).`);
      setSessionNotes("");
      if (profile && selectedClubId) {
        await loadStudents(profile.id, selectedClubId);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error al registrar clase");
    } finally {
      setRecordingId(null);
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

      {/* Gestión de Alumnos y Clases del Coach */}
      <section className="coaching-panel" style={{ marginBottom: "1.5rem" }}>
        <div className="coaching-section-header">
          <div>
            <h2 className="coaching-section-title">Alumnos y Control de Clases</h2>
            <p className="coaching-section-desc">
              Vincula a tus alumnos por su Riviera ID oficial y registra las clases impartidas para descontar su saldo automáticamente.
            </p>
          </div>
        </div>

        {/* Formulario para vincular alumno por Riviera ID */}
        <form onSubmit={handleLinkStudent} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
          <input
            type="text"
            className="coaching-input"
            style={{ maxWidth: "260px" }}
            placeholder="Riviera ID (ej. RIV-00000308)"
            value={rivieraIdInput}
            onChange={(e) => setRivieraIdInput(e.target.value.toUpperCase())}
            disabled={linkingStudent || !selectedClubId}
          />
          <button
            type="submit"
            className="coaching-btn coaching-btn--primary"
            disabled={linkingStudent || !rivieraIdInput.trim() || !selectedClubId}
          >
            <TablerIcon name="user-plus" size={16} />
            {linkingStudent ? "Vinculando…" : "Vincular Alumno"}
          </button>
        </form>

        {loadingStudents ? (
          <p className="coaching-muted">Cargando alumnos y saldos…</p>
        ) : students.length === 0 ? (
          <div className="coaching-empty-card">
            <TablerIcon name="users" size={36} className="coaching-empty-icon" />
            <h3>Sin alumnos vinculados en este club</h3>
            <p>
              Ingresa el Riviera ID de tu alumno para vincularlo a tu perfil en este club.
            </p>
          </div>
        ) : (
          <div className="coaching-grid">
            {students.map((s) => {
              const hasBalance = (s.balanceClasses ?? 0) > 0;
              const isRecording = recordingId === s.id;

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
                      disabled={!hasBalance || isRecording}
                      onClick={() => handleRecordClass(s.id)}
                    >
                      <TablerIcon name="check" size={15} />
                      {isRecording ? "Registrando…" : "Registrar clase impartida (-1)"}
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
    </div>
  );
};
