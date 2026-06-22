// Configuración de autenticación
const PRODUCTION_APP_URL =
  process.env.REACT_APP_PUBLIC_URL?.replace(/\/$/, "") ||
  "https://appriviera.rivieraopen.com";

export const AUTH_CONFIG = {
  BASE_URL:
    process.env.NODE_ENV === "production"
      ? PRODUCTION_APP_URL
      : "http://localhost:3000",

  BASE_URL_PRODUCTION: PRODUCTION_APP_URL,

  EMAIL_CONFIRM_REDIRECT: "/auth/callback",
  PASSWORD_RESET_REDIRECT: "/auth/reset-password",

  ALLOWED_REDIRECT_URLS: [
    `${PRODUCTION_APP_URL}/auth/callback`,
    "http://localhost:3000/auth/callback",
    `${PRODUCTION_APP_URL}/auth/reset-password`,
    "http://localhost:3000/auth/reset-password",
    // Legacy Vercel URL (enlaces viejos en emails)
    "https://retas-new.vercel.app/auth/callback",
    "https://retas-new.vercel.app/auth/reset-password",
  ],
};

// Función para obtener la URL completa de redirección
export const getRedirectUrl = (
  path: string = AUTH_CONFIG.EMAIL_CONFIRM_REDIRECT
): string => {
  const baseUrl = AUTH_CONFIG.BASE_URL;
  return `${baseUrl}${path}`;
};

/** Redirect en emails de auth (confirmación / reset): prod en build, localhost en dev. */
export const getAuthEmailRedirectUrl = (
  path: string = AUTH_CONFIG.EMAIL_CONFIRM_REDIRECT
): string => {
  const baseUrl =
    process.env.NODE_ENV === "production"
      ? AUTH_CONFIG.BASE_URL_PRODUCTION
      : AUTH_CONFIG.BASE_URL;
  return `${baseUrl}${path}`;
};
