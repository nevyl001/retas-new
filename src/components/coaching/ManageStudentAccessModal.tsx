import React, { useState, useEffect, useCallback } from "react";
import {
  getClubStudentAccessStatus,
  createOrInviteStudentAccess,
  resendStudentInvitation,
  deactivateStudentAccess,
  reactivateStudentAccess,
} from "../../lib/coaching/coachingApi";
import type { StudentAccessInfo, StudentAccessStatus } from "../../lib/coaching/types";
import "./ManageStudentAccessModal.css";

interface ManageStudentAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizadorId: string;
  jugadorId: string;
  studentName: string;
  rivieraId?: string;
  coachId?: string;
  coachName?: string;
  clubName?: string;
  initialEmail?: string;
  onAccessUpdated?: () => void;
}

export const ManageStudentAccessModal: React.FC<ManageStudentAccessModalProps> = ({
  isOpen,
  onClose,
  organizadorId,
  jugadorId,
  studentName,
  rivieraId,
  coachId,
  coachName,
  clubName,
  initialEmail,
  onAccessUpdated,
}) => {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [accessInfo, setAccessInfo] = useState<StudentAccessInfo | null>(null);
  const [emailInput, setEmailInput] = useState(initialEmail || "");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setConfirmDeactivate(false);
    try {
      const res = await getClubStudentAccessStatus(organizadorId, jugadorId);
      setAccessInfo(res);
      if (res.email) {
        setEmailInput(res.email);
      } else if (initialEmail) {
        setEmailInput(initialEmail);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "No se pudo cargar el estado del acceso.");
    } finally {
      setLoading(false);
    }
  }, [organizadorId, jugadorId, initialEmail]);

  useEffect(() => {
    if (!isOpen || !jugadorId || !organizadorId) return;
    void loadStatus();
  }, [isOpen, jugadorId, organizadorId, loadStatus]);

  const handleCreateAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) {
      setErrorMsg("Ingresa un correo electrónico para el alumno.");
      return;
    }

    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await createOrInviteStudentAccess(
        organizadorId,
        jugadorId,
        emailInput.trim(),
        coachId
      );
      setAccessInfo(res);
      setSuccessMsg(
        res.status === "ACTIVE"
          ? "¡Cuenta vinculada exitosamente!"
          : "¡Invitación generada exitosamente!"
      );
      if (onAccessUpdated) onAccessUpdated();
    } catch (err: any) {
      setErrorMsg(err.message || "Error al generar el acceso.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleResend = async () => {
    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await resendStudentInvitation(organizadorId, jugadorId);
      setAccessInfo((prev) => ({
        ...prev,
        ...res,
        status: "INVITATION_PENDING",
      }));
      setSuccessMsg("Invitación renovada exitosamente.");
      if (onAccessUpdated) onAccessUpdated();
    } catch (err: any) {
      setErrorMsg(err.message || "Error al reenviar la invitación.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeactivate = async () => {
    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await deactivateStudentAccess(organizadorId, jugadorId);
      setAccessInfo((prev) => (prev ? { ...prev, status: "DEACTIVATED" } : null));
      setSuccessMsg(res.message || "Acceso desactivado.");
      setConfirmDeactivate(false);
      if (onAccessUpdated) onAccessUpdated();
    } catch (err: any) {
      setErrorMsg(err.message || "Error al desactivar el acceso.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async () => {
    setActionLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await reactivateStudentAccess(organizadorId, jugadorId);
      setAccessInfo((prev) => (prev ? { ...prev, status: "ACTIVE" } : null));
      setSuccessMsg(res.message || "Acceso reactivado exitosamente.");
      if (onAccessUpdated) onAccessUpdated();
    } catch (err: any) {
      setErrorMsg(err.message || "Error al reactivar el acceso.");
    } finally {
      setActionLoading(false);
    }
  };

  const getInvitationUrl = (token?: string | null) => {
    if (!token) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/coaching/acceso-alumno?token=${encodeURIComponent(token)}`;
  };

  const handleCopyLink = () => {
    const url = getInvitationUrl(accessInfo?.invitationToken);
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (!isOpen) return null;

  const currentStatus: StudentAccessStatus = accessInfo?.status || "NO_ACCESS";

  return (
    <div className="student-access-modal-overlay" onClick={onClose}>
      <div
        className="student-access-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="student-access-modal-header">
          <h2 className="student-access-modal-title">
            <span>🎾</span>
            <span>Gestionar Acceso del Alumno</span>
          </h2>
          <button
            type="button"
            className="student-access-modal-close"
            onClick={onClose}
            aria-label="Cerrar modal"
          >
            ×
          </button>
        </div>

        <div className="student-access-modal-content">
          {/* Ficha descriptiva del alumno */}
          <div className="student-access-card">
            <div className="student-access-card-row">
              <span className="student-access-card-label">Alumno:</span>
              <span className="student-access-card-value">{studentName}</span>
            </div>
            <div className="student-access-card-row">
              <span className="student-access-card-label">Riviera ID oficial:</span>
              <span
                className="student-access-card-value"
                style={{
                  fontFamily: "monospace",
                  color: "#34d399",
                  fontWeight: 700,
                }}
              >
                {rivieraId || "SIN-ID"}
              </span>
            </div>
            {coachName && (
              <div className="student-access-card-row">
                <span className="student-access-card-label">Coach:</span>
                <span className="student-access-card-value">{coachName}</span>
              </div>
            )}
            {clubName && (
              <div className="student-access-card-row">
                <span className="student-access-card-label">Club:</span>
                <span className="student-access-card-value">{clubName}</span>
              </div>
            )}
            <div className="student-access-card-row">
              <span className="student-access-card-label">Estado de acceso:</span>
              <span className="student-access-card-value">
                {currentStatus === "ACTIVE" && (
                  <span className="status-pill status-pill-active">
                    ● Acceso Activo
                  </span>
                )}
                {currentStatus === "INVITATION_PENDING" && (
                  <span className="status-pill status-pill-pending">
                    ⏳ Invitación Pendiente
                  </span>
                )}
                {currentStatus === "DEACTIVATED" && (
                  <span className="status-pill status-pill-deactivated">
                    ✕ Acceso Desactivado
                  </span>
                )}
                {currentStatus === "NO_ACCESS" && (
                  <span className="status-pill status-pill-no-access">
                    ○ Sin Acceso
                  </span>
                )}
              </span>
            </div>
          </div>

          {errorMsg && (
            <div className="student-alert student-alert-error">{errorMsg}</div>
          )}

          {successMsg && (
            <div className="student-alert student-alert-success">{successMsg}</div>
          )}

          {loading ? (
            <div className="student-loading-box">
              <div className="student-spinner" />
              <p>Consultando estado de cuenta...</p>
            </div>
          ) : (
            <div>
              {/* CASO 1: SIN ACCESO */}
              {currentStatus === "NO_ACCESS" && (
                <form onSubmit={handleCreateAccess}>
                  <div className="student-form-group">
                    <label className="student-form-label">
                      Correo Electrónico del Alumno
                    </label>
                    <input
                      type="email"
                      className="student-form-input"
                      placeholder="alumno@ejemplo.com"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      disabled={actionLoading}
                      required
                    />
                  </div>

                  <div className="modal-info-note">
                    Al crear el acceso, se generará una invitación oficial vinculada a este Riviera ID. Si el alumno ya cuenta con registro en AppRiviera, se asociará de forma inmediata sin crear cuentas duplicadas.
                  </div>

                  <div className="modal-actions-container">
                    <button
                      type="submit"
                      className="btn-action-primary"
                      disabled={actionLoading}
                    >
                      {actionLoading
                        ? "Generando acceso..."
                        : "Crear Acceso del Alumno"}
                    </button>
                  </div>
                </form>
              )}

              {/* CASO 2: INVITACIÓN PENDIENTE */}
              {currentStatus === "INVITATION_PENDING" && (
                <div>
                  <div className="student-activation-row" style={{ marginBottom: "0.75rem" }}>
                    <span className="student-activation-label">Correo invitado:</span>
                    <span className="student-activation-val">
                      {accessInfo?.email || emailInput}
                    </span>
                  </div>

                  {accessInfo?.invitationToken && (
                    <div className="invitation-link-box">
                      <div className="invitation-link-title">
                        Enlace de Activación Directo
                      </div>
                      <div className="invitation-link-container">
                        <input
                          type="text"
                          readOnly
                          className="invitation-link-input"
                          value={getInvitationUrl(accessInfo.invitationToken)}
                        />
                        <button
                          type="button"
                          className={`btn-copy-link ${copied ? "copied" : ""}`}
                          onClick={handleCopyLink}
                        >
                          {copied ? "✓ Copiado" : "Copiar Enlace"}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="modal-info-note">
                    Comparte este enlace con el alumno para que establezca su contraseña definitiva y acceda a su portal de Riviera Coaching.
                  </div>

                  <div className="modal-actions-container">
                    <button
                      type="button"
                      className="btn-action-secondary"
                      onClick={handleResend}
                      disabled={actionLoading}
                    >
                      {actionLoading
                        ? "Renovando..."
                        : "Reenviar / Renovar Invitación"}
                    </button>

                    <button
                      type="button"
                      className="btn-action-danger"
                      onClick={handleDeactivate}
                      disabled={actionLoading}
                    >
                      Cancelar Invitación
                    </button>
                  </div>
                </div>
              )}

              {/* CASO 3: ACCESO ACTIVO */}
              {currentStatus === "ACTIVE" && (
                <div>
                  <div className="student-activation-row" style={{ marginBottom: "0.5rem" }}>
                    <span className="student-activation-label">Correo vinculado:</span>
                    <span className="student-activation-val">{accessInfo?.email}</span>
                  </div>
                  {accessInfo?.createdAt && (
                    <div className="student-activation-row" style={{ marginBottom: "1rem" }}>
                      <span className="student-activation-label">Activo desde:</span>
                      <span className="student-activation-val">
                        {new Date(accessInfo.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}

                  <div className="modal-info-note">
                    El alumno tiene acceso privado a <code>/coaching/mi-coaching</code>. Sus clases contratadas, entrenamientos y seguimiento deportivo se sincronizan en tiempo real.
                  </div>

                  <div className="modal-actions-container">
                    {confirmDeactivate ? (
                      <div
                        style={{
                          background: "rgba(239, 68, 68, 0.1)",
                          padding: "1rem",
                          borderRadius: "8px",
                          border: "1px solid rgba(239, 68, 68, 0.3)",
                        }}
                      >
                        <p
                          style={{
                            margin: "0 0 0.75rem",
                            fontSize: "0.85rem",
                            color: "#fca5a5",
                          }}
                        >
                          ¿Estás seguro de pausar el acceso de este alumno?
                          <br />
                          <strong>
                            No se borrará su Riviera ID ni sus clases contratadas.
                          </strong>
                        </p>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button
                            type="button"
                            className="btn-action-danger"
                            style={{ flex: 1 }}
                            onClick={handleDeactivate}
                            disabled={actionLoading}
                          >
                            {actionLoading ? "Pausando..." : "Confirmar Pausa"}
                          </button>
                          <button
                            type="button"
                            className="btn-action-secondary"
                            style={{ flex: 1 }}
                            onClick={() => setConfirmDeactivate(false)}
                            disabled={actionLoading}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn-action-danger"
                        onClick={() => setConfirmDeactivate(true)}
                        disabled={actionLoading}
                      >
                        Desactivar Acceso del Alumno
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* CASO 4: ACCESO DESACTIVADO */}
              {currentStatus === "DEACTIVATED" && (
                <div>
                  <div className="student-alert student-alert-warning">
                    El acceso de este alumno se encuentra actualmente pausado. El alumno no puede ingresar a su portal, pero su Riviera ID, balance de clases y notas permanecen intactos.
                  </div>

                  <div className="modal-actions-container">
                    <button
                      type="button"
                      className="btn-action-primary"
                      onClick={handleReactivate}
                      disabled={actionLoading}
                    >
                      {actionLoading ? "Reactivando..." : "Reactivar Acceso del Alumno"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

