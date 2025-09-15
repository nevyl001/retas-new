// Configuración de autenticación
export const AUTH_CONFIG = {
  // URL base de la aplicación
  BASE_URL:
    process.env.NODE_ENV === "production"
      ? "https://retas-new.vercel.app"
      : "http://localhost:3000",

  // URL de redirección después de confirmar email
  EMAIL_CONFIRM_REDIRECT: "/auth/callback",

  // URL de redirección después de reset de contraseña
  PASSWORD_RESET_REDIRECT: "/auth/reset-password",

  // URLs permitidas en Supabase (deben configurarse en el dashboard)
  ALLOWED_REDIRECT_URLS: [
    "https://retas-new.vercel.app/auth/callback",
    "http://localhost:3000/auth/callback",
    "https://retas-new.vercel.app/auth/reset-password",
    "http://localhost:3000/auth/reset-password",
  ],
};

// Función para obtener la URL completa de redirección
export const getRedirectUrl = (
  path: string = AUTH_CONFIG.EMAIL_CONFIRM_REDIRECT
): string => {
  return `${AUTH_CONFIG.BASE_URL}${path}`;
};
