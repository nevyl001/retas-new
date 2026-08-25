import { createBrandManifest } from "../manifestFactory";
import { RIVIERA_MOTHER_BRAND_NAME } from "../motherBrand";
import type { BrandManifest } from "../types";

/** Manifiesto Padelito Warehouse — tenant premium (upgrade branding). */
export const PADELITO_WAREHOUSE_MANIFEST: BrandManifest = createBrandManifest({
  id: "padelito-warehouse",
  brandingKey: "padelito-warehouse",
  active: true,
  displayName: "Padelito Warehouse",
  motherBrand: RIVIERA_MOTHER_BRAND_NAME,
  slogans: {
    primary: "Organiza. Juega. Compite.",
    secondary: "Tu club, tu ranking, tu experiencia con Riviera Open.",
  },
  logos: {
    light: "/brands/padelito-warehouse/logo-light.png",
    dark: "/brands/padelito-warehouse/logo-dark.png",
    favicon: "/brands/padelito-warehouse/favicon.png",
    square: "/brands/padelito-warehouse/icon.png",
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
    primary: "#2a4ba7",
    secondary: "#1e3578",
    accent: "#d6ef3a",
    surface: "#000000",
    surfaceAlt: "#0d1118",
    border: "#2a4ba7",
    text: "#ffffff",
    muted: "#a8b8d8",
    success: "#d6ef3a",
    warning: "#fbbf24",
    danger: "#f87171",
  },
  fonts: {
    heading:
      '"Abadi MT Condensed Extra Bold", "Abadi MT Condensed", "Arial Narrow", var(--ro-font-heading, system-ui, sans-serif)',
    body: '"Abadi MT Condensed", "Arial Narrow", var(--ro-font-body, system-ui, sans-serif)',
    headingWeight: 700,
    headingLetterSpacing: "0.02em",
  },
  tone: {
    voice: "energetic",
    attribution: "by",
  },
  icons: {
    pack: "padelito-warehouse",
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
    partnerBadge: "Padelito Warehouse",
  },
});
