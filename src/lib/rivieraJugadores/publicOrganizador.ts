/** UUID del club/organizador para rankings públicos (build-time). */
export function getPublicOrganizadorIdFromEnv(): string | null {
  const id = process.env.REACT_APP_RIVIERA_PUBLIC_ORGANIZADOR_ID?.trim();
  return id || null;
}

export function getPublicOrganizadorIdFromSearch(): string | null {
  if (typeof window === "undefined") return null;
  const org = new URLSearchParams(window.location.search).get("org")?.trim();
  return org || null;
}

export function resolvePublicOrganizadorId(fallbackUserId?: string | null): string | null {
  return (
    getPublicOrganizadorIdFromSearch() ||
    getPublicOrganizadorIdFromEnv() ||
    fallbackUserId?.trim() ||
    null
  );
}
