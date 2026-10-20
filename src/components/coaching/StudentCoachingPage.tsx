import React, { useEffect, useState, useCallback } from "react";
import { useUser } from "../../contexts/UserContext";
import {
  fetchStudentCoachingOverview,
  linkStudentAccountByRivieraId,
  type StudentCoachingOverview,
} from "../../lib/coaching/coachingApi";
import { TablerIcon } from "../ui/TablerIcon";
import { navigateToAppHome } from "../../lib/appRouting";
import "./coaching.css";

export const StudentCoachingPage: React.FC = () => {
  const { user, loading: userLoading } = useUser();
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
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al cargar la información de Mi Coaching."
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

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

  // 1. Estado de carga
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
            onClick={() => navigateToAppHome()}
          >
            <TablerIcon name="arrow-left" size={16} />
            Inicio
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
            onClick={() => navigateToAppHome()}
          >
            <TablerIcon name="arrow-left" size={16} />
            Inicio
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

  const relationships = overview?.relationships ?? [];

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
        <p className="coaching-kicker">Riviera Coaching • Experiencia del Alumno</p>
        <div className="coaching-header-row">
          <div>
            <h1 className="coaching-title">Mi Coaching</h1>
            <p className="coaching-lead">
              Supervisa tus paquetes de clases, consulta los comentarios de tu
              entrenador y revisa el registro oficial de cada sesión impartida.
            </p>
          </div>

          {overview?.rivieraId && (
            <div className="coaching-student-badge-pill" title="Tu Riviera ID Oficial">
              <span className="coaching-student-badge-label">Riviera ID</span>
              <strong className="coaching-student-badge-val">{overview.rivieraId}</strong>
              <button
                type="button"
                className="coaching-badge-copy-btn"
                onClick={() => handleCopyRivieraId(overview.rivieraId!)}
                aria-label="Copiar Riviera ID"
              >
                <TablerIcon name={copiedRivieraId ? "check" : "copy"} size={14} />
              </button>
            </div>
          )}
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
            const hasAvailable = rel.balance.balanceClasses > 0;
            return (
              <section key={rel.relationshipId} className="coaching-student-relation-card">
                {/* 1. Header de Club y Coach */}
                <div className="coaching-student-header-grid">
                  <div className="coaching-student-coach-info">
                    <div className="coaching-student-avatar">
                      {rel.coach.fotoUrl ? (
                        <img
                          src={rel.coach.fotoUrl}
                          alt={rel.coach.nombre}
                          className="coaching-student-avatar-img"
                        />
                      ) : (
                        <span>{rel.coach.nombre.slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    <div>
                      <div className="coaching-student-coach-badge">
                        <TablerIcon name="certificate" size={13} />
                        <span>Entrenador Certificado</span>
                        {rel.coach.coachCode && (
                          <span className="coaching-code-pill">{rel.coach.coachCode}</span>
                        )}
                      </div>
                      <h2 className="coaching-student-coach-name">{rel.coach.nombre}</h2>
                      {rel.coach.especialidades && rel.coach.especialidades.length > 0 && (
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
                      {rel.club.nombre}
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
                    <div className="coaching-metric-value">{rel.balance.balanceClasses}</div>
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
                    <div className="coaching-metric-value">{rel.balance.totalClassesGiven}</div>
                    <p className="coaching-metric-desc">
                      Total de sesiones presenciales impartidas y descontadas por tu coach.
                    </p>
                  </div>
                </div>

                {/* 3. Historial Inmutable de Sesiones (Ledger) */}
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
                      {rel.ledger.length} movimiento(s)
                    </span>
                  </div>

                  {rel.ledger.length === 0 ? (
                    <div className="coaching-ledger-empty">
                      <p>Aún no se registran movimientos ni clases en este paquete.</p>
                    </div>
                  ) : (
                    <div className="coaching-ledger-timeline">
                      {rel.ledger.map((entry) => {
                        const isAssign = entry.tipo === "ASSIGN";

                        return (
                          <div key={entry.id} className="coaching-ledger-row">
                            <div className="coaching-ledger-row__left">
                              <span className={`coaching-ledger-badge ${isAssign ? "badge--assign" : "badge--session"}`}>
                                {isAssign ? (
                                  <>
                                    <TablerIcon name="plus" size={13} />
                                    +{entry.delta} Clases (Club)
                                  </>
                                ) : (
                                  <>
                                    <TablerIcon name="check" size={13} />
                                    {entry.delta} Clase (Coach)
                                  </>
                                )}
                              </span>
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
                                <div className="coaching-session-box">
                                  {entry.session.focus && (
                                    <p className="coaching-session-focus">
                                      <TablerIcon name="target" size={14} />
                                      <strong>Enfoque técnico:</strong> {entry.session.focus}
                                    </p>
                                  )}
                                  {entry.session.durationMinutes && (
                                    <span className="coaching-session-dur">
                                      <TablerIcon name="clock" size={13} />
                                      {entry.session.durationMinutes} min
                                    </span>
                                  )}
                                  {entry.session.notesSummary && (
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
