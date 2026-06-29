import { createBrandManifest } from "../manifestFactory";
import { RIVIERA_MOTHER_BRAND_NAME } from "../motherBrand";
import type { BrandManifest } from "../types";

/** Manifiesto Hack Padel — primer club con experiencia personalizada. */
export const HACK_PADEL_MANIFEST: BrandManifest = createBrandManifest({
  id: "hack-padel",
  brandingKey: "hack-padel",
  active: true,
  displayName: "Hack Padel",
  motherBrand: RIVIERA_MOTHER_BRAND_NAME,
  slogans: {
    primary: "Organiza. Juega. Compite.",
    secondary: "Tu club, tu juego.",
  },
  logos: {
    light: "/brands/hack-padel/logo-light.png",
    dark: "/brands/hack-padel/logo-transparent.png",
    favicon: "/brands/hack-padel/favicon.png",
    square: "/brands/hack-padel/icon.png",
  },
  images: {
    hero: "/brands/hack-padel/hero.jpg",
    heroBackground: "/brands/hack-padel/hero-bg.jpg",
    welcomeVideo: null,
    loginBackground: "/brands/hack-padel/login-bg.jpg",
    dashboardBackground: null,
    socialShareImage: "/brands/hack-padel/social-share.jpg",
    emailBanner: "/brands/hack-padel/email-banner.jpg",
    loadingAnimation: null,
    emptyStateImage: "/brands/hack-padel/empty-state.png",
    eventBackground: null,
    illustrations: {
      "empty-players": null,
      "empty-tournaments": null,
    },
  },
  colors: {
    primary: "#000000",
    secondary: "#4C4C4C",
    accent: "#BFFF00",
    surface: "#000000",
    surfaceAlt: "#0f0f0f",
    border: "#4C4C4C",
    text: "#FFFFFF",
    muted: "#4C4C4C",
    success: "#BFFF00",
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
    pack: "hack-padel",
    accentGlyph: null,
  },
  home: {
    welcomeTitle: "¿Qué quieres jugar hoy?",
    welcomeSubtitle:
      "Ligas, torneos, americanos y duelos: elige cómo quieres jugar.",
    eyebrow: null,
    backgroundImage: "/brands/hack-padel/hero-bg.jpg",
    emptyStateTitle: null,
    emptyStateText: "Elige un modo arriba para empezar a jugar.",
  },
  landing: {
    subtitle: "Tu club, tu ranking, tu experiencia con Riviera Open.",
    proofLine: "Usado por +200 jugadores activos",
    backgroundImage: "/brands/hack-padel/login-bg.jpg",
  },
  badges: {
    liveLabel: "EN VIVO",
    partnerBadge: "Hack Padel",
  },
});

/** @deprecated Usar HACK_PADEL_MANIFEST */
export const HACK_PADEL_BRAND = HACK_PADEL_MANIFEST;
