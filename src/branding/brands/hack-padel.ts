import type { BrandConfig } from "../types";

/** Brandbook Hack Pádel — acento #BFFF00 solo en detalles, no fondos completos. */
export const HACK_PADEL_BRAND: BrandConfig = {
  key: "hack-padel",
  displayName: "Hack Pádel",
  motherBrandName: "Riviera Open",
  coBrandLine: "by Riviera Open",
  coBrandCompact: "Hack Pádel · Riviera Open",
  logoUrl: "/brands/hack-padel/logo.png",
  slogan: "Organiza. Juega. Compite.",
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
};
