import { createBrandManifest } from "../manifestFactory";
import {
  RIVIERA_DEFAULT_SLOGAN,
  RIVIERA_MOTHER_BRAND_NAME,
  RIVIERA_PRODUCT_NAME,
} from "../motherBrand";
import type { BrandManifest } from "../types";

/** Experiencia por defecto — organizador sin identidad de club propia. */
export const RIVIERA_DEFAULT_MANIFEST: BrandManifest = createBrandManifest({
  id: "riviera",
  brandingKey: "riviera",
  active: true,
  displayName: RIVIERA_PRODUCT_NAME,
  motherBrand: RIVIERA_MOTHER_BRAND_NAME,
  slogans: { primary: RIVIERA_DEFAULT_SLOGAN, secondary: null },
  logos: {
    light: "/logo-riviera.png",
    dark: "/logo-riviera.png",
    favicon: "/favicon.ico",
    square: "/logo-riviera.png",
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
    illustrations: {},
  },
  colors: {
    primary: "#000000",
    secondary: "#4C4C4C",
    /** Misma acento que Riviera Open (`--ro-accent` en riviera-open-tokens). */
    accent: "#ffffff",
    surface: "#0f0f0f",
    surfaceAlt: "#1a1a1a",
    border: "#2a2a2a",
    text: "#ffffff",
    muted: "#71717a",
    success: "#4ade80",
    warning: "#fbbf24",
    danger: "#f87171",
  },
  fonts: {
    heading: 'var(--ro-font-heading, "Stack Sans Headline", system-ui, sans-serif)',
    body: 'var(--ro-font-body, "Inter", system-ui, sans-serif)',
    headingWeight: 700,
    headingLetterSpacing: "-0.02em",
  },
  landing: {
    subtitle:
      "Crea retas, gestiona torneos y sigue el ranking de tu grupo.",
    proofLine: "Usado por +200 jugadores activos",
  },
});

/** @deprecated Usar RIVIERA_DEFAULT_MANIFEST */
export const RIVIERA_DEFAULT_BRAND = RIVIERA_DEFAULT_MANIFEST;
