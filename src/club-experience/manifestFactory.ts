import {
  RIVIERA_ATTRIBUTION_STYLE,
  RIVIERA_DEFAULT_SLOGAN,
  RIVIERA_MOTHER_BRAND_NAME,
  RIVIERA_PRODUCT_NAME,
} from "./motherBrand";
import type {
  BrandManifest,
  BrandManifestInput,
  BrandManifestOverrides,
  ClubFonts,
  ClubHomeExperience,
  ClubImages,
  ClubLandingExperience,
  ClubLogos,
} from "./types";

const EMPTY_LOGOS: ClubLogos = {
  light: null,
  dark: null,
  favicon: null,
  square: null,
};

const EMPTY_IMAGES: ClubImages = {
  hero: null,
  heroBackground: null,
  welcomeVideo: null,
  loginBackground: null,
  dashboardBackground: null,
  socialShareImage: null,
  emailBanner: null,
  loadingAnimation: null,
  emptyStateImage: null,
  eventBackground: null,
  illustrations: {},
};

const DEFAULT_HOME: ClubHomeExperience = {
  welcomeTitle: "¿Qué quieres jugar hoy?",
  welcomeSubtitle:
    "Elige un modo y lanza tu reta en menos de un minuto.",
  eyebrow: null,
  backgroundImage: null,
  emptyStateTitle: null,
  emptyStateText: null,
};

const DEFAULT_LANDING: ClubLandingExperience = {
  title: null,
  subtitle:
    "Crea retas, gestiona torneos y sigue el ranking de tu grupo.",
  proofLine: "Usado por +200 jugadores activos",
  backgroundImage: null,
};

function mergeLogos(base: ClubLogos, patch?: Partial<ClubLogos>): ClubLogos {
  if (!patch) return base;
  return { ...base, ...patch };
}

function mergeImages(
  base: ClubImages,
  patch?: Partial<ClubImages> & {
    illustrations?: Partial<Record<string, string | null>>;
  }
): ClubImages {
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    illustrations: {
      ...base.illustrations,
      ...patch.illustrations,
    },
  };
}

/** Normaliza seeds estáticos o payload del panel a manifiesto completo. */
export function createBrandManifest(input: BrandManifestInput): BrandManifest {
  const brandingKey = input.brandingKey;
  const logos = mergeLogos(EMPTY_LOGOS, input.logos);
  const images = mergeImages(EMPTY_IMAGES, input.images);

  return {
    id: input.id ?? brandingKey,
    brandingKey,
    active: input.active ?? true,
    displayName: input.displayName ?? RIVIERA_PRODUCT_NAME,
    motherBrand: input.motherBrand ?? RIVIERA_MOTHER_BRAND_NAME,
    slogans: {
      primary: input.slogans?.primary ?? RIVIERA_DEFAULT_SLOGAN,
      secondary: input.slogans?.secondary ?? null,
    },
    logos,
    colors: input.colors!,
    fonts: input.fonts!,
    images,
    tone: {
      voice: input.tone?.voice ?? "professional",
      attribution: input.tone?.attribution ?? RIVIERA_ATTRIBUTION_STYLE,
    },
    motion: {
      reduceMotion: input.motion?.reduceMotion ?? false,
      transitionPreset: input.motion?.transitionPreset ?? "subtle",
    },
    icons: {
      pack: input.icons?.pack ?? null,
      accentGlyph: input.icons?.accentGlyph ?? null,
    },
    home: { ...DEFAULT_HOME, ...input.home },
    dashboard: {
      greeting: input.dashboard?.greeting ?? null,
      backgroundImage: input.dashboard?.backgroundImage ?? null,
    },
    landing: { ...DEFAULT_LANDING, ...input.landing },
    publicPages: {
      shareTitleTemplate: input.publicPages?.shareTitleTemplate ?? null,
      ogImage: input.publicPages?.ogImage ?? null,
    },
    admin: {
      panelTitle: input.admin?.panelTitle ?? null,
    },
    social: {
      handle: input.social?.handle ?? null,
      shareImage: input.social?.shareImage ?? null,
    },
    emails: {
      bannerImage: input.emails?.bannerImage ?? images.emailBanner,
      footerLine: input.emails?.footerLine ?? null,
    },
    notifications: {
      icon: input.notifications?.icon ?? null,
    },
    badges: {
      liveLabel: input.badges?.liveLabel ?? null,
      partnerBadge: input.badges?.partnerBadge ?? null,
    },
  };
}

/** Merge overrides del panel sobre el manifiesto base de un club. */
export function mergeBrandManifest(
  base: BrandManifest,
  overrides?: BrandManifestOverrides
): BrandManifest {
  if (!overrides) return base;

  return createBrandManifest({
    ...base,
    ...overrides,
    brandingKey: base.brandingKey,
    id: base.id,
    logos: mergeLogos(base.logos, overrides.logos),
    images: mergeImages(base.images, overrides.images),
    slogans: { ...base.slogans, ...overrides.slogans },
    colors: overrides.colors ? { ...base.colors, ...overrides.colors } : base.colors,
    fonts: overrides.fonts
      ? ({ ...base.fonts, ...overrides.fonts } as ClubFonts)
      : base.fonts,
    home: { ...base.home, ...overrides.home },
    dashboard: { ...base.dashboard, ...overrides.dashboard },
    landing: { ...base.landing, ...overrides.landing },
    publicPages: { ...base.publicPages, ...overrides.publicPages },
    admin: { ...base.admin, ...overrides.admin },
    social: { ...base.social, ...overrides.social },
    emails: { ...base.emails, ...overrides.emails },
    notifications: { ...base.notifications, ...overrides.notifications },
    badges: { ...base.badges, ...overrides.badges },
    tone: { ...base.tone, ...overrides.tone },
    motion: { ...base.motion, ...overrides.motion },
    icons: { ...base.icons, ...overrides.icons },
  });
}

/** @deprecated Usar createBrandManifest */
export const createBrandConfig = createBrandManifest;

/** @deprecated Usar mergeBrandManifest */
export const mergeBrandConfig = mergeBrandManifest;
