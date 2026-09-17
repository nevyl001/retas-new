import { createBrandManifest } from "../manifestFactory";
import { RIVIERA_MOTHER_BRAND_NAME } from "../motherBrand";
import type { BrandManifest } from "../types";

/**
 * Manifiesto Acapulco Padel Tour — tenant premium (upgrade branding).
 * Guía oficial: navy #002B6B · turquesa #00AFC4 · lima #A7D800 · Montserrat.
 */
export const ACAPULCO_PADEL_TOUR_MANIFEST: BrandManifest = createBrandManifest({
  id: "acapulco-padel-tour",
  brandingKey: "acapulco-padel-tour",
  active: true,
  displayName: "Acapulco Padel Tour",
  motherBrand: RIVIERA_MOTHER_BRAND_NAME,
  slogans: {
    primary: "Organiza. Juega. Compite.",
    secondary: "Tu club, tu ranking, tu experiencia con Riviera Open.",
  },
  logos: {
    light: "/brands/acapulco-padel-tour/logo-light.png",
    dark: "/brands/acapulco-padel-tour/logo-dark.png",
    favicon: "/brands/acapulco-padel-tour/favicon.png",
    square: "/brands/acapulco-padel-tour/icon.png",
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
    primary: "#002B6B",
    secondary: "#00AFC4",
    accent: "#A7D800",
    surface: "#001F4D",
    surfaceAlt: "#002B6B",
    border: "#00AFC4",
    text: "#FFFFFF",
    muted: "#7BA3C9",
    success: "#A7D800",
    warning: "#fbbf24",
    danger: "#f87171",
  },
  fonts: {
    heading:
      'Montserrat, var(--ro-font-heading, "Stack Sans Headline", system-ui, sans-serif)',
    body: 'Montserrat, var(--ro-font-body, "Inter", system-ui, sans-serif)',
    headingWeight: 700,
    headingLetterSpacing: "0.04em",
  },
  tone: {
    voice: "energetic",
    attribution: "by",
  },
  icons: {
    pack: "acapulco-padel-tour",
    accentGlyph: null,
  },
  home: {
    welcomeTitle: "¿Qué quieres organizar hoy?",
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
    partnerBadge: "Acapulco Padel Tour",
  },
});
