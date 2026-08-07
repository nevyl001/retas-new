import { createBrandManifest } from "../manifestFactory";
import { RIVIERA_MOTHER_BRAND_NAME } from "../motherBrand";
import type { BrandManifest } from "../types";

/**
 * Manifiesto Padel Court Series — tenant premium (upgrade branding).
 * Assets de logo: null hasta colocar PNG oficiales en public/brands/padel-court-series/.
 */
export const PADEL_COURT_SERIES_MANIFEST: BrandManifest = createBrandManifest({
  id: "padel-court-series",
  brandingKey: "padel-court-series",
  active: true,
  displayName: "Padel Court Series",
  motherBrand: RIVIERA_MOTHER_BRAND_NAME,
  slogans: {
    primary: "Juega. Compite. Trasciende.",
    secondary: "Padel Court Series",
  },
  logos: {
    light: "/brands/padel-court-series/logo-light.png",
    dark: "/brands/padel-court-series/logo-dark.png",
    favicon: "/brands/padel-court-series/favicon.png",
    square: "/brands/padel-court-series/icon.png",
  },
  images: {
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
    illustrations: {
      "empty-players": null,
      "empty-tournaments": null,
    },
  },
  colors: {
    primary: "#192E2C",
    secondary: "#242424",
    accent: "#FC9908",
    surface: "#192E2C",
    surfaceAlt: "#242424",
    border: "#CED1C6",
    text: "#EFEFEF",
    muted: "#CED1C6",
    /** Semántico accesible — no confundir success con CTA naranja. */
    success: "#2F7D53",
    warning: "#B5883F",
    danger: "#C0392B",
  },
  fonts: {
    heading:
      "'Squada One', var(--ro-font-heading, system-ui, sans-serif)",
    body: '"Open Sans Semi Condensed", "Open Sans", var(--ro-font-body, system-ui, sans-serif)',
    headingWeight: 400,
    headingLetterSpacing: "0em",
  },
  tone: {
    voice: "professional",
    attribution: "by",
  },
  icons: {
    pack: "padel-court-series",
    accentGlyph: null,
  },
  home: {
    welcomeTitle: "¿Qué quieres jugar hoy?",
    welcomeSubtitle:
      "Ligas, torneos, americanos y duelos: elige cómo quieres jugar.",
    eyebrow: null,
    backgroundImage: null,
    emptyStateTitle: null,
    emptyStateText: "Elige un modo arriba para empezar a jugar.",
  },
  landing: {
    subtitle: "Tu club, tu ranking, tu experiencia con Riviera Open.",
    proofLine: null,
    backgroundImage: null,
  },
  badges: {
    liveLabel: "EN VIVO",
    partnerBadge: "PCS",
  },
});
