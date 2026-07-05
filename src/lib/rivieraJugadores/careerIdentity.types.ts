/** Respuesta de public.ensure_riviera_identity (Sprint 2.0.2). */
export interface RivieraIdentityEnsureResult {
  officialPlayerKey: string;
  rivieraId: string | null;
  rivieraIdSerial: number | null;
  rivieraJugadorId: string;
  registrationJugadorId: string;
  debutOrganizerId: string | null;
  debutAt: string | null;
  linkSource: string | null;
  identityCreated: boolean;
  linkCreated: boolean;
  rivieraIdAssigned: boolean;
  debutAssigned: boolean;
}
