import {
  normalizeAppPathname,
  navigateAppTo,
  navigateToAppHome,
  parseRetaIdFromPath,
  type AppView,
} from "./appRouting";
import { isJugadoresPublicPath } from "../components/jugadores/JugadoresRouter";
import { isLigaPublicPath } from "../components/liga/LigaRouter";
import { isTorneoExpressPublicPath } from "../components/torneo-express/TorneoExpressRouter";
import { isDuelo2v2PublicPath } from "../components/duelo-2v2/Duelo2v2Router";
import { navigateJugadores } from "../components/jugadores/jugadoresNav";
import { buildInternalClubRankingUrl } from "../components/jugadores/jugadoresPublicNav";

export type MobileNavTabId = "inicio" | "eventos" | "jugadores" | "ranking" | "mas";

export const MIS_EVENTOS_QUERY = "mis-eventos";

const ADMIN_VIEWS: AppView[] = [
  "admin-login",
  "admin-dashboard",
  "admin-user",
  "admin-dev-player-debug",
];

const HIDDEN_VIEWS: AppView[] = [
  "auth-callback",
  "auth-reset-password",
  "winner",
  "legal",
  ...ADMIN_VIEWS,
];

export function buildMisEventosPath(): string {
  return `/?${MIS_EVENTOS_QUERY}=1`;
}

export function navigateToMisEventos(): void {
  navigateAppTo(buildMisEventosPath());
}

export function isMisEventosSearch(search: string): boolean {
  return new URLSearchParams(search).get(MIS_EVENTOS_QUERY) === "1";
}

export function isOrganizerInternalRankingPath(
  pathname: string,
  userOrganizadorId?: string | null
): boolean {
  if (!userOrganizadorId?.trim()) return false;
  const path = normalizeAppPathname(pathname);
  const match = path.match(/^\/ranking\/o\/([^/]+)/i);
  if (!match) return false;
  try {
    return decodeURIComponent(match[1]) === userOrganizadorId.trim();
  } catch {
    return match[1] === userOrganizadorId.trim();
  }
}

export function isPrivateGameModePath(pathname: string): boolean {
  const path = normalizeAppPathname(pathname);
  if (path === "/americano-dinamico") return true;
  if (path.startsWith("/torneo-express") && !isTorneoExpressPublicPath(path)) return true;
  if (path.startsWith("/liga") && !isLigaPublicPath(path)) return true;
  if (path.startsWith("/duelo-2v2") && !isDuelo2v2PublicPath(path)) return true;
  return false;
}

export function resolveMobileNavTab(
  pathname: string,
  search = ""
): MobileNavTabId | null {
  const path = normalizeAppPathname(pathname);

  if (path.startsWith("/jugadores")) return "jugadores";

  if (path.match(/^\/ranking\/o\//i)) {
    return "ranking";
  }

  if (parseRetaIdFromPath(path)) return "eventos";
  if (isMisEventosSearch(search)) return "eventos";
  if (isPrivateGameModePath(path)) return "eventos";

  if (path === "/") return "inicio";

  return null;
}

export function isActiveEventManagementScreen(pathname: string): boolean {
  const path = normalizeAppPathname(pathname);
  if (parseRetaIdFromPath(path)) return true;
  if (path === "/americano-dinamico") return true;
  if (/^\/torneo-express\/[^/]+/i.test(path) && !isTorneoExpressPublicPath(path)) {
    return true;
  }
  if (/^\/liga\/[^/]+/i.test(path) && !isLigaPublicPath(path)) return true;
  if (
    path.startsWith("/duelo-2v2/") &&
    path !== "/duelo-2v2" &&
    !isDuelo2v2PublicPath(path)
  ) {
    return true;
  }
  return false;
}

export function shouldShowMobileAppNavigation(input: {
  pathname: string;
  currentView: AppView;
  hasUser: boolean;
  isPublicSpectatorView: boolean;
  userOrganizadorId?: string | null;
}): boolean {
  if (!input.hasUser) return false;
  if (HIDDEN_VIEWS.includes(input.currentView)) return false;

  const path = normalizeAppPathname(input.pathname);

  if (path.includes("/public/")) return false;

  if (isActiveEventManagementScreen(path)) return false;

  if (input.isPublicSpectatorView) {
    return isOrganizerInternalRankingPath(path, input.userOrganizadorId);
  }

  if (isJugadoresPublicPath(path) && !path.startsWith("/jugadores")) {
    return isOrganizerInternalRankingPath(path, input.userOrganizadorId);
  }

  return true;
}

export function navigateMobileNavTab(
  tab: MobileNavTabId,
  userOrganizadorId?: string | null
): void {
  switch (tab) {
    case "inicio":
      navigateToAppHome();
      return;
    case "eventos":
      navigateToMisEventos();
      return;
    case "jugadores":
      navigateJugadores();
      return;
    case "ranking": {
      const orgId = userOrganizadorId?.trim();
      if (!orgId) return;
      navigateAppTo(buildInternalClubRankingUrl(orgId, "M"));
      return;
    }
    case "mas":
      return;
    default:
      return;
  }
}
