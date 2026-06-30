import type { BrandManifest } from "../club-experience/types";

/** Branding resuelto para un organizador — única forma de consumir apariencia en UI. */
export interface TenantBranding {
  organizadorId: string | null;
  brandingKey: string;
  nombre: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  background: string;
  surface: string;
  border: string;
  fontFamily: string;
  manifest: BrandManifest;
  isClubBranded: boolean;
}
