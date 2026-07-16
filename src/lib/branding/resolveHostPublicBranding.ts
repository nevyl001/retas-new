/**
 * Regla canónica de branding público:
 *
 * recurso/evento público
 *   → organizador anfitrión real (NUNCA el visitante autenticado)
 *   → get_organizador_branding_public
 *   → premium_branding_enabled
 *   → branding del club | fallback Riviera
 *
 * ClubExperienceScope + pendingUntilOrganizador evitan flash Riviera→club.
 * DTO público: solo organizador_id, premium_branding_enabled, branding_key.
 */

export type PublicHostOrgSource =
  | "tournaments.user_id"
  | "duelos_2v2.organizador_id"
  | "ligas.organizador_id"
  | "torneos_express.organizador_id"
  | "eventos.organizador_id"
  | "convocatoria.organizador_id"
  | "ranking.path_org"
  | "jugador.organizador_id"
  | "none_mother";

export type PublicBrandingSurfaceStatus =
  | "wired_scope"
  | "wired_scope_celebrate_gap"
  | "mother_only"
  | "og_convocatoria_only"
  | "og_missing"
  | "n_a";

export type PublicBrandingMatrixRow = {
  modeRuta: string;
  brandingInPage: PublicBrandingSurfaceStatus;
  brandingOg: PublicBrandingSurfaceStatus;
  hostOrgSource: PublicHostOrgSource;
  notes: string;
};

/**
 * Matriz de cobertura (diagnóstico + contrato de producto).
 * Actualizar cuando se cablee una superficie nueva.
 */
export const PUBLIC_BRANDING_MATRIX: readonly PublicBrandingMatrixRow[] = [
  {
    modeRuta: "/jugar/:slug (reta|americano|duelo convocatoria)",
    brandingInPage: "wired_scope",
    brandingOg: "wired_scope",
    hostOrgSource: "convocatoria.organizador_id",
    notes: "Copiar usa ?slug=; scope + pending OK",
  },
  {
    modeRuta: "/public/:tournamentId (RR resultados)",
    brandingInPage: "wired_scope",
    brandingOg: "wired_scope",
    hostOrgSource: "tournaments.user_id",
    notes: "Copiar App → ?dest=/public/:id; celebrate usa club si premium",
  },
  {
    modeRuta: "/public/americano/:id + vista-publica",
    brandingInPage: "wired_scope",
    brandingOg: "wired_scope",
    hostOrgSource: "tournaments.user_id",
    notes: "Convocatoria ?slug=; PublicShareSection → ?dest=",
  },
  {
    modeRuta: "/public/duelo-2v2/:id",
    brandingInPage: "wired_scope",
    brandingOg: "wired_scope",
    hostOrgSource: "duelos_2v2.organizador_id",
    notes: "Convocatoria + PublicShareSection dest",
  },
  {
    modeRuta: "/public/liga/:id[/jornada/:n]",
    brandingInPage: "wired_scope",
    brandingOg: "wired_scope",
    hostOrgSource: "ligas.organizador_id",
    notes: "PublicShareSection → ?dest=",
  },
  {
    modeRuta: "/torneo-express/:id/* + /eventos/:slug",
    brandingInPage: "wired_scope",
    brandingOg: "wired_scope",
    hostOrgSource: "torneos_express.organizador_id",
    notes: "Copiar enlace público → ?dest=; Edge resuelve TE/eventos",
  },
  {
    modeRuta: "/ranking/o/:org + ficha pública",
    brandingInPage: "wired_scope",
    brandingOg: "og_missing",
    hostOrgSource: "ranking.path_org",
    notes: "In-page OK; OG ranking/ficha pendiente (bajo ROI)",
  },
  {
    modeRuta: "/ranking (bare) / legal / como-funciona",
    brandingInPage: "mother_only",
    brandingOg: "n_a",
    hostOrgSource: "none_mother",
    notes: "Marca madre intencional",
  },
] as const;

/** Normaliza id de anfitrión; nunca mezclar con auth.uid del visitante. */
export function normalizeHostOrganizadorId(
  organizadorId: string | null | undefined
): string | null {
  const n = organizadorId?.trim().toLowerCase();
  return n || null;
}

/**
 * Elige el org del evento, no el del viewer.
 * `viewerAuthUid` solo se acepta para tests de divergencia — no se usa.
 */
export function resolveHostOrganizadorId(input: {
  hostOrganizadorId: string | null | undefined;
  viewerAuthUid?: string | null;
}): string | null {
  void input.viewerAuthUid;
  return normalizeHostOrganizadorId(input.hostOrganizadorId);
}
