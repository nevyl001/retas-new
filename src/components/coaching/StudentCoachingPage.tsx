import React, { useEffect, useState, useCallback } from "react";
import { useUser } from "../../contexts/UserContext";
import {
  fetchStudentCoachingOverview,
  linkStudentAccountByRivieraId,
  type StudentCoachingOverview,
} from "../../lib/coaching/coachingApi";
import { TablerIcon } from "../ui/TablerIcon";
import { navigateToAppHome } from "../../lib/appRouting";
import { navigateCoaching } from "./coachingNav";
import "./coaching.css";

export const StudentCoachingPage: React.FC = () => {
  const { user, isStudentOnly, isCoachOnly, loading: userLoading } = useUser();
  const [overview, setOverview] = useState<StudentCoachingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Formulario para vincular Riviera ID en caso de perfil no enlazado
  const [manualRivieraId, setManualRivieraId] = useState("");
  const [linking, setLinking] = useState(false);
  const [copiedRivieraId, setCopiedRivieraId] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchStudentCoachingOverview();
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
          : "Error al cargar la información de Mi Coaching."
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
    navigator.clipboard.writeText(rivieraId);
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
        `¡Identidad vinculada exitosamente a ${res.nombre || "tu perfil"} (${res.rivieraId})!`
      );
      setManualRivieraId("");
      await loadData();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Error al vincular tu Riviera ID"
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

  const handleBack = () => {
    if (overview?.rivieraId) {
      window.location.href = `/ranking/jugador/${overview.rivieraId}`;
    } else if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      navigateToAppHome();
    }
  };

  // 1. Estado de carga
  if (userLoading || loading) {
    return (
      <div className="coaching-page rv-page">
        <header className="coaching-hero">
          <button
            type="button"
            className="coaching-back"
            onClick={handleBack}
          >
            <TablerIcon name="arrow-left" size={16} />
            {overview?.rivieraId ? "Volver a mi Ficha" : "Inicio"}
          </button>
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
      <div className="coaching-page rv-page">
        <header className="coaching-hero">
          <button
            type="button"
            className="coaching-back"
            onClick={handleBack}
          >
            <TablerIcon name="arrow-left" size={16} />
            {overview?.rivieraId ? "Volver a mi Ficha" : "Inicio"}
          </button>
          <p className="coaching-kicker">Riviera Coaching</p>
          <h1 className="coaching-title">Mi Coaching</h1>
        </header>

        <div className="coaching-empty-card">
          <TablerIcon name="lock" size={44} className="coaching-empty-icon" />
          <h3>Sesión requerida</h3>
          <p>
            Inicia sesión con tu cuenta oficial de Riviera para consultar tus
            clases disponibles, tu coach e historial de sesiones impartidas.
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

  // 3. Si hubo un error de carga
  if (error) {
    return (
      <div className="coaching-page rv-page">
        <header className="coaching-hero">
          <button
            type="button"
            className="coaching-back"
            onClick={handleBack}
          >
            <TablerIcon name="arrow-left" size={16} />
            {overview?.rivieraId ? "Volver a mi Ficha" : "Inicio"}
          </button>
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
      <div className="coaching-page rv-page">
        <header className="coaching-hero">
          <p className="coaching-kicker">Riviera Coaching • Panel de Administración</p>
          <h1 className="coaching-title">Mi Coaching</h1>
          <p className="coaching-lead">
            Has iniciado sesión como <strong>Administrador de Club</strong>. La sección de «Mi Coaching» está reservada para el seguimiento deportivo de alumnos.
          </p>
          <div style={{ marginTop: "1rem" }}>
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
  const primaryRel = relationships.find((r) => r.isPrimary) || relationships[0];
  const primaryPlayer = primaryRel?.player;
  const effectiveRivieraId = overview?.rivieraId || primaryPlayer?.rivieraId;

  return (
    <div className="coaching-page rv-page">
      <header className="coaching-hero">
        <button
          type="button"
          className="coaching-back"
          onClick={handleBack}
        >
          <TablerIcon name="arrow-left" size={16} />
          {effectiveRivieraId ? "Volver a mi Ficha" : "Inicio"}
        </button>
        <p className="coaching-kicker">Riviera Coaching • Experiencia del Alumno</p>
        <div className="coaching-header-row" style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", flex: 1, minWidth: "260px" }}>
            {primaryPlayer?.fotoUrl ? (
              <img
                src={primaryPlayer.fotoUrl}
                alt={primaryPlayer.nombre}
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "2px solid #38bdf8",
                  boxShadow: "0 4px 12px rgba(56, 189, 248, 0.25)",
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  border: "2px solid #38bdf8",
                  flexShrink: 0,
                }}
              >
                {(primaryPlayer?.nombre || user?.email || "A").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <p style={{ margin: "0 0 0.2rem", fontSize: "0.82rem", fontWeight: 700, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Mi Coaching
              </p>
              <h1 className="coaching-title" style={{ margin: 0, fontSize: "1.6rem" }}>
                {primaryPlayer?.nombre || "Mi Coaching"}
              </h1>
              <p className="coaching-lead" style={{ margin: "0.2rem 0 0", fontSize: "0.9rem" }}>
                Supervisa tus paquetes de clases, consulta los comentarios de tu
                entrenador y revisa el registro oficial de cada sesión impartida.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            {effectiveRivieraId && (
              <div className="coaching-student-badge-pill" title="Tu Riviera ID Oficial">
                <span className="coaching-student-badge-label">Riviera ID</span>
                <strong className="coaching-student-badge-val">{effectiveRivieraId}</strong>
                <button
                  type="button"
                  className="coaching-badge-copy-btn"
                  onClick={() => handleCopyRivieraId(effectiveRivieraId)}
                  aria-label="Copiar Riviera ID"
                >
                  <TablerIcon name={copiedRivieraId ? "check" : "copy"} size={14} />
                </button>
              </div>
            )}

            {effectiveRivieraId && (
              <button
                type="button"
                className="coaching-btn coaching-btn--secondary"
                style={{ fontSize: "0.82rem", padding: "0.35rem 0.75rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
                onClick={() => {
                  window.location.href = `/ranking/jugador/${effectiveRivieraId}`;
                }}
              >
                <TablerIcon name="user" size={15} />
                Ver mi Ficha de Ranking
              </button>
            )}
          </div>
        </div>
      </header>

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
          <div className="coaching-empty-card">
            <TablerIcon name="ball-tennis" size={48} className="coaching-empty-icon" />
            <h3>Aún no tienes un entrenador asignado</h3>
            <p>
              Tu club y tu coach administran tus clases en Riviera Coaching.
              Para que tu entrenador te vincule a su lista de alumnos y te asigne
              tus clases disponibles, facilítale tu Riviera ID oficial:
            </p>

            {overview?.rivieraId ? (
              <div className="coaching-riviera-share-box">
                <span className="coaching-riviera-share-label">Tu Riviera ID:</span>
                <span className="coaching-riviera-share-code">{overview.rivieraId}</span>
                <button
                  type="button"
                  className="coaching-btn coaching-btn--secondary"
                  onClick={() => handleCopyRivieraId(overview.rivieraId!)}
                >
                  <TablerIcon name={copiedRivieraId ? "check" : "copy"} size={16} />
                  {copiedRivieraId ? "Copiado" : "Copiar"}
                </button>
              </div>
            ) : (
              <div className="coaching-link-help-card">
                <p className="coaching-link-help-text">
                  Si ya tienes una credencial de Riviera pero tu cuenta de acceso
                  se registró con un correo distinto, ingresa tu Riviera ID a continuación
                  para enlazar tu historial deportivo:
                </p>
                <form onSubmit={handleManualLink} className="coaching-link-form">
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
          {relationships.map((rel) => {
            const currentBalance = rel.balance?.balanceClasses ?? 0;
            const hasAvailable = currentBalance > 0;
            const coachName = rel.coach?.nombre ?? "Coach";
            const clubName = rel.club?.nombre ?? "Club Riviera";
            return (
              <section key={rel.relationshipId} className="coaching-student-relation-card">
                {/* 1. Header de Club y Coach */}
                <div className="coaching-student-header-grid">
                  <div className="coaching-student-coach-info">
                    <div className="coaching-student-avatar">
                      {rel.coach?.fotoUrl ? (
                        <img
                          src={rel.coach.fotoUrl}
                          alt={coachName}
                          className="coaching-student-avatar-img"
                        />
                      ) : (
                        <span>{coachName.slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    <div>
                      <div className="coaching-student-coach-badge">
                        <TablerIcon name="certificate" size={13} />
                        <span>Entrenador Certificado</span>
                        {rel.coach?.coachCode && (
                          <span className="coaching-code-pill">{rel.coach.coachCode}</span>
                        )}
                      </div>
                      <h2 className="coaching-student-coach-name">{coachName}</h2>
                      {rel.coach?.especialidades && rel.coach.especialidades.length > 0 && (
                        <div className="coaching-student-spec-tags">
                          {rel.coach.especialidades.map((spec) => (
                            <span key={spec} className="coaching-student-spec-tag">
                              {spec}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="coaching-student-club-info">
                    <span className="coaching-student-club-eyebrow">Club de Entrenamiento</span>
                    <h3 className="coaching-student-club-name">
                      <TablerIcon name="building-community" size={16} />
                      {clubName}
                    </h3>
                    <span className="coaching-student-member-since">
                      Vinculado desde: {formatDate(rel.startedAt)}
                    </span>
                  </div>
                </div>

                {/* 2. Tarjetas de Saldo y Métricas */}
                <div className="coaching-student-metrics-grid">
                  <div className={`coaching-student-metric-card ${hasAvailable ? "coaching-metric--active" : "coaching-metric--empty"}`}>
                    <div className="coaching-metric-top">
                      <span className="coaching-metric-label">Clases Disponibles</span>
                      <span className={`coaching-status-pill ${hasAvailable ? "pill--success" : "pill--warning"}`}>
                        {hasAvailable ? "Paquete Vigente" : "Sin Saldo Restante"}
                      </span>
                    </div>
                    <div className="coaching-metric-value">{currentBalance}</div>
                    <p className="coaching-metric-desc">
                      {hasAvailable
                        ? "Clases listas para impartir o tomar en cancha."
                        : "Solicita a la recepción o administración de tu club la recarga de tu paquete de clases."}
                    </p>
                  </div>

                  <div className="coaching-student-metric-card coaching-metric--neutral">
                    <div className="coaching-metric-top">
                      <span className="coaching-metric-label">Clases Impartidas</span>
                      <TablerIcon name="history" size={18} className="coaching-metric-icon" />
                    </div>
                    <div className="coaching-metric-value">{rel.balance?.totalClassesGiven ?? 0}</div>
                    <p className="coaching-metric-desc">
                      Total de sesiones presenciales impartidas y descontadas por tu coach.
                    </p>
                  </div>
                </div>

                {/* 3. Próximas Clases Agendadas */}
                {rel.upcomingSessions && rel.upcomingSessions.length > 0 && (
                  <div className="coaching-student-agenda-section" style={{ marginBottom: "1.5rem" }}>
                    <div className="coaching-ledger-header">
                      <div>
                        <h3 className="coaching-ledger-title" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <TablerIcon name="calendar-event" size={20} style={{ color: "var(--ro-primary, #10b981)" }} />
                          Próximas Clases Agendadas
                        </h3>
                        <p className="coaching-ledger-desc">
                          Horarios confirmados de entrenamiento con {coachName} en {clubName}.
                        </p>
                      </div>
                      <span className="coaching-badge coaching-badge--active" style={{ fontWeight: 600 }}>
                        {rel.upcomingSessions.length}{" "}
                        {rel.upcomingSessions.length === 1 ? "sesión programada" : "sesiones programadas"}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                        gap: "1rem",
                        marginTop: "1rem",
                      }}
                    >
                      {rel.upcomingSessions.map((sch) => (
                        <div
                          key={sch.id}
                          style={{
                            background: "rgba(16, 185, 129, 0.05)",
                            border: "1px solid rgba(16, 185, 129, 0.2)",
                            borderRadius: "12px",
                            padding: "1rem 1.25rem",
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.5rem",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--ro-text-main, #f8fafc)" }}>
                              {formatDate(sch.startsAt)}
                            </span>
                            <span
                              style={{
                                fontSize: "0.75rem",
                                padding: "0.2rem 0.5rem",
                                borderRadius: "6px",
                                background: "rgba(16, 185, 129, 0.2)",
                                color: "#34d399",
                                fontWeight: 600,
                              }}
                            >
                              {sch.durationMinutes} min
                            </span>
                          </div>
                          {sch.court && (
                            <div
                              style={{
                                fontSize: "0.82rem",
                                color: "var(--ro-text-muted, #94a3b8)",
                                display: "flex",
                                alignItems: "center",
                                gap: "0.3rem",
                              }}
                            >
                              <TablerIcon name="map-pin" size={14} /> Cancha:{" "}
                              <strong style={{ color: "var(--ro-text-main)" }}>{sch.court}</strong>
                            </div>
                          )}
                          {sch.focus && (
                            <div
                              style={{
                                fontSize: "0.82rem",
                                color: "var(--ro-brand, #38bdf8)",
                                display: "flex",
                                alignItems: "center",
                                gap: "0.3rem",
                              }}
                            >
                              <TablerIcon name="target" size={14} /> Tema: {sch.focus}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. Historial Inmutable de Sesiones (Ledger) */}
                <div className="coaching-student-ledger-section">
                  <div className="coaching-ledger-header">
                    <div>
                      <h3 className="coaching-ledger-title">
                        <TablerIcon name="shield-check" size={18} />
                        Historial de Sesiones y Asignaciones
                      </h3>
                      <p className="coaching-ledger-subtitle">
                        Registro oficial inmutable y transparente de tu paquete de clases.
                      </p>
                    </div>
                    <span className="coaching-ledger-count">
                      {(rel.ledger ?? []).length} movimiento(s)
                    </span>
                  </div>

                  {(rel.ledger ?? []).length === 0 ? (
                    <div className="coaching-ledger-empty">
                      <p>Aún no se registran movimientos ni clases en este paquete.</p>
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
                                  <TablerIcon name="plus" size={13} />
                                  +{entry.delta} Clases (Club)
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
                                  {entry.delta} Clases transferidas
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
                                  +{entry.delta} Clases recibidas
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
                                  {entry.delta > 0 ? `+${entry.delta}` : entry.delta} Ajuste
                                </span>
                              );
                            default:
                              return (
                                <span
                                  className={`coaching-ledger-badge ${entry.delta > 0 ? "badge--assign" : "badge--session"}`}
                                >
                                  {entry.delta > 0 ? `+${entry.delta}` : entry.delta} {entry.tipo}
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
                              {entry.notas && (
                                <p className="coaching-ledger-notes">
                                  <strong>Detalle:</strong> {entry.notas}
                                </p>
                              )}

                              {entry.session && (
                                <div className="coaching-session-box" style={{ marginTop: "0.5rem", gap: "0.5rem" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                                    {entry.session.durationMinutes && (
                                      <span className="coaching-session-dur">
                                        <TablerIcon name="clock" size={13} />
                                        {entry.session.durationMinutes} min
                                      </span>
                                    )}
                                    {entry.session.focus && (
                                      <span style={{ fontSize: "0.8rem", color: "var(--ro-text-primary)", fontWeight: 600 }}>
                                        {entry.session.focus}
                                      </span>
                                    )}
                                  </div>

                                  {/* Chips de temas trabajados */}
                                  {entry.session.workedOn && entry.session.workedOn.length > 0 && (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.2rem" }}>
                                      {entry.session.workedOn.map((t) => (
                                        <span
                                          key={t}
                                          style={{
                                            padding: "0.15rem 0.5rem",
                                            borderRadius: "12px",
                                            fontSize: "0.72rem",
                                            background: "rgba(56, 189, 248, 0.12)",
                                            color: "#7dd3fc",
                                            border: "1px solid rgba(56, 189, 248, 0.25)",
                                          }}
                                        >
                                          {t}
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  {/* Mejoras observadas */}
                                  {entry.session.improvements && (
                                    <div style={{ fontSize: "0.8rem", color: "var(--ro-text-secondary)" }}>
                                      <span style={{ color: "#34d399", fontWeight: 600, marginRight: "0.35rem" }}>
                                        ✓ Mejoras:
                                      </span>
                                      {entry.session.improvements}
                                    </div>
                                  )}

                                  {/* Próximos objetivos */}
                                  {entry.session.nextGoals && (
                                    <div style={{ fontSize: "0.8rem", color: "var(--ro-text-secondary)" }}>
                                      <span style={{ color: "#fbbf24", fontWeight: 600, marginRight: "0.35rem" }}>
                                        🎯 Próximos objetivos:
                                      </span>
                                      {entry.session.nextGoals}
                                    </div>
                                  )}

                                  {/* Mensaje motivacional / Feedback personal */}
                                  {entry.session.motivationalMessage && (
                                    <div
                                      style={{
                                        marginTop: "0.25rem",
                                        padding: "0.6rem 0.85rem",
                                        background: "rgba(255, 255, 255, 0.04)",
                                        borderRadius: "6px",
                                        borderLeft: "3px solid #10b981",
                                        fontSize: "0.82rem",
                                        color: "var(--ro-text-primary)",
                                      }}
                                    >
                                      <span
                                        style={{
                                          display: "block",
                                          fontSize: "0.7rem",
                                          textTransform: "uppercase",
                                          letterSpacing: "0.05em",
                                          color: "#34d399",
                                          fontWeight: 700,
                                          marginBottom: "0.2rem",
                                        }}
                                      >
                                        Mensaje de tu coach ({coachName})
                                      </span>
                                      "{entry.session.motivationalMessage}"
                                    </div>
                                  )}

                                  {entry.session.notesSummary && !entry.session.motivationalMessage && (
                                    <p className="coaching-session-feedback">
                                      {entry.session.notesSummary}
                                    </p>
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
