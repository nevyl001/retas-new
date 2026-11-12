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
  fotoUrl?: string | null;
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
  fotoUrl,
  initialEmail,
  onAccessUpdated,
}) => {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [accessInfo, setAccessInfo] = useState<StudentAccessInfo | null>(null);
  const [emailInput, setEmailInput] = useState(initialEmail || "");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
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
        res.message ||
          (res.status === "ACTIVE"
            ? "El alumno ya tiene su cuenta activa."
            : "Invitación enviada al correo del alumno.")
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
        status: res.status || "INVITATION_PENDING",
      }));
      setSuccessMsg(
        res.status === "ACTIVE"
          ? "El alumno ya activó su cuenta. No se envió otro correo."
          : "Invitación enviada al correo del alumno."
      );
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
      const next = await getClubStudentAccessStatus(organizadorId, jugadorId);
      setAccessInfo(next);
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
      const next = await getClubStudentAccessStatus(organizadorId, jugadorId);
      setAccessInfo(next);
      setSuccessMsg(res.message || "Acceso reactivado.");
      if (onAccessUpdated) onAccessUpdated();
    } catch (err: any) {
      setErrorMsg(err.message || "Error al reactivar el acceso.");
    } finally {
      setActionLoading(false);
    }
  };

  if (!isOpen) return null;

  const currentStatus: StudentAccessStatus = accessInfo?.status || "NO_ACCESS";
  const activationDate = accessInfo?.activatedAt || accessInfo?.createdAt;
  const formatDate = (value?: string | null) => {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="student-access-modal-overlay" onClick={onClose}>
      <div
        className="student-access-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="student-access-modal-header">
          <h2 className="student-access-modal-title">
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
            <div className="student-access-identity">
              <div className="student-access-avatar" aria-hidden>
                {fotoUrl ? (
                  <img src={fotoUrl} alt="" />
                ) : (
                  (studentName || "A").slice(0, 1).toUpperCase()
                )}
              </div>
              <div>
                <p className="student-access-identity-name">{studentName}</p>
                <p className="student-access-identity-id">{rivieraId || "Sin Riviera ID"}</p>
              </div>
            </div>
            {coachName && (
              <div className="student-access-card-row">
                <span className="student-access-card-label">Coach</span>
                <span className="student-access-card-value">{coachName}</span>
              </div>
            )}
            {clubName && (
              <div className="student-access-card-row">
                <span className="student-access-card-label">Club</span>
                <span className="student-access-card-value">{clubName}</span>
              </div>
            )}
            <div className="student-access-card-row">
              <span className="student-access-card-label">Correo vinculado</span>
              <span className="student-access-card-value">
                {accessInfo?.email || emailInput || "Sin correo"}
              </span>
            </div>
            <div className="student-access-card-row">
              <span className="student-access-card-label">Activación</span>
              <span className="student-access-card-value">
                {currentStatus === "ACTIVE" && (
                  <span className="status-pill status-pill-active">Acceso activo</span>
                )}
                {currentStatus === "INVITATION_PENDING" && (
                  <span className="status-pill status-pill-pending">Pendiente de activación</span>
                )}
                {currentStatus === "DEACTIVATED" && (
                  <span className="status-pill status-pill-deactivated">Acceso desactivado</span>
                )}
                {currentStatus === "NO_ACCESS" && (
                  <span className="status-pill status-pill-no-access">Sin acceso</span>
                )}
              </span>
            </div>
            {currentStatus === "ACTIVE" && activationDate ? (
              <div className="student-access-card-row">
                <span className="student-access-card-label">Activó su cuenta</span>
                <span className="student-access-card-value">{formatDate(activationDate)}</span>
              </div>
            ) : null}
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
                        : "Enviar invitación"}
                    </button>
                  </div>
                </form>
              )}

              {currentStatus === "INVITATION_PENDING" && (
                <div>
                  <div className="modal-info-note">
                    {accessInfo?.invitationExpired
                      ? "La invitación venció y el alumno todavía no creó su contraseña. Reenviar genera un enlace nuevo, de un solo uso, sin duplicar su Riviera ID."
                      : "La invitación está enviada. El alumno entra al correo, activa su cuenta y crea su contraseña. Hasta entonces no tiene acceso, aunque ya tenga clases asignadas."}
                  </div>
                  <div className="modal-actions-container">
                    <button
                      type="button"
                      className="btn-action-primary"
                      onClick={handleResend}
                      disabled={actionLoading}
                    >
                      {actionLoading ? "Enviando..." : "Reenviar invitación"}
                    </button>
                    <button
                      type="button"
                      className="btn-action-danger"
                      onClick={handleDeactivate}
                      disabled={actionLoading}
                    >
                      Cancelar invitación
                    </button>
                  </div>
                </div>
              )}

              {currentStatus === "ACTIVE" && (
                <div>
                  <div className="modal-info-note">
                    El alumno ya activó su cuenta. Entra a Mi Coaching con su Riviera ID y su contraseña. Si la olvida, la recupera desde el acceso del alumno.
                  </div>
                  <div className="modal-actions-container">
                    {confirmDeactivate ? (
                      <div className="student-access-confirm">
                        <p>
                          Se suspende el ingreso a Mi Coaching. Su Riviera ID, sus clases y su seguimiento se conservan.
                        </p>
                        <div className="student-access-confirm-actions">
                          <button
                            type="button"
                            className="btn-action-danger"
                            onClick={handleDeactivate}
                            disabled={actionLoading}
                          >
                            {actionLoading ? "Desactivando..." : "Confirmar"}
                          </button>
                          <button
                            type="button"
                            className="btn-action-secondary"
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
                        Desactivar acceso
                      </button>
                    )}
                  </div>
                </div>
              )}

              {currentStatus === "DEACTIVATED" && (
                <div>
                  <div className="modal-info-note">
                    El club suspendió el ingreso. Las clases asignadas siguen en el expediente.
                  </div>
                  <div className="modal-actions-container">
                    {accessInfo?.passwordConfigured ? (
                      <button
                        type="button"
                        className="btn-action-primary"
                        onClick={handleReactivate}
                        disabled={actionLoading}
                      >
                        {actionLoading ? "Reactivando..." : "Reactivar acceso"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-action-primary"
                        onClick={handleResend}
                        disabled={actionLoading}
                      >
                        {actionLoading ? "Enviando..." : "Enviar invitación"}
                      </button>
                    )}
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

