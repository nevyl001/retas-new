/**
 * Rutas donde `<html>` debe quedarse en marca madre Riviera.
 * El branding del anfitrión (club premium) se aplica solo en ClubExperienceScope.
 * Evita que la sesión del visitante (p. ej. Hack) pinte verde lime en invitaciones ajenas.
 */
export function shouldKeepDocumentMotherBrand(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";

  if (
    path === "/auth/callback" ||
    path === "/auth/reset-password" ||
    path === "/admin-login" ||
    path === "/privacidad-terminos"
  ) {
    return true;
  }

  if (/^\/jugar\/[^/]+/i.test(path)) return true;
  if (/^\/reta-abierta\/[^/]+/i.test(path)) return true;
  if (/^\/public\//i.test(path)) return true;
  if (/^\/eventos\/[^/]+/i.test(path)) return true;

  if (
    path.startsWith("/torneo-express/") &&
    /\/(grupo\/[^/]+|general|grupos|eliminatoria)\/?$/i.test(path)
  ) {
    return true;
  }

  return false;
}
