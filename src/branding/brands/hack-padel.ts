import { createBrandConfig } from "../brandConfigFactory";
import { RIVIERA_MOTHER_BRAND_NAME } from "../motherBrand";
import type { BrandConfig } from "../types";

/** Brandbook Hack Pádel — acento #BFFF00 solo en detalles, no fondos completos. */
export const HACK_PADEL_BRAND: BrandConfig = createBrandConfig({
  key: "hack-padel",
  active: true,
  displayName: "Hack Pádel",
  motherBrandName: RIVIERA_MOTHER_BRAND_NAME,
  assets: {
    logoLight: "/brands/hack-padel/logo-light.png",
    logoDark: "/brands/hack-padel/logo.png",
    favicon: "/brands/hack-padel/favicon.png",
    heroImage: "/brands/hack-padel/hero.jpg",
    iconSquare: "/brands/hack-padel/icon.png",
  },
  messaging: {
    slogan: "Organiza. Juega. Compite.",
    homeEyebrow: undefined,
    welcomeSubtitle:
      "Elige un modo y lanza tu reta en menos de un minuto.",
    authSubtitle: "Tu club, tu ranking, tu experiencia con Riviera Open.",
    authProof: "Usado por +200 jugadores activos",
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
  typography: {
    heading:
      'Montserrat, var(--ro-font-heading, "Stack Sans Headline", system-ui, sans-serif)',
    body: 'Montserrat, var(--ro-font-body, "Inter", system-ui, sans-serif)',
    headingWeight: 700,
    headingLetterSpacing: "0.04em",
  },
});
