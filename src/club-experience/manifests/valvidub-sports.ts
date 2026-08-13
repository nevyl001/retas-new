import { createBrandManifest } from "../manifestFactory";
import { RIVIERA_MOTHER_BRAND_NAME } from "../motherBrand";
import type { BrandManifest } from "../types";

/** Manifiesto Valvidub Sports — tenant premium (upgrade branding). */
export const VALVIDUB_SPORTS_MANIFEST: BrandManifest = createBrandManifest({
  id: "valvidub-sports",
  brandingKey: "valvidub-sports",
  active: true,
  displayName: "Valvidub Sports",
  motherBrand: RIVIERA_MOTHER_BRAND_NAME,
  slogans: {
    primary: "Organiza. Juega. Compite.",
    secondary: "Valvidub Sports Pádel",
  },
  logos: {
    light: "/brands/valvidub-sports/logo-light.png",
    dark: "/brands/valvidub-sports/logo-dark.png",
    favicon: "/brands/valvidub-sports/favicon.png",
    square: "/brands/valvidub-sports/icon.png",
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
    primary: "#F4EDE4",
    secondary: "#C4A892",
    accent: "#A66042",
    surface: "#F4EDE4",
    surfaceAlt: "#FFFBF7",
    border: "#D9C8B8",
    text: "#2A1C16",
    muted: "#8A7063",
    success: "#2F7D53",
    warning: "#B5883F",
    danger: "#C0392B",
  },
  fonts: {
    heading:
      'Montserrat, var(--ro-font-heading, "Stack Sans Headline", system-ui, sans-serif)',
    body: 'Montserrat, var(--ro-font-body, "Inter", system-ui, sans-serif)',
    headingWeight: 700,
    headingLetterSpacing: "0.02em",
  },
  tone: {
    voice: "competitive",
    attribution: "by",
  },
  icons: {
    pack: "valvidub-sports",
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
    partnerBadge: "Valvidub",
  },
});
