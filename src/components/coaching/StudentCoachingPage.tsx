import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useUser } from "../../contexts/UserContext";
import {
  fetchStudentCoachingOverview,
  fetchStudentTrainingTimeline,
  linkStudentAccountByRivieraId,
  type StudentCoachingOverview,
} from "../../lib/coaching/coachingApi";
import type { StudentTrainingSession } from "../../lib/coaching/types";
import { getDailyMentalidadRivieraQuote } from "../../lib/coaching/mentalidadRivieraQuotes";
import { StudentTrainingSection } from "./StudentTrainingSection";
import { TablerIcon } from "../ui/TablerIcon";
import { navigateToAppHome } from "../../lib/appRouting";
import {
  navigatePublicJugadorByRivieraId,
  openPublicJugadorByRivieraIdInNewWindow,
} from "../jugadores/jugadoresPublicNav";
import { navigateCoaching, navigateStudentAccess } from "./coachingNav";
import "./coaching.css";

function getInitials(nameOrEmail: string): string {
  const clean = nameOrEmail.trim();
  if (!clean) return "RV";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

export const StudentCoachingPage: React.FC = () => {
  const {
    user,
    userProfile,
    isStudentOnly,
    isCoachOnly,
    loading: userLoading,
  } = useUser();
  const [overview, setOverview] = useState<StudentCoachingOverview | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Formulario para vincular Riviera ID en caso de perfil no enlazado
  const [manualRivieraId, setManualRivieraId] = useState("");
  const [linking, setLinking] = useState(false);
  const [copiedRivieraId, setCopiedRivieraId] = useState(false);
  const [training, setTraining] = useState<StudentTrainingSession[]>([]);
  const [trainingError, setTrainingError] = useState<string | null>(null);

  const dailyQuote = useMemo(() => getDailyMentalidadRivieraQuote(), []);

  const loadData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setTrainingError(null);
    try {
      const [res, timeline] = await Promise.all([
        fetchStudentCoachingOverview(),
        fetchStudentTrainingTimeline().catch((err: unknown) => {
          setTrainingError(
            err instanceof Error
              ? err.message
              : "No se pudo cargar tu seguimiento.",
          );
          return [] as StudentTrainingSession[];
        }),
      ]);
      setTraining(timeline);
      setOverview(res);

      // Si el usuario es administrador de club y no tiene perfil legítimo de alumno vinculado,
      // redirigirlo de inmediato a su panel de administración de Riviera Coaching
      if (res && res.linked === false && !isStudentOnly && !isCoachOnly) {
        navigateCoaching("/coaching");
        return;
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al cargar la información de Mi Coaching.",
      );
    } finally {
      setLoading(false);
    }
  }, [user, isStudentOnly, isCoachOnly]);

  useEffect(() => {
    if (!userLoading) {
      loadData();
    }
  }, [userLoading, loadData]);

  const handleCopyRivieraId = (rivieraId: string) => {
    if (navigator?.clipboard?.writeText) {
      void navigator.clipboard.writeText(rivieraId);
    }
    setCopiedRivieraId(true);
    setTimeout(() => setCopiedRivieraId(false), 2200);
  };

  const handleManualLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualRivieraId.trim()) return;
    setLinking(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await linkStudentAccountByRivieraId(manualRivieraId.trim());
      setActionSuccess(
        `¡Identidad vinculada exitosamente a ${res.nombre || "tu perfil"} (${res.rivieraId})!`,
      );
      setManualRivieraId("");
      await loadData();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Error al vincular tu Riviera ID",
      );
    } finally {
      setLinking(false);
    }
  };

  const formatDate = (isoString: string) => {
    if (!isoString) return "";
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

  const formatShortDate = (isoString: string | null | undefined) => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return isoString;
    }
  };

  const handleBack = () => {
    if (overview?.rivieraId) {
      navigatePublicJugadorByRivieraId(overview.rivieraId);
    } else if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      navigateToAppHome();
    }
  };

  // 1. Estado de carga
  if (userLoading || loading) {
    return (
      <div className="coaching-page coaching-student-page rv-page">
        <header className="coaching-hero coaching-student-hero">
          <div className="coaching-student-hero__topbar">
            <button
              type="button"
              className="coaching-back"
              onClick={handleBack}
            >
              <TablerIcon name="arrow-left" size={16} />
              {overview?.rivieraId ? "Volver a mi Ficha" : "Inicio"}
            </button>
          </div>
          <p className="coaching-kicker">Riviera Coaching</p>
          <h1 className="coaching-title">Mi Coaching</h1>
          <p className="coaching-muted">Cargando tu seguimiento deportivo…</p>
        </header>
      </div>
    );
  }

  // 2. Si no hay sesión autenticada
  if (!user) {
    return (
      <div className="coaching-page coaching-student-page rv-page">
        <header className="coaching-hero coaching-student-hero">
          <div className="coaching-student-hero__topbar">
            <button
              type="button"
              className="coaching-back"
              onClick={handleBack}
            >
              <TablerIcon name="arrow-left" size={16} />
              {overview?.rivieraId ? "Volver a mi Ficha" : "Inicio"}
            </button>
          </div>
          <p className="coaching-kicker">Riviera Coaching</p>
          <h1 className="coaching-title">Mi Coaching</h1>
        </header>

        <div className="coaching-empty-card coaching-student-empty-card">
          <div className="coaching-student-empty-icon-wrap">
            <TablerIcon name="lock" size={26} />
          </div>
          <h3>Sesión requerida</h3>
          <p>
            Inicia sesión con tu cuenta oficial de Riviera para consultar tus
            clases disponibles, tu coach e historial de sesiones impartidas.
          </p>
          <button
            type="button"
            className="coaching-btn coaching-btn--primary"
            onClick={() => navigateStudentAccess()}
          >
            <TablerIcon name="login" size={16} />
            Iniciar sesión como alumno
          </button>
        </div>
      </div>
    );
  }

  // 3. Si hubo un error de carga
  if (error) {
    return (
      <div className="coaching-page coaching-student-page rv-page">
        <header className="coaching-hero coaching-student-hero">
          <div className="coaching-student-hero__topbar">
            <button
              type="button"
              className="coaching-back"
              onClick={handleBack}
            >
              <TablerIcon name="arrow-left" size={16} />
              {overview?.rivieraId ? "Volver a mi Ficha" : "Inicio"}
            </button>
          </div>
          <p className="coaching-kicker">Riviera Coaching</p>
          <h1 className="coaching-title">Mi Coaching</h1>
        </header>

        <div className="coaching-error-banner" role="alert">
          <TablerIcon name="alert-triangle" size={20} />
          <div className="coaching-error-content">
            <p className="coaching-error-title">No pudimos cargar tus clases</p>
            <p className="coaching-error-desc">{error}</p>
          </div>
          <button
            type="button"
            className="coaching-btn coaching-btn--secondary"
            onClick={loadData}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // 3b. Si es una sesión de administrador sin perfil de alumno legítimo, mostrar redirección segura
  if (user && overview && !overview.linked && !isStudentOnly && !isCoachOnly) {
    return (
      <div className="coaching-page coaching-student-page rv-page">
        <header className="coaching-hero coaching-student-hero">
          <p className="coaching-kicker">
            Riviera Coaching • Panel de Administración
          </p>
          <h1 className="coaching-title">Mi Coaching</h1>
          <p className="coaching-lead">
            Has iniciado sesión como <strong>Administrador de Club</strong>. La
            sección de «Mi Coaching» está reservada para el seguimiento
            deportivo de alumnos.
          </p>
          <div className="coaching-student-admin-redirect">
            <button
              type="button"
              className="coaching-btn coaching-btn--primary"
              onClick={() => navigateCoaching("/coaching")}
            >
              <TablerIcon name="arrow-left" size={16} />
              Ir al panel de administración de Coaching
            </button>
          </div>
        </header>
      </div>
    );
  }

  const relationships = overview?.relationships ?? [];
  const primaryRel =
    relationships.find((r) => r.isPrimary) || relationships[0];
  const primaryPlayer = primaryRel?.player;
  const effectiveRivieraId = overview?.rivieraId || primaryPlayer?.rivieraId;

  const metadataName =
    typeof user?.user_metadata?.name === "string"
      ? user.user_metadata.name.trim()
      : typeof user?.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name.trim()
        : "";
  const metadataAvatar =
    typeof user?.user_metadata?.avatar_url === "string"
      ? user.user_metadata.avatar_url.trim()
      : "";

  const studentName =
    primaryPlayer?.nombre?.trim() ||
    userProfile?.name?.trim() ||
    metadataName ||
    null;

  const studentPhotoUrl =
    primaryPlayer?.fotoUrl ||
    userProfile?.avatar_url ||
    metadataAvatar ||
    null;

  const avatarInitials = getInitials(studentName || user?.email || "RV");

  return (
    <div className="coaching-page coaching-student-page rv-page">
      {/* 1. ENCABEZADO PERSONALIZADO */}
      <header className="coaching-hero coaching-student-hero">
        {!effectiveRivieraId && (
          <div className="coaching-student-hero__topbar">
            <button type="button" className="coaching-back" onClick={handleBack}>
              <TablerIcon name="arrow-left" size={16} />
              Inicio
            </button>
          </div>
        )}

        <div className="coaching-student-hero__main">
          <div className="coaching-student-hero__identity">
            <div className="coaching-student-hero__portrait-frame">
              {studentPhotoUrl ? (
                <img
                  src={studentPhotoUrl}
                  alt={studentName || "Alumno Riviera"}
                  className="coaching-student-hero__portrait-img"
                />
              ) : (
                <div
                  className="coaching-student-hero__portrait-fallback"
                  aria-hidden="true"
                >
                  <span>{avatarInitials}</span>
                </div>
              )}
            </div>

            <div className="coaching-student-hero__copy">
              <p className="coaching-student-hero__greeting">
                {studentName ? `Hola, ${studentName}` : "Hola, Jugador"}
              </p>
              <h1 className="coaching-title coaching-student-hero__title">
                Mi Coaching
              </h1>
              <p className="coaching-lead coaching-student-hero__subtitle">
                Tu espacio para entrenar, mejorar y seguir evolucionando.
              </p>
            </div>
          </div>

          {effectiveRivieraId && (
            <div className="coaching-student-hero__actions">
              <div
                className="coaching-student-badge-pill"
                title="Código oficial de jugador"
              >
                <strong className="coaching-student-badge-val">
                  {effectiveRivieraId}
                </strong>
                <button
                  type="button"
                  className="coaching-badge-copy-btn"
                  onClick={() => handleCopyRivieraId(effectiveRivieraId)}
                  aria-label={`Copiar ${effectiveRivieraId}`}
                  title={copiedRivieraId ? "Copiado" : "Copiar código"}
                >
                  <TablerIcon
                    name={copiedRivieraId ? "check" : "copy"}
                    size={14}
                  />
                </button>
              </div>

              <button
                type="button"
                className="coaching-btn coaching-btn--secondary coaching-student-ranking-btn"
                onClick={() => {
                  openPublicJugadorByRivieraIdInNewWindow(effectiveRivieraId);
                }}
              >
                <TablerIcon name="user" size={15} />
                Ver mi Ficha de Ranking
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 2. MENSAJE MOTIVACIONAL DIARIO — MENTALIDAD RIVIERA */}
      <section
        className="coaching-mentalidad"
        aria-label="Mentalidad Riviera"
      >
        <div className="coaching-mentalidad__header">
          <span className="coaching-mentalidad__eyebrow">
            MENTALIDAD RIVIERA
          </span>
          <span className="coaching-mentalidad__tag">Enfoque del día</span>
        </div>
        <blockquote className="coaching-mentalidad__quote">
          “{dailyQuote.quote}”
        </blockquote>
      </section>

      {actionSuccess && (
        <div className="coaching-alert coaching-alert--success" role="status">
          <TablerIcon name="check" size={18} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="coaching-alert coaching-alert--error" role="alert">
          <TablerIcon name="alert-circle" size={18} />
          <span>{actionError}</span>
        </div>
      )}

      {/* CASO A: Sin relaciones de coaching asignadas aún */}
      {relationships.length === 0 ? (
        <div className="coaching-student-empty-state">
          <div className="coaching-empty-card coaching-student-empty-card">
            <div className="coaching-student-empty-lead">
              <div className="coaching-student-empty-icon-wrap" aria-hidden="true">
                <TablerIcon name="ball-tennis" size={26} />
              </div>
              <div className="coaching-student-empty-copy">
                <h2 className="coaching-student-empty-title">
                  Tu evolución comienza aquí.
                </h2>
                <p className="coaching-student-empty-desc">
                  Cuando tu entrenador te vincule, encontrarás aquí tus clases,
                  avances y próximos objetivos.
                </p>
              </div>
            </div>

            {effectiveRivieraId ? (
              <div className="coaching-student-empty-actions">
                <button
                  type="button"
                  className="coaching-btn coaching-btn--primary coaching-student-copy-id-btn"
                  onClick={() => handleCopyRivieraId(effectiveRivieraId)}
                >
                  <TablerIcon
                    name={copiedRivieraId ? "check" : "copy"}
                    size={16}
                  />
                  {copiedRivieraId ? "RV ID COPIADO" : "COPIAR MI RV ID"}
                </button>
              </div>
            ) : (
              <div className="coaching-link-help-card">
                <p className="coaching-link-help-text">
                  Si ya tienes una credencial de Riviera pero tu cuenta de
                  acceso se registró con un correo distinto, ingresa tu código
                  oficial a continuación para enlazar tu historial deportivo:
                </p>
                <form
                  onSubmit={handleManualLink}
                  className="coaching-link-form"
                >
                  <input
                    type="text"
                    className="coaching-input"
                    placeholder="Ej. RIV-00000356"
                    value={manualRivieraId}
                    onChange={(e) => setManualRivieraId(e.target.value)}
                    disabled={linking}
                  />
                  <button
                    type="submit"
                    className="coaching-btn coaching-btn--primary"
                    disabled={linking || !manualRivieraId.trim()}
                  >
                    {linking ? "Vinculando…" : "Vincular mi perfil"}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* CASO B: Con relaciones de coaching activas */
        <div className="coaching-student-dashboard">
          {relationships.map((rel, relIndex) => {
            const currentBalance = rel.balance?.balanceClasses ?? 0;
            const totalCompleted = rel.balance?.totalClassesGiven ?? 0;
            const hasAvailable = currentBalance > 0;
            const coachName = rel.coach?.nombre ?? "Coach";
            const clubName = rel.club?.nombre ?? "Club Riviera";
            const nextUpcoming = rel.upcomingSessions?.[0] ?? null;
            const fallbackNextScheduled =
              !nextUpcoming && training[0]?.nextScheduledAt
                ? training[0].nextScheduledAt
                : null;

            return (
              <section
                key={rel.relationshipId}
                className="coaching-student-relation-card"
              >
                {/* 1. RESUMEN DEL ENTRENAMIENTO */}
                <div className="coaching-student-summary-header">
                  <div>
                    <span className="coaching-student-summary-eyebrow">
                      RESUMEN DEL ENTRENAMIENTO
                    </span>
                    <h2 className="coaching-student-summary-club">
                      {clubName}
                    </h2>
                  </div>
                  <span className="coaching-student-member-since">
                    Vinculado desde {formatShortDate(rel.startedAt)}
                  </span>
                </div>

                <div className="coaching-student-summary-grid">
                  {/* Indicador 1: Clases disponibles */}
                  <article
                    className={`coaching-student-metric-card ${
                      hasAvailable
                        ? "coaching-metric--active"
                        : "coaching-metric--empty"
                    }`}
                  >
                    <div className="coaching-metric-top">
                      <span className="coaching-metric-label">
                        Clases disponibles
                      </span>
                      <span
                        className={`coaching-status-pill ${
                          hasAvailable ? "pill--success" : "pill--warning"
                        }`}
                      >
                        {hasAvailable ? "Paquete Vigente" : "Sin Saldo Restante"}
                      </span>
                    </div>
                    <div className="coaching-metric-value">{currentBalance}</div>
                    <p className="coaching-metric-desc">
                      {hasAvailable
                        ? "Clases listas para programar o tomar en cancha."
                        : "Solicita en la administración de tu club la recarga de tu paquete."}
                    </p>
                  </article>

                  {/* Indicador 2: Clases completadas */}
                  <article className="coaching-student-metric-card coaching-metric--neutral">
                    <div className="coaching-metric-top">
                      <span className="coaching-metric-label">
                        Clases completadas
                      </span>
                      <span className="coaching-metric-subpill">
                        Clases Impartidas
                      </span>
                    </div>
                    <div className="coaching-metric-value">
                      {totalCompleted}
                    </div>
                    <p className="coaching-metric-desc">
                      Sesiones presenciales registradas por tu entrenador.
                    </p>
                  </article>

                  {/* Indicador 3: Próxima sesión */}
                  <article className="coaching-student-metric-card coaching-metric--schedule">
                    <div className="coaching-metric-top">
                      <span className="coaching-metric-label">
                        Próxima sesión
                      </span>
                      <TablerIcon
                        name="calendar-event"
                        size={16}
                        className="coaching-metric-icon"
                      />
                    </div>
                    {nextUpcoming ? (
                      <>
                        <div className="coaching-metric-schedule-date">
                          {formatDate(nextUpcoming.startsAt)}
                        </div>
                        <p className="coaching-metric-desc">
                          {nextUpcoming.durationMinutes} min
                          {nextUpcoming.court
                            ? ` · Cancha ${nextUpcoming.court}`
                            : ""}
                          {nextUpcoming.focus ? ` · ${nextUpcoming.focus}` : ""}
                        </p>
                      </>
                    ) : fallbackNextScheduled ? (
                      <>
                        <div className="coaching-metric-schedule-date">
                          {formatDate(fallbackNextScheduled)}
                        </div>
                        <p className="coaching-metric-desc">
                          Horario programado con {coachName}.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="coaching-metric-schedule-empty">
                          Por programar
                        </div>
                        <p className="coaching-metric-desc">
                          Sin sesión agendada por el momento.
                        </p>
                      </>
                    )}
                  </article>

                  {/* Indicador 4: Entrenador asignado */}
                  <article className="coaching-student-metric-card coaching-metric--coach">
                    <div className="coaching-metric-top">
                      <span className="coaching-metric-label">
                        Entrenador asignado
                      </span>
                      {rel.coach?.coachCode && (
                        <span className="coaching-code-pill">
                          {rel.coach.coachCode}
                        </span>
                      )}
                    </div>
                    <div className="coaching-student-coach-inline">
                      <div className="coaching-student-avatar">
                        {rel.coach?.fotoUrl ? (
                          <img
                            src={rel.coach.fotoUrl}
                            alt={coachName}
                            className="coaching-student-avatar-img"
                          />
                        ) : (
                          <span>{getInitials(coachName)}</span>
                        )}
                      </div>
                      <div className="coaching-student-coach-inline__body">
                        <h3 className="coaching-student-coach-name">
                          {coachName}
                        </h3>
                        <span className="coaching-student-coach-club">
                          {clubName}
                        </span>
                      </div>
                    </div>
                    {rel.coach?.especialidades &&
                      rel.coach.especialidades.length > 0 && (
                        <div className="coaching-student-spec-tags">
                          {rel.coach.especialidades.map((spec) => (
                            <span
                              key={spec}
                              className="coaching-student-spec-tag"
                            >
                              {spec}
                            </span>
                          ))}
                        </div>
                      )}
                  </article>
                </div>

                {/* 2. MI EVOLUCIÓN COMO JUGADOR */}
                {relIndex === 0 && (
                  <StudentTrainingSection
                    sessions={training}
                    error={trainingError}
                  />
                )}

                {/* 3. PRÓXIMAS CLASES AGENDADAS */}
                {rel.upcomingSessions && rel.upcomingSessions.length > 0 && (
                  <div className="coaching-student-agenda-section">
                    <div className="coaching-ledger-header">
                      <div>
                        <h3 className="coaching-ledger-title">
                          <TablerIcon name="calendar-event" size={18} />
                          Próximas Clases Agendadas
                        </h3>
                        <p className="coaching-ledger-subtitle">
                          Horarios confirmados de entrenamiento con {coachName}{" "}
                          en {clubName}.
                        </p>
                      </div>
                      <span className="coaching-ledger-count">
                        {rel.upcomingSessions.length}{" "}
                        {rel.upcomingSessions.length === 1
                          ? "sesión programada"
                          : "sesiones programadas"}
                      </span>
                    </div>

                    <div className="coaching-upcoming-grid">
                      {rel.upcomingSessions.map((sch) => (
                        <article
                          key={sch.id}
                          className="coaching-upcoming-card"
                        >
                          <div className="coaching-upcoming-card__top">
                            <span className="coaching-upcoming-card__date">
                              {formatDate(sch.startsAt)}
                            </span>
                            <span className="coaching-upcoming-card__duration">
                              {sch.durationMinutes} min
                            </span>
                          </div>
                          {sch.court && (
                            <div className="coaching-upcoming-card__meta">
                              <TablerIcon name="map-pin" size={14} />
                              <span>
                                Cancha: <strong>{sch.court}</strong>
                              </span>
                            </div>
                          )}
                          {sch.focus && (
                            <div className="coaching-upcoming-card__focus">
                              <TablerIcon name="target" size={14} />
                              <span>Tema: {sch.focus}</span>
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. HISTORIAL INMUTABLE DE SESIONES Y ASIGNACIONES */}
                <div className="coaching-student-ledger-section">
                  <div className="coaching-ledger-header">
                    <div>
                      <h3 className="coaching-ledger-title">
                        <TablerIcon name="shield-check" size={18} />
                        Historial de Sesiones y Asignaciones
                      </h3>
                      <p className="coaching-ledger-subtitle">
                        Registro oficial inmutable y transparente de tu paquete
                        de clases.
                      </p>
                    </div>
                    <span className="coaching-ledger-count">
                      {(rel.ledger ?? []).length} movimiento(s)
                    </span>
                  </div>

                  {(rel.ledger ?? []).length === 0 ? (
                    <div className="coaching-ledger-empty">
                      <p>
                        Aún no se registran movimientos ni clases en este
                        paquete.
                      </p>
                    </div>
                  ) : (
                    <div className="coaching-ledger-timeline">
                      {(rel.ledger ?? []).map((entry) => {
                        const renderStudentLedgerBadge = () => {
                          switch (entry.tipo) {
                            case "PACKAGE_CREDIT":
                            case "ASSIGN":
                              return (
                                <span className="coaching-ledger-badge badge--assign">
                                  <TablerIcon name="plus" size={13} />+
                                  {entry.delta} Clases (Club)
                                </span>
                              );
                            case "CLASS_DEBIT":
                            case "CLASS_SESSION":
                              return (
                                <span className="coaching-ledger-badge badge--session">
                                  <TablerIcon name="check" size={13} />
                                  {entry.delta} Clase (Coach)
                                </span>
                              );
                            case "TRANSFER_OUT":
                              return (
                                <span className="coaching-ledger-badge badge--transfer-out">
                                  <TablerIcon name="arrow-right" size={13} />
                                  {entry.delta} Clases transferidas
                                </span>
                              );
                            case "TRANSFER_IN":
                              return (
                                <span className="coaching-ledger-badge badge--transfer-in">
                                  <TablerIcon name="arrow-left" size={13} />+
                                  {entry.delta} Clases recibidas
                                </span>
                              );
                            case "ADJUSTMENT":
                              return (
                                <span className="coaching-ledger-badge badge--adjustment">
                                  <TablerIcon name="adjustments" size={13} />
                                  {entry.delta > 0
                                    ? `+${entry.delta}`
                                    : entry.delta}{" "}
                                  Ajuste
                                </span>
                              );
                            default:
                              return (
                                <span
                                  className={`coaching-ledger-badge ${
                                    entry.delta > 0
                                      ? "badge--assign"
                                      : "badge--session"
                                  }`}
                                >
                                  {entry.delta > 0
                                    ? `+${entry.delta}`
                                    : entry.delta}{" "}
                                  {entry.tipo}
                                </span>
                              );
                          }
                        };

                        return (
                          <div key={entry.id} className="coaching-ledger-row">
                            <div className="coaching-ledger-row__left">
                              {renderStudentLedgerBadge()}
                              <span className="coaching-ledger-date">
                                {formatDate(entry.createdAt)}
                              </span>
                            </div>

                            <div className="coaching-ledger-row__details">
                              {entry.session && (
                                <div className="coaching-session-box">
                                  <div className="coaching-session-box__head">
                                    {entry.session.durationMinutes && (
                                      <span className="coaching-session-dur">
                                        <TablerIcon name="clock" size={13} />
                                        {entry.session.durationMinutes} min
                                      </span>
                                    )}
                                    {entry.session.focus && (
                                      <span className="coaching-session-focus">
                                        {entry.session.focus}
                                      </span>
                                    )}
                                  </div>

                                  {entry.session.workedOn &&
                                    entry.session.workedOn.length > 0 && (
                                      <div className="coaching-session-chips">
                                        {entry.session.workedOn.map((t) => (
                                          <span
                                            key={t}
                                            className="coaching-session-chip"
                                          >
                                            {t}
                                          </span>
                                        ))}
                                      </div>
                                    )}

                                  {entry.session.improvements && (
                                    <div className="coaching-session-detail">
                                      <span className="coaching-session-detail__label">
                                        Avances:
                                      </span>
                                      <span>{entry.session.improvements}</span>
                                    </div>
                                  )}

                                  {entry.session.nextGoals && (
                                    <div className="coaching-session-detail">
                                      <span className="coaching-session-detail__label">
                                        Próximo objetivo:
                                      </span>
                                      <span>{entry.session.nextGoals}</span>
                                    </div>
                                  )}

                                  {entry.session.motivationalMessage && (
                                    <div className="coaching-session-quote">
                                      <span className="coaching-session-quote__label">
                                        Mensaje de tu entrenador ({coachName})
                                      </span>
                                      “{entry.session.motivationalMessage}”
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
