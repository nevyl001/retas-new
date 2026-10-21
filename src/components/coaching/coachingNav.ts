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

export function isStudentCoachingPath(pathname: string): boolean {
  const path = normalizeAppPathname(pathname);
  return (
    path === "/coaching/mi-coaching" ||
    path.startsWith("/coaching/mi-coaching/") ||
    path === "/coaching/alumno" ||
    path.startsWith("/coaching/alumno/")
  );
}

export function navigateStudentCoaching(): void {
  navigateCoaching("/coaching/mi-coaching");
}

export function isStudentAccessPath(pathname: string): boolean {
  const path = normalizeAppPathname(pathname);
  return (
    path === "/coaching/acceso-alumno" ||
    path.startsWith("/coaching/acceso-alumno/")
  );
}

export function navigateStudentAccess(token?: string): void {
  const target = token
    ? `/coaching/acceso-alumno?token=${encodeURIComponent(token)}`
    : "/coaching/acceso-alumno";
  navigateCoaching(target);
}


