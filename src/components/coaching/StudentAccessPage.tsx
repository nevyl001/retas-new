import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  verifyStudentInvitation,
  claimStudentInvitation,
  loginStudentWithIdentifier,
  requestStudentPasswordReset,
  requestStudentAccessLink,
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

  // Estados de formulario login (Correo o Riviera ID)
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBanner, setLoginBanner] = useState<string | null>(null);

  // Estados de activación (nueva cuenta)
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [activateSuccess, setActivateSuccess] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [resendingLink, setResendingLink] = useState(false);
  const [resendLinkMessage, setResendLinkMessage] = useState<string | null>(null);

  // Estados para vinculación de cuenta existente
  const [existingPassword, setExistingPassword] = useState("");
  const [showExistingPassword, setShowExistingPassword] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Estados de recuperación
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoverySent, setRecoverySent] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  // Leer query params y capturar hash/PKCE de GoTrue
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Capturar tokens directos del URL hash si GoTrue redirigió con fragmento
    if (window.location.hash) {
      const hash = window.location.hash.substring(1);
      const hashParams = new URLSearchParams(hash);
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      if (accessToken) {
        void supabase.auth
          .setSession({
            access_token: accessToken,
            refresh_token: refreshToken || "",
          })
          .then(() => {
            const cleanUrl = window.location.pathname + window.location.search;
            window.history.replaceState(null, "", cleanUrl);
          })
          .catch((err) => {
            console.warn("[StudentAccess] Error restaurando sesión desde hash:", err);
          });
      }
    }

    // 2. Capturar código PKCE (?code=...) si estuviera presente
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get("code");
    if (code) {
      void supabase.auth.exchangeCodeForSession(code).catch((err) => {
        console.warn("[StudentAccess] Error en intercambio de código PKCE:", err);
      });
    }

    // 3. Procesar token de invitación
    const paramToken = searchParams.get("token");
    if (paramToken && paramToken.trim()) {
      setToken(paramToken.trim());
      setMode("activate");
      void handleVerifyToken(paramToken.trim());
    } else {
      setMode("login");
    }
  }, []);

  // Escuchar cambios de autenticación para capturar verificación instantánea
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

  const handleResendLink = async () => {
    if (!token) return;
    setResendingLink(true);
    setResendLinkMessage(null);
    try {
      const res = await requestStudentAccessLink(token);
      if (res.ok) {
        setResendLinkMessage(
          res.message || "Enlace enviado a tu correo electrónico. Ábrelo en este navegador."
        );
      } else {
        setResendLinkMessage(res.error || "No se pudo reenviar el enlace de acceso.");
      }
    } catch (err: any) {
      setResendLinkMessage(err.message || "Error al solicitar enlace de acceso.");
    } finally {
      setResendingLink(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawIdentifier = loginEmail.trim();
    if (!rawIdentifier || !loginPassword.trim()) {
      setLoginError("Ingresa tu correo o Riviera ID y tu contraseña.");
      return;
    }

    setLoginLoading(true);
    setLoginError(null);
    setLoginBanner(null);

    try {
      const res = await loginStudentWithIdentifier(rawIdentifier, loginPassword);
      if (!res.ok) {
        setLoginError(
          res.error || "Credenciales incorrectas. Verifica tu correo/Riviera ID y tu contraseña."
        );
        return;
      }

      navigateStudentCoaching();
    } catch (err: any) {
      setLoginError(err.message || "Error al iniciar sesión.");
    } finally {
      setLoginLoading(false);
    }
  };

  // Paso 1: Validar política de contraseña y abrir modal de confirmación sin guardar
  const handleOpenConfirmStep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      setActivateError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    // Comprobar preventivamente la identidad de la sesión activa
    const { data: sessionData } = await supabase.auth.getSession();
    const currentSession = sessionData?.session;
    const targetEmail = invitationData?.email?.trim().toLowerCase();

    if (!currentSession?.user) {
      setActivateError(
        "Se requiere sesión autenticada del alumno. Abre el enlace enviado a tu correo en este navegador para verificar tu identidad."
      );
      return;
    }

    const sessionEmail = currentSession.user.email?.trim().toLowerCase();
    if (targetEmail && sessionEmail && sessionEmail !== targetEmail) {
      setActivateError(
        `La sesión activa (${sessionEmail}) no coincide con el correo invitado (${targetEmail}). Cierra sesión e ingresa desde el enlace enviado al correo del alumno.`
      );
      return;
    }

      const appMeta = currentSession.user.app_metadata || {};
      const userMeta = currentSession.user.user_metadata || {};
      const accountType = appMeta.account_type || userMeta.account_type;
      const role = appMeta.role || userMeta.role;
      const roles: string[] = Array.isArray(appMeta.roles) ? appMeta.roles : [];

      const isPrivileged =
        accountType === "CLUB_ADMIN" ||
        accountType === "COACH_ONLY" ||
        role === "admin" ||
        role === "coach" ||
        roles.includes("admin") ||
        roles.includes("coach");

      if (isPrivileged) {
        setActivateError(
          "Esta sesión pertenece a una cuenta administrativa o de entrenador. No puede activarse como acceso de alumno. Cierra sesión e ingresa con el correo particular del alumno."
        );
        return;
      }

    setActivateError(null);
    setConfirmPassword("");
    setShowConfirmModal(true);
  };

  // Cancelar confirmación: regresar a Pantalla 1 sin alterar Auth
  const handleCancelConfirm = () => {
    setShowConfirmModal(false);
    setConfirmPassword("");
    setActivateError(null);
  };

  // Paso 2: Validar coincidencia de contraseña y ejecutar activación en Supabase
  const handleFinalActivationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (!confirmPassword) {
      setActivateError("Confirma tu contraseña para continuar.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setActivateError("Las contraseñas no coinciden. Verifica e intenta nuevamente.");
      return;
    }

    setActivating(true);
    setActivateError(null);

    try {
      // 1. Validar estrictamente la sesión autenticada activa del alumno
      const { data: sessionData } = await supabase.auth.getSession();
      const currentSession = sessionData?.session;
      const targetEmail = invitationData?.email?.trim().toLowerCase();

      if (!currentSession?.user) {
        setIsEmailVerified(false);
        setShowConfirmModal(false);
        setActivateError(
          "Se requiere sesión autenticada del alumno. Abre el enlace enviado a tu correo electrónico para verificar tu identidad."
        );
        return;
      }

      if (!currentSession.user.email_confirmed_at) {
        setIsEmailVerified(false);
        setShowConfirmModal(false);
        setActivateError(
          "El correo electrónico no ha sido verificado aún. Por favor abre el enlace recibido en tu correo electrónico."
        );
        return;
      }

      // 2. VALIDACIÓN OBLIGATORIA: Comprobar identidad de la sesión contra el correo invitado
      const sessionEmail = currentSession.user.email?.trim().toLowerCase();

      if (!sessionEmail || !targetEmail || sessionEmail !== targetEmail) {
        setShowConfirmModal(false);
        setActivateError(
          `La sesión activa (${sessionEmail || "desconocida"}) no coincide con el correo invitado (${targetEmail || "desconocido"}). Cierra sesión e ingresa desde el enlace enviado al correo del alumno.`
        );
        return;
      }

      // 3. VALIDACIÓN OBLIGATORIA: Rechazar cuentas con privilegios (administradores o entrenadores)
      const appMeta = currentSession.user.app_metadata || {};
      const userMeta = currentSession.user.user_metadata || {};
      const accountType = appMeta.account_type || userMeta.account_type;
      const role = appMeta.role || userMeta.role;
      const roles: string[] = Array.isArray(appMeta.roles) ? appMeta.roles : [];

      const isPrivileged =
        accountType === "CLUB_ADMIN" ||
        accountType === "COACH_ONLY" ||
        role === "admin" ||
        role === "coach" ||
        roles.includes("admin") ||
        roles.includes("coach");

      if (isPrivileged) {
        setShowConfirmModal(false);
        setActivateError(
          "Esta sesión pertenece a una cuenta administrativa o de entrenador. No puede activarse como acceso de alumno. Cierra sesión e ingresa con el correo particular del alumno."
        );
        return;
      }

      // 4. Definir contraseña definitiva ÚNICAMENTE después de validar identidad y permisos
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateErr) {
        setActivateError(updateErr.message || "No se pudo establecer la contraseña.");
        return;
      }

      // 5. Vincular el Riviera ID mediante claim_student_invitation
      const claimRes = await claimStudentInvitation(token);
      if (!claimRes.ok) {
        setActivateError(claimRes.error || "No se pudo vincular tu perfil de alumno.");
        return;
      }

      // 6. Flujo del alumno: Cuenta activada, vincular Riviera ID oficial y
      // llegar al formulario de inicio de sesión con el Riviera ID previamente completado.
      const officialRivieraId = claimRes.rivieraId || invitationData?.rivieraId || "";
      setShowConfirmModal(false);
      setActivateSuccess(true);

      // Limpiar URL de token para no recargar modo activación
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "/coaching/acceso-alumno");
      }

      setTimeout(() => {
        setMode("login");
        setToken(null);
        if (officialRivieraId) {
          setLoginEmail(officialRivieraId);
        }
        setLoginPassword("");
        setLoginBanner(
          `¡Cuenta activada y vinculada exitosamente! Tu acceso oficial es con tu Riviera ID: ${officialRivieraId}. Ingresa tu contraseña recién creada para acceder a Mi Coaching.`
        );
        setActivateSuccess(false);
      }, 1500);
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
            ? "Contraseña incorrecta. Ingresa la contraseña de tu cuenta de alumno."
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

      const officialRivieraId = claimRes.rivieraId || invitationData?.rivieraId || "";
      setActivateSuccess(true);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "/coaching/acceso-alumno");
      }

      setTimeout(() => {
        setMode("login");
        setToken(null);
        if (officialRivieraId) {
          setLoginEmail(officialRivieraId);
        }
        setLoginPassword("");
        setLoginBanner(
          `¡Perfil vinculado exitosamente! Tu acceso oficial es con tu Riviera ID: ${officialRivieraId}. Ingresa tu contraseña para acceder.`
        );
        setActivateSuccess(false);
      }, 1500);
    } catch (err: any) {
      setClaimError(err.message || "Error al vincular tu cuenta.");
    } finally {
      setClaiming(false);
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawInput = recoveryEmail.trim();
    if (!rawInput) {
      setRecoveryError("Ingresa tu correo electrónico registrado o Riviera ID.");
      return;
    }

    setRecoveryLoading(true);
    setRecoveryError(null);

    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/reset-password`
          : undefined;

      const res = await requestStudentPasswordReset(rawInput, redirectTo);
      if (!res.ok) {
        setRecoveryError(res.error || "No se pudo procesar la solicitud de recuperación.");
        return;
      }

      setRecoverySent(true);
    } catch (err: any) {
      setRecoveryError(err.message || "Error al solicitar la recuperación.");
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
              ? "Crea tu contraseña"
              : mode === "recovery"
              ? "Recuperar Contraseña"
              : "Acceso de Alumno"}
          </h1>
          <p className="student-access-subtitle">
            {mode === "activate"
              ? "Define tu contraseña de acceso exclusivo a Riviera Coaching."
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
                    /* Alumno con cuenta ya activada previamente en otro club */
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
                        <strong>Cuenta de alumno activa detectada:</strong> Ya cuentas con un perfil de alumno activo en Riviera Coaching. Ingresa tu contraseña actual para vincular este nuevo club sin modificar tus credenciales.
                      </div>

                      {claimError && (
                        <div className="student-alert student-alert-error">
                          {claimError}
                        </div>
                      )}

                      <div className="student-form-group">
                        <label className="student-form-label">
                          Contraseña de tu Cuenta de Alumno
                        </label>
                        <div className="student-input-wrap">
                          <input
                            type={showExistingPassword ? "text" : "password"}
                            className="student-form-input"
                            placeholder="Tu contraseña habitual"
                            value={existingPassword}
                            onChange={(e) => setExistingPassword(e.target.value)}
                            disabled={claiming}
                            required
                          />
                          <button
                            type="button"
                            className="student-input-toggle"
                            onClick={() => setShowExistingPassword(!showExistingPassword)}
                            aria-label={showExistingPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                          >
                            {showExistingPassword ? "Ocultar" : "Mostrar"}
                          </button>
                        </div>
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
                    /* Verificación de correo requerida */
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
                          Hemos enviado un enlace de confirmación a <strong>{invitationData.email}</strong>. Por seguridad y para verificar la posesión de tu correo, abre el enlace en tu correo para verificar tu cuenta y definir tu contraseña.
                        </p>
                      </div>

                      {activateError && (
                        <div className="student-alert student-alert-error" style={{ marginTop: "12px" }}>
                          {activateError}
                        </div>
                      )}

                      <div style={{ textAlign: "center", margin: "24px 0" }}>
                        <p style={{ color: "#94a3b8", fontSize: "0.85rem", marginBottom: "12px" }}>
                          ¿Ya abriste el enlace en tu correo? Comprueba el estado o solicita un nuevo enlace:
                        </p>
                        <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="student-btn-secondary"
                            onClick={() => token && handleVerifyToken(token)}
                            disabled={verifyingToken}
                          >
                            {verifyingToken ? "Comprobando..." : "Comprobar Verificación"}
                          </button>
                          <button
                            type="button"
                            className="student-btn-secondary"
                            onClick={handleResendLink}
                            disabled={resendingLink}
                          >
                            {resendingLink ? "Enviando..." : "Reenviar Enlace a mi Correo"}
                          </button>
                        </div>
                        {resendLinkMessage && (
                          <p style={{ color: "#38bdf8", fontSize: "0.85rem", marginTop: "12px" }}>
                            {resendLinkMessage}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* PANTALLA 1: GENERA TU CONTRASEÑA (UN SOLO CAMPO) */
                    <form onSubmit={handleOpenConfirmStep}>
                      {activateError && !showConfirmModal && (
                        <div className="student-alert student-alert-error">
                          {activateError}
                        </div>
                      )}

                      <div className="student-form-group">
                        <label className="student-form-label">
                          Nueva contraseña
                        </label>
                        <div className="student-input-wrap">
                          <input
                            type={showNewPassword ? "text" : "password"}
                            className="student-form-input"
                            placeholder="••••••••"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            disabled={activating}
                            required
                            minLength={8}
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            className="student-input-toggle"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            aria-label={showNewPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                          >
                            {showNewPassword ? "Ocultar" : "Mostrar"}
                          </button>
                        </div>
                        <div className="student-form-hint">
                          Mínimo 8 caracteres.
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="student-btn-primary"
                        disabled={activating || !newPassword}
                      >
                        Continuar
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
                {loginBanner && (
                  <div
                    className="student-alert student-alert-success"
                    style={{ marginBottom: "16px", lineHeight: "1.4" }}
                  >
                    {loginBanner}
                  </div>
                )}

                {loginError && (
                  <div className="student-alert student-alert-error">
                    {loginError}
                  </div>
                )}

                <div className="student-form-group">
                  <label className="student-form-label">Correo Electrónico o Riviera ID</label>
                  <input
                    type="text"
                    className="student-form-input"
                    placeholder="alumno@ejemplo.com o RIV-00000107"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    disabled={loginLoading}
                    required
                    autoComplete="username"
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
                  <div className="student-input-wrap">
                    <input
                      type={showLoginPassword ? "text" : "password"}
                      className="student-form-input"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      disabled={loginLoading}
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="student-input-toggle"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      aria-label={showLoginPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    >
                      {showLoginPassword ? "Ocultar" : "Mostrar"}
                    </button>
                  </div>
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
                ¿No tienes acceso todavía? Contacta a la administración de tu club para que registre tu Riviera ID y te envíe una invitación de alumno.
              </div>
            </div>
          )}

          {/* MODO RECUPERACIÓN DE CONTRASEÑA */}
          {mode === "recovery" && (
            <div>
              {recoverySent ? (
                <div>
                  <div className="student-alert student-alert-success">
                    <strong>Correo enviado:</strong> Si tu cuenta de alumno está registrada, recibirás un enlace para restablecer tu contraseña.
                  </div>
                  <button
                    type="button"
                    className="student-btn-primary"
                    onClick={() => {
                      setMode("login");
                      setRecoverySent(false);
                    }}
                  >
                    Volver al Inicio de Sesión
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
                      Correo Electrónico Registrado o Riviera ID
                    </label>
                    <input
                      type="text"
                      className="student-form-input"
                      placeholder="alumno@ejemplo.com o RIV-00000107"
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
                      ? "Enviando enlace..."
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

      {/* PANTALLA 2 — MODAL DE CONFIRMACIÓN DE CONTRASEÑA */}
      {showConfirmModal && (
        <div className="student-modal-overlay" role="dialog" aria-modal="true">
          <div className="student-modal-dialog">
            <div className="student-modal-header">
              <h2 className="student-modal-title">Confirma tu contraseña</h2>
              <p className="student-modal-subtitle">
                Ingresa de nuevo la contraseña para asegurar que no haya errores de escritura.
              </p>
            </div>

            <form onSubmit={handleFinalActivationSubmit}>
              {activateError && (
                <div className="student-alert student-alert-error">
                  {activateError}
                </div>
              )}

              <div className="student-form-group">
                <label className="student-form-label">
                  Confirmar contraseña
                </label>
                <div className="student-input-wrap">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    className="student-form-input"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={activating}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="student-input-toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showConfirmPassword ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
              </div>

              <div className="student-modal-actions">
                <button
                  type="button"
                  className="student-btn-secondary"
                  onClick={handleCancelConfirm}
                  disabled={activating}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="student-btn-primary"
                  disabled={activating || !confirmPassword}
                >
                  {activating ? "Activando..." : "Confirmar contraseña"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
