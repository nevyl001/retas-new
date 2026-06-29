import { createBrandConfig } from "./brandConfigFactory";
import {
  RIVIERA_DEFAULT_SLOGAN,
  RIVIERA_MOTHER_BRAND_NAME,
  RIVIERA_PRODUCT_NAME,
} from "./motherBrand";
import type { BrandConfig } from "./types";

/** Marca madre — fallback para cualquier organizador sin branding activo. */
export const RIVIERA_DEFAULT_BRAND: BrandConfig = createBrandConfig({
  key: "riviera",
  active: true,
  displayName: RIVIERA_PRODUCT_NAME,
  motherBrandName: RIVIERA_MOTHER_BRAND_NAME,
  assets: {
    logoLight: "/logo-riviera.png",
    logoDark: "/logo-riviera.png",
    favicon: "/favicon.ico",
    heroImage: null,
    iconSquare: "/logo-riviera.png",
  },
  messaging: {
    slogan: RIVIERA_DEFAULT_SLOGAN,
    authSubtitle:
      "Crea retas, gestiona torneos y sigue el ranking de tu grupo.",
    authProof: "Usado por +200 jugadores activos",
  },
  colors: {
    primary: "#000000",
    secondary: "#4C4C4C",
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
  typography: {
    heading: 'var(--ro-font-heading, "Stack Sans Headline", system-ui, sans-serif)',
    body: 'var(--ro-font-body, "Inter", system-ui, sans-serif)',
    headingWeight: 700,
    headingLetterSpacing: "-0.02em",
  },
});
