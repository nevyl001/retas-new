import type { BrandAttributionStyle } from "./motherBrand";

export type BrandKey = "riviera" | string;

/** Assets soportados desde el día 1 — el panel futuro los poblará por organizador. */
export interface BrandAssets {
  logoLight: string | null;
  logoDark: string | null;
  favicon: string | null;
  heroImage: string | null;
  iconSquare: string | null;
}

export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  muted: string;
  success: string;
  warning: string;
  danger: string;
}

export interface BrandTypography {
  heading: string;
  body: string;
  headingWeight: number;
  headingLetterSpacing: string;
}

/** Mensajes personalizables por club — panel futuro. */
export interface BrandMessaging {
  slogan: string;
  welcomeTitle?: string;
  welcomeSubtitle?: string;
  homeEyebrow?: string;
  authSubtitle?: string;
  authProof?: string;
}

/**
 * Configuración completa de marca.
 * Hoy: archivos estáticos en src/branding/brands/.
 * Mañana: merge con overrides del panel (misma forma).
 */
export interface BrandConfig {
  key: BrandKey;
  active: boolean;
  displayName: string;
  motherBrandName: string;
  attributionStyle: BrandAttributionStyle;
  assets: BrandAssets;
  messaging: BrandMessaging;
  colors: BrandColors;
  typography: BrandTypography;
}

/** Payload parcial para crear o actualizar marcas (panel / seeds). */
export type BrandConfigInput = Partial<Omit<BrandConfig, "key">> &
  Pick<BrandConfig, "key">;

/** Forma que el panel futuro puede persistir y devolver por API. */
export interface BrandOrganizerBinding {
  organizadorId: string;
  brandingKey: BrandKey;
  active: boolean;
  overrides?: Partial<
    Pick<
      BrandConfig,
      "displayName" | "assets" | "messaging" | "colors" | "typography"
    >
  >;
}
