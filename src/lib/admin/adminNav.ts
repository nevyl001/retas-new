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

export function navigateAdminDashboard(): void {
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
