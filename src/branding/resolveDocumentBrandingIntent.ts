/**
 * Decide qué branding debe vivir en `<html>` al navegar entre
 * Home (cuenta) y vistas públicas (ranking, invitaciones).
 *
 * Incidente PCS: Ranking → Home flash Riviera porque Ranking llamaba
 * clearTenantBranding() (madre + wipe de caché) y al volver el restore
 * era async. Ranking del propio club debe conservar el document brand.
 */

export type DocumentBrandingIntent =
  | { action: "mother-preserve-cache" }
  | { action: "organizer-sync"; organizadorId: string }
  | { action: "noop" };

function normalizeId(id: string | null | undefined): string | null {
  const n = id?.trim().toLowerCase();
  return n || null;
}

export function resolveDocumentBrandingIntent(args: {
  pathname: string;
  userId: string | null | undefined;
  isPublicSpectatorView: boolean;
  isJugadoresPublic: boolean;
  shouldKeepMotherPath: boolean;
  pathOrganizadorId: string | null;
}): DocumentBrandingIntent {
  const userId = normalizeId(args.userId);
  const pathOrg = normalizeId(args.pathOrganizadorId);

  // Invitaciones / públicas de evento: html madre; scope pinta anfitrión.
  // Ranking/ficha del club NO entra aquí si isJugadoresPublic se trata aparte.
  if (args.shouldKeepMotherPath) {
    return { action: "mother-preserve-cache" };
  }

  if (args.isJugadoresPublic) {
    // Ranking/ficha del propio organizador: conservar PCS en <html>.
    // Evita flash Riviera al volver a Inicio.
    if (userId && pathOrg && userId === pathOrg) {
      return { action: "organizer-sync", organizadorId: userId };
    }
    // Visitante en ranking ajeno, o ranking sin org en path: madre suave.
    return { action: "mother-preserve-cache" };
  }

  if (args.isPublicSpectatorView) {
    return { action: "mother-preserve-cache" };
  }

  if (userId) {
    return { action: "organizer-sync", organizadorId: userId };
  }

  return { action: "noop" };
}
