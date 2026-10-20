import { navigateAppTo, normalizeAppPathname } from "../../lib/appRouting";

export function navigateCoaching(path = "/coaching"): void {
  navigateAppTo(normalizeAppPathname(path));
}

export function isCoachingPath(pathname: string): boolean {
  const path = normalizeAppPathname(pathname);
  return path === "/coaching" || path.startsWith("/coaching/");
}

export type CoachingTab = "dashboard" | "coaches" | "jugadores" | "agenda";

export function parseCoachingTab(pathname: string): CoachingTab {
  const path = normalizeAppPathname(pathname);
  if (path.endsWith("/coaches")) return "coaches";
  if (path.endsWith("/jugadores")) return "jugadores";
  if (path.endsWith("/agenda")) return "agenda";
  return "dashboard";
}

export function coachingTabPath(tab: CoachingTab): string {
  if (tab === "dashboard") return "/coaching";
  return `/coaching/${tab}`;
}

export function isCoachPortalPath(pathname: string): boolean {
  const path = normalizeAppPathname(pathname);
  return (
    path === "/coaching/mi-espacio" ||
    path.startsWith("/coaching/mi-espacio/") ||
    path === "/coaching/portal" ||
    path.startsWith("/coaching/portal/")
  );
}

export function navigateCoachPortal(): void {
  navigateCoaching("/coaching/mi-espacio");
}

