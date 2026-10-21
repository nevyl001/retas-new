import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  verifyStudentInvitation,
  activateStudentInvitation,
  claimStudentInvitation,
} from "../../lib/coaching/coachingApi";
import type { StudentInvitationVerification } from "../../lib/coaching/types";
import { navigateStudentCoaching } from "./coachingNav";
import { navigateAppTo } from "../../lib/appRouting";
import "./StudentAccessPage.css";

export const StudentAccessPage: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "activate" | "recovery">("login");

  // Estados de verificación de token
  const [verifyingToken, setVerifyingToken] = useState(false);
  const [invitationData, setInvitationData] =
    useState<StudentInvitationVerification | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Estados de formulario login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Estados de activación (nueva cuenta)
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [activateSuccess, setActivateSuccess] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);

  // Estados para vinculación de cuenta existente
  const [existingPassword, setExistingPassword] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Estados de recuperación
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  // Leer query params
  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const paramToken = searchParams.get("token");

    if (paramToken && paramToken.trim()) {
      setToken(paramToken.trim());
      setMode("activate");
      void handleVerifyToken(paramToken.trim());
    } else {
      setMode("login");
    }
  }, []);

  // Escuchar cambios de autenticación para capturar verificación instantánea (móvil / Safari)
  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user?.email_confirmed_at) {
          if (
            invitationData?.email &&
            session.user.email?.toLowerCase() === invitationData.email.toLowerCase()
          ) {
            setIsEmailVerified(true);
            setActivateError(null);
          } else if (!invitationData?.email) {
            setIsEmailVerified(true);
          }
        }
      }
    );
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [invitationData?.email]);

  const handleVerifyToken = async (tok: string) => {
    setVerifyingToken(true);
    setTokenError(null);
    try {
      const res = await verifyStudentInvitation(tok);
      if (!res.ok) {
        setTokenError(res.error || "Esta invitación no es válida o ha expirado.");
      } else {
        setInvitationData(res);
        if (res.email) {
          setLoginEmail(res.email);
        }

        let verified = Boolean(res.isEmailVerified);
        const { data: sessionData } = await supabase.auth.getSession();
        const currentSession = sessionData?.session;
        if (
          currentSession?.user?.email?.toLowerCase() === res.email?.toLowerCase() &&
          currentSession?.user?.email_confirmed_at
        ) {
          verified = true;
        }
        setIsEmailVerified(verified);
      }
    } catch (err: any) {
      setTokenError(err.message || "Error al verificar la invitación.");
    } finally {
      setVerifyingToken(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError("Ingresa tu correo y contraseña.");
      return;
    }

    setLoginLoading(true);
    setLoginError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim().toLowerCase(),
        password: loginPassword,
      });

      if (error) {
        setLoginError(
          error.message.includes("Invalid login credentials")
            ? "Correo o contraseña incorrectos. Verifica tus datos o solicita un restablecimiento."
            : error.message
        );
        return;
      }

      if (data.session) {
        // Redirigir a Mi Coaching
        navigateStudentCoaching();
      }
    } catch (err: any) {
      setLoginError(err.message || "Error al iniciar sesión.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleActivationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (!newPassword || newPassword.length < 8) {
      setActivateError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setActivateError("Las contraseñas no coinciden.");
      return;
    }

    setActivating(true);
    setActivateError(null);

    try {
      // 1. Validar que exista sesión autenticada del alumno (establecida por GoTrue al abrir el enlace)
      const { data: sessionData } = await supabase.auth.getSession();
      const currentSession = sessionData?.session;

      if (!currentSession?.user) {
        setIsEmailVerified(false);
        setActivateError(
          "Se requiere sesión autenticada del alumno. Abre el enlace enviado a tu correo electrónico para verificar tu identidad."
        );
        return;
      }

      if (!currentSession.user.email_confirmed_at) {
        setIsEmailVerified(false);
        setActivateError(
          "El correo electrónico no ha sido verificado aún. Por favor abre el enlace recibido en tu correo electrónico."
        );
        return;
      }

      // 2. Definir contraseña definitiva mediante supabase.auth.updateUser con la sesión autenticada
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateErr) {
        setActivateError(updateErr.message || "No se pudo establecer la contraseña.");
        return;
      }

      // 3. Vincular el Riviera ID mediante claim_student_invitation
      const claimRes = await claimStudentInvitation(token);
      if (!claimRes.ok) {
        // Si el claim RPC directo fallara, intentar con la Edge Function autenticada
        const edgeRes = await activateStudentInvitation(token, newPassword);
        if (!edgeRes.ok) {
          setActivateError(claimRes.error || edgeRes.error || "No se pudo vincular tu perfil de alumno.");
          return;
        }
      }

      setActivateSuccess(true);
      setTimeout(() => {
        navigateStudentCoaching();
      }, 1000);
    } catch (err: any) {
      setActivateError(err.message || "Error al activar la cuenta.");
    } finally {
      setActivating(false);
    }
  };

  const handleClaimExistingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !invitationData?.email) return;

    if (!existingPassword) {
      setClaimError("Ingresa la contraseña de tu cuenta.");
      return;
    }

    setClaiming(true);
    setClaimError(null);

    try {
      // 1. Autenticar con la cuenta existente sin alterar contraseñas ni roles
      const { data: authData, error: signInErr } =
        await supabase.auth.signInWithPassword({
          email: invitationData.email.trim().toLowerCase(),
          password: existingPassword,
        });

      if (signInErr || !authData.session) {
        setClaimError(
          signInErr?.message.includes("Invalid login credentials")
            ? "Contraseña incorrecta. Ingresa la contraseña de tu cuenta AppRiviera."
            : signInErr?.message || "Error al autenticar con tu cuenta."
        );
        return;
      }

      // 2. Reclamar y vincular la invitación
      const claimRes = await claimStudentInvitation(token);
      if (!claimRes.ok) {
        setClaimError(claimRes.error || "No se pudo vincular tu perfil.");
        return;
      }

      setActivateSuccess(true);
      setTimeout(() => {
        navigateStudentCoaching();
      }, 1000);
    } catch (err: any) {
      setClaimError(err.message || "Error al vincular tu cuenta.");
    } finally {
      setClaiming(false);
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryEmail.trim()) {
      setRecoveryError("Ingresa tu correo electrónico registrado.");
      return;
    }

    setRecoveryLoading(true);
    setRecoveryError(null);

    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/reset-password`
          : undefined;

      const { error } = await supabase.auth.resetPasswordForEmail(
        recoveryEmail.trim().toLowerCase(),
        { redirectTo }
      );

      if (error) {
        setRecoveryError(error.message);
        return;
      }

      setRecoverySent(true);
    } catch (err: any) {
      setRecoveryError(err.message || "Error al enviar correo de recuperación.");
    } finally {
      setRecoveryLoading(false);
    }
  };

  const clearTokenAndGoToLogin = () => {
    setToken(null);
    setInvitationData(null);
    setTokenError(null);
    setMode("login");
    navigateAppTo("/coaching/acceso-alumno");
  };

  return (
    <div className="student-access-page">
      <div className="student-access-container">
        <div className="student-access-header">
          <div className="student-access-badge">Riviera Coaching</div>
          <h1 className="student-access-title">
            {mode === "activate"
              ? "Activa tu Acceso de Alumno"
              : mode === "recovery"
              ? "Recuperar Contraseña"
              : "Acceso de Alumno"}
          </h1>
          <p className="student-access-subtitle">
            {mode === "activate"
              ? "Crea tu contraseña definitiva para consultar tus clases y entrenamientos vinculados a tu Riviera ID."
              : mode === "recovery"
              ? "Te enviaremos un enlace a tu correo para restablecer tu contraseña."
              : "Consulta tus clases, entrenamientos y seguimiento deportivo."}
          </p>
        </div>

        <div className="student-access-body">
          {/* MODO ACTIVACIÓN CON TOKEN */}
          {mode === "activate" && (
            <div>
              {verifyingToken && (
                <div className="student-loading-box">
                  <div className="student-spinner" />
                  <p>Verificando invitación oficial...</p>
                </div>
              )}

              {tokenError && (
                <div>
                  <div className="student-alert student-alert-error">
                    <strong>Invitación no disponible:</strong> {tokenError}
                  </div>
                  <button
                    type="button"
                    className="student-btn-secondary"
                    onClick={clearTokenAndGoToLogin}
                  >
                    Ir al Inicio de Sesión
                  </button>
                </div>
              )}

              {!verifyingToken && !tokenError && invitationData && (
                <div>
                  {/* Tarjeta de identificación del alumno */}
                  <div className="student-activation-card">
                    <div className="student-activation-card-header">
                      <span className="student-activation-name">
                        {invitationData.studentName}
                      </span>
                      <span className="student-riviera-badge">
                        {invitationData.rivieraId || "SIN-ID"}
                      </span>
                    </div>

                    <div className="student-activation-details">
                      {invitationData.clubName && (
                        <div className="student-activation-row">
                          <span className="student-activation-label">Club:</span>
                          <span className="student-activation-val">
                            {invitationData.clubName}
                          </span>
                        </div>
                      )}
                      {invitationData.coachName && (
                        <div className="student-activation-row">
                          <span className="student-activation-label">Entrenador:</span>
                          <span className="student-activation-val">
                            {invitationData.coachName}
                          </span>
                        </div>
                      )}
                      {invitationData.email && (
                        <div className="student-activation-row">
                          <span className="student-activation-label">Correo:</span>
                          <span className="student-activation-val">
                            {invitationData.email}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {activateSuccess ? (
                    <div className="student-alert student-alert-success">
                      <strong>¡Cuenta vinculada exitosamente!</strong> Entrando a tu espacio deportivo...
                    </div>
                  ) : invitationData.isExistingAccount ? (
                    <form onSubmit={handleClaimExistingSubmit}>
                      <div
                        className="student-alert"
                        style={{
                          background: "rgba(59, 130, 246, 0.12)",
                          border: "1px solid rgba(59, 130, 246, 0.3)",
                          color: "#93c5fd",
                          fontSize: "0.85rem",
                          lineHeight: "1.4",
                        }}
                      >
                        <strong>Cuenta detectada:</strong> Ya tienes una cuenta en AppRiviera con este correo. Ingresa tu contraseña actual para vincular tu perfil de coaching sin modificar tus credenciales.
                      </div>

                      {claimError && (
                        <div className="student-alert student-alert-error">
                          {claimError}
                        </div>
                      )}

                      <div className="student-form-group">
                        <label className="student-form-label">
                          Contraseña de tu Cuenta AppRiviera
                        </label>
                        <input
                          type="password"
                          className="student-form-input"
                          placeholder="Tu contraseña habitual"
                          value={existingPassword}
                          onChange={(e) => setExistingPassword(e.target.value)}
                          disabled={claiming}
                          required
                        />
                      </div>

                      <button
                        type="submit"
                        className="student-btn-primary"
                        disabled={claiming}
                      >
                        {claiming
                          ? "Vinculando perfil..."
                          : "Vincular a Mi Cuenta y Entrar"}
                      </button>
                    </form>
                  ) : !isEmailVerified ? (
                    <div>
                      <div
                        className="student-alert"
                        style={{
                          background: "rgba(245, 158, 11, 0.12)",
                          border: "1px solid rgba(245, 158, 11, 0.3)",
                          color: "#fcd34d",
                          lineHeight: "1.5",
                          fontSize: "0.88rem",
                        }}
                      >
                        <strong>Verificación de Correo Requerida</strong>
                        <p style={{ marginTop: "6px", marginBottom: "0" }}>
                          Hemos enviado un enlace de confirmación a <strong>{invitationData.email}</strong>. Por seguridad y para verificar la posesión de tu correo, debes abrir el enlace en tu correo antes de definir tu contraseña.
                        </p>
                      </div>

                      {activateError && (
                        <div className="student-alert student-alert-error" style={{ marginTop: "12px" }}>
                          {activateError}
                        </div>
                      )}

                      <div style={{ textAlign: "center", margin: "24px 0" }}>
                        <p style={{ color: "#94a3b8", fontSize: "0.85rem", marginBottom: "12px" }}>
                          ¿Ya abriste el enlace en tu correo? Comprueba el estado de tu verificación:
                        </p>
                        <button
                          type="button"
                          className="student-btn-secondary"
                          onClick={() => token && handleVerifyToken(token)}
                          disabled={verifyingToken}
                        >
                          {verifyingToken ? "Comprobando..." : "Comprobar Estado de Verificación"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleActivationSubmit}>
                      {activateError && (
                        <div className="student-alert student-alert-error">
                          {activateError}
                        </div>
                      )}

                      <div className="student-form-group">
                        <label className="student-form-label">
                          Crea tu Contraseña Definitiva
                        </label>
                        <input
                          type="password"
                          className="student-form-input"
                          placeholder="Mínimo 8 caracteres (mayúscula, minúscula, número)"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          disabled={activating}
                          required
                          minLength={8}
                        />
                      </div>

                      <div className="student-form-group">
                        <label className="student-form-label">
                          Confirma tu Contraseña
                        </label>
                        <input
                          type="password"
                          className="student-form-input"
                          placeholder="Repite tu contraseña"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          disabled={activating}
                          required
                          minLength={8}
                        />
                      </div>

                      <button
                        type="submit"
                        className="student-btn-primary"
                        disabled={activating}
                      >
                        {activating
                          ? "Activando cuenta..."
                          : "Activar Mi Cuenta y Entrar"}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* MODO INICIAR SESIÓN */}
          {mode === "login" && (
            <div>
              <form onSubmit={handleLoginSubmit}>
                {loginError && (
                  <div className="student-alert student-alert-error">
                    {loginError}
                  </div>
                )}

                <div className="student-form-group">
                  <label className="student-form-label">Correo Electrónico</label>
                  <input
                    type="email"
                    className="student-form-input"
                    placeholder="alumno@ejemplo.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    disabled={loginLoading}
                    required
                  />
                </div>

                <div className="student-form-group">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.45rem",
                    }}
                  >
                    <label
                      className="student-form-label"
                      style={{ marginBottom: 0 }}
                    >
                      Contraseña
                    </label>
                    <button
                      type="button"
                      className="student-text-btn"
                      style={{ fontSize: "0.75rem" }}
                      onClick={() => {
                        setMode("recovery");
                        setRecoveryEmail(loginEmail);
                      }}
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                  <input
                    type="password"
                    className="student-form-input"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    disabled={loginLoading}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="student-btn-primary"
                  disabled={loginLoading}
                >
                  {loginLoading ? "Iniciando sesión..." : "Ingresar a Mi Coaching"}
                </button>
              </form>

              <div className="student-help-box">
                <strong>¿Eres alumno nuevo?</strong>
                <p style={{ margin: "0.35rem 0 0" }}>
                  Tu club debe invitarte directamente para vincular tu Riviera ID oficial y saldo de clases contratadas.
                </p>
              </div>
            </div>
          )}

          {/* MODO RECUPERAR CONTRASEÑA */}
          {mode === "recovery" && (
            <div>
              {recoverySent ? (
                <div>
                  <div className="student-alert student-alert-success">
                    <strong>Correo enviado:</strong> Te hemos enviado las instrucciones para restablecer tu contraseña a <strong>{recoveryEmail}</strong>.
                  </div>
                  <button
                    type="button"
                    className="student-btn-secondary"
                    onClick={() => {
                      setMode("login");
                      setRecoverySent(false);
                    }}
                  >
                    Volver a Iniciar Sesión
                  </button>
                </div>
              ) : (
                <form onSubmit={handleRecoverySubmit}>
                  {recoveryError && (
                    <div className="student-alert student-alert-error">
                      {recoveryError}
                    </div>
                  )}

                  <div className="student-form-group">
                    <label className="student-form-label">
                      Correo Electrónico Registrado
                    </label>
                    <input
                      type="email"
                      className="student-form-input"
                      placeholder="alumno@ejemplo.com"
                      value={recoveryEmail}
                      onChange={(e) => setRecoveryEmail(e.target.value)}
                      disabled={recoveryLoading}
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="student-btn-primary"
                    disabled={recoveryLoading}
                  >
                    {recoveryLoading
                      ? "Enviando correo..."
                      : "Enviar Enlace de Recuperación"}
                  </button>

                  <button
                    type="button"
                    className="student-btn-secondary"
                    onClick={() => setMode("login")}
                    disabled={recoveryLoading}
                  >
                    Cancelar y Volver
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

