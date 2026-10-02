import { normalizeAppPathname } from "../appRouting";
import { isDuelo2v2PublicPath } from "../../components/duelo-2v2/Duelo2v2Router";
import { isJugadoresPublicPath } from "../../components/jugadores/JugadoresRouter";
import { isLigaPublicPath } from "../../components/liga/LigaRouter";
import { isTorneoExpressPublicPath } from "../../components/torneo-express/TorneoExpressRouter";
import { isRetaAbiertaPublicPath } from "../retaAbierta/retaAbiertaService";

/**
 * Vistas de consulta y compartir. No son el sistema (dashboard, panel, liga
 * en gestión). `/liga/*` del organizador no entra aquí: la liga pública es
 * `/public/liga/*`.
 */
export function isPublicWebPath(pathname: string): boolean {
  const path = normalizeAppPathname(pathname);
  if (path === "/public" || path.includes("/public/")) return true;
  if (isJugadoresPublicPath(path)) return true;
  if (isTorneoExpressPublicPath(path)) return true;
  if (isLigaPublicPath(path)) return true;
  if (isDuelo2v2PublicPath(path)) return true;
  if (isRetaAbiertaPublicPath(path)) return true;
  if (path === "/privacidad-terminos") return true;
  if (path === "/auth/callback" || path === "/auth/reset-password") return true;
  if (path === "/admin-login") return true;
  return false;
}

/**
 * Condición exacta (además, el enlace solo se inserta cuando authReady):
 *   canOfferPwaInstall =
 *     !isPublicWebPath(pathname)
 *     && (hasUserSession || isAdminLoggedIn)
 *
 * Sesión en /public/liga, /ranking o /eventos no alcanza.
 */
export function canOfferPwaInstall(input: {
  pathname: string;
  hasUserSession: boolean;
  isAdminLoggedIn: boolean;
}): boolean {
  if (isPublicWebPath(input.pathname)) return false;
  return input.hasUserSession || input.isAdminLoggedIn;
}
