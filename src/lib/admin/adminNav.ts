import { navigateAppTo, normalizeAppPathname } from "../appRouting";

export function buildAdminUserPath(userId: string): string {
  return `/admin-dashboard/usuario/${encodeURIComponent(userId.trim())}`;
}

export function parseAdminUserIdFromPath(pathname?: string): string | null {
  const path =
    pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "");
  const m = normalizeAppPathname(path).match(
    /^\/admin-dashboard\/usuario\/([^/]+)$/i
  );
  const raw = m?.[1];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).trim() || null;
  } catch {
    return raw.trim() || null;
  }
}

export type AdminControlSection =
  | "resumen"
  | "cuentas"
  | "competencias"
  | "actividad";

const ADMIN_SECTION_STORAGE_KEY = "riviera_admin_active_section";

export function readStoredAdminSection(): AdminControlSection {
  if (typeof window === "undefined") return "resumen";
  try {
    const raw = window.sessionStorage.getItem(ADMIN_SECTION_STORAGE_KEY);
    if (
      raw === "resumen" ||
      raw === "cuentas" ||
      raw === "competencias" ||
      raw === "actividad"
    ) {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return "resumen";
}

export function writeStoredAdminSection(section: AdminControlSection): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ADMIN_SECTION_STORAGE_KEY, section);
  } catch {
    /* ignore */
  }
}

export function navigateAdminDashboard(section?: AdminControlSection): void {
  if (section) {
    writeStoredAdminSection(section);
  }
  navigateAppTo("/admin-dashboard");
}

export function navigateAdminUser(userId: string): void {
  const id = userId.trim();
  if (!id) {
    navigateAdminDashboard();
    return;
  }
  navigateAppTo(buildAdminUserPath(id));
}

export function isAdminAppPath(pathname: string): boolean {
  const path = normalizeAppPathname(pathname);
  return path === "/admin-login" || path.startsWith("/admin-dashboard");
}
