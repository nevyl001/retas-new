import type { BrandAttributionStyle } from "./motherBrand";

/** Clave técnica de identidad — coincide con `data-brand` en `<html>`. */
export type ClubBrandingKey = "riviera" | string;

export interface ClubLogos {
  light: string | null;
  dark: string | null;
  favicon: string | null;
  square: string | null;
}

/**
 * Assets visuales del club — soportados desde el día 1 aunque no se usen aún.
 * El panel futuro los poblará por organizador.
 */
export interface ClubImages {
  hero: string | null;
  heroBackground: string | null;
  welcomeVideo: string | null;
  loginBackground: string | null;
  dashboardBackground: string | null;
  socialShareImage: string | null;
  emailBanner: string | null;
  loadingAnimation: string | null;
  emptyStateImage: string | null;
  eventBackground: string | null;
  /** Ilustraciones nombradas: "empty-players", "empty-tournaments", etc. */
  illustrations: Partial<Record<string, string | null>>;
}

export interface ClubColors {
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

export interface ClubFonts {
  heading: string;
  body: string;
  headingWeight: number;
  headingLetterSpacing: string;
}

export interface ClubSlogans {
  primary: string;
  secondary: string | null;
}

export type ClubToneVoice =
  | "professional"
  | "energetic"
  | "friendly"
  | "competitive";

export interface ClubTone {
  voice: ClubToneVoice;
  attribution: BrandAttributionStyle;
}

export interface ClubMotion {
  reduceMotion: boolean;
  transitionPreset: "subtle" | "expressive" | "none";
}

export interface ClubIcons {
  pack: string | null;
  accentGlyph: string | null;
}

export interface ClubHomeExperience {
  welcomeTitle: string;
  welcomeSubtitle: string;
  eyebrow: string | null;
  backgroundImage: string | null;
  emptyStateTitle: string | null;
  emptyStateText: string | null;
}

export interface ClubDashboardExperience {
  greeting: string | null;
  backgroundImage: string | null;
}

export interface ClubLandingExperience {
  title: string | null;
  subtitle: string | null;
  proofLine: string | null;
  backgroundImage: string | null;
}

export interface ClubPublicPagesExperience {
  shareTitleTemplate: string | null;
  ogImage: string | null;
}

export interface ClubAdminExperience {
  panelTitle: string | null;
}

export interface ClubSocialExperience {
  handle: string | null;
  shareImage: string | null;
}

export interface ClubEmailsExperience {
  bannerImage: string | null;
  footerLine: string | null;
}

export interface ClubNotificationsExperience {
  icon: string | null;
}

export interface ClubBadgesExperience {
  liveLabel: string | null;
  partnerBadge: string | null;
}

/**
 * Manifiesto completo de identidad y experiencia del club.
 * No es solo CSS: describe personalidad, assets, mensajes y superficies.
 */
export interface BrandManifest {
  id: string;
  brandingKey: ClubBrandingKey;
  active: boolean;
  displayName: string;
  motherBrand: string;
  slogans: ClubSlogans;
  logos: ClubLogos;
  colors: ClubColors;
  fonts: ClubFonts;
  images: ClubImages;
  tone: ClubTone;
  motion: ClubMotion;
  icons: ClubIcons;
  home: ClubHomeExperience;
  dashboard: ClubDashboardExperience;
  landing: ClubLandingExperience;
  publicPages: ClubPublicPagesExperience;
  admin: ClubAdminExperience;
  social: ClubSocialExperience;
  emails: ClubEmailsExperience;
  notifications: ClubNotificationsExperience;
  badges: ClubBadgesExperience;
}

export type BrandManifestInput = Partial<
  Omit<
    BrandManifest,
    | "id"
    | "brandingKey"
    | "logos"
    | "images"
    | "colors"
    | "fonts"
    | "slogans"
    | "home"
    | "dashboard"
    | "landing"
    | "publicPages"
    | "admin"
    | "social"
    | "emails"
    | "notifications"
    | "badges"
    | "tone"
    | "motion"
    | "icons"
  >
> &
  Pick<BrandManifest, "brandingKey"> & {
    id?: string;
    logos?: Partial<ClubLogos>;
    images?: Partial<ClubImages> & {
      illustrations?: Partial<Record<string, string | null>>;
    };
    colors?: ClubColors;
    fonts?: ClubFonts;
    slogans?: Partial<ClubSlogans>;
    home?: Partial<ClubHomeExperience>;
    dashboard?: Partial<ClubDashboardExperience>;
    landing?: Partial<ClubLandingExperience>;
    publicPages?: Partial<ClubPublicPagesExperience>;
    admin?: Partial<ClubAdminExperience>;
    social?: Partial<ClubSocialExperience>;
    emails?: Partial<ClubEmailsExperience>;
    notifications?: Partial<ClubNotificationsExperience>;
    badges?: Partial<ClubBadgesExperience>;
    tone?: Partial<ClubTone>;
    motion?: Partial<ClubMotion>;
    icons?: Partial<ClubIcons>;
  };

/** Binding organizador ↔ manifiesto — forma lista para el panel Riviera Open. */
export interface ClubOrganizerBinding {
  organizadorId: string;
  brandingKey: ClubBrandingKey;
  active: boolean;
  /** Upgrade premium: sin esto el organizador sigue en Riviera Open. */
  premiumBrandingEnabled: boolean;
  overrides?: BrandManifestOverrides;
}

export type BrandManifestOverrides = Partial<
  Omit<
    BrandManifest,
    | "id"
    | "brandingKey"
    | "logos"
    | "images"
    | "colors"
    | "fonts"
    | "slogans"
    | "home"
    | "dashboard"
    | "landing"
    | "publicPages"
    | "admin"
    | "social"
    | "emails"
    | "notifications"
    | "badges"
    | "tone"
    | "motion"
    | "icons"
  >
> & {
  logos?: Partial<ClubLogos>;
  images?: Partial<ClubImages> & {
    illustrations?: Partial<Record<string, string | null>>;
  };
  colors?: Partial<ClubColors>;
  fonts?: Partial<ClubFonts>;
  slogans?: Partial<ClubSlogans>;
  home?: Partial<ClubHomeExperience>;
  dashboard?: Partial<ClubDashboardExperience>;
  landing?: Partial<ClubLandingExperience>;
  publicPages?: Partial<ClubPublicPagesExperience>;
  admin?: Partial<ClubAdminExperience>;
  social?: Partial<ClubSocialExperience>;
  emails?: Partial<ClubEmailsExperience>;
  notifications?: Partial<ClubNotificationsExperience>;
  badges?: Partial<ClubBadgesExperience>;
  tone?: Partial<ClubTone>;
  motion?: Partial<ClubMotion>;
  icons?: Partial<ClubIcons>;
};

/** @deprecated Usar BrandManifest */
export type BrandConfig = BrandManifest;

/** @deprecated Usar ClubBrandingKey */
export type BrandKey = ClubBrandingKey;

/** @deprecated Usar BrandManifestInput */
export type BrandConfigInput = BrandManifestInput;

/** @deprecated Usar ClubOrganizerBinding */
export type BrandOrganizerBinding = ClubOrganizerBinding;
