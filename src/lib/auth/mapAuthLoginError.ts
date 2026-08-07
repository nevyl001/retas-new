/**
 * Mensajes de login entendibles (Supabase Auth → español).
 * No revela si el email existe o no cuando es invalid_credentials.
 */
export function mapAuthLoginError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "No se pudo iniciar sesión. Intenta de nuevo.";
  }

  const err = error as { message?: string; code?: string; status?: number };
  const code = (err.code || "").toLowerCase();
  const message = (err.message || "").toLowerCase();

  if (
    code === "email_not_confirmed" ||
    message.includes("email not confirmed") ||
    message.includes("email_not_confirmed")
  ) {
    return (
      "Tu correo aún no está confirmado. Revisa la bandeja de entrada " +
      "(y spam) y abre el enlace de activación. Después vuelve a entrar."
    );
  }

  if (
    code === "invalid_credentials" ||
    message.includes("invalid login credentials") ||
    message.includes("invalid_credentials")
  ) {
    return (
      "Email o contraseña incorrectos. Si acabas de registrarte en el sitio " +
      "en línea, confirma el correo o usa «¿Olvidaste tu contraseña?»."
    );
  }

  if (code === "over_request_rate_limit" || message.includes("rate limit")) {
    return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
  }

  if (typeof err.message === "string" && err.message.trim()) {
    return err.message.trim();
  }

  return "No se pudo iniciar sesión. Intenta de nuevo.";
}
