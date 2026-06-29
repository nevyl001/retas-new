import type { BrandConfig } from "./types";

/** Marca madre — fallback para cualquier organizador sin entrada en el índice. */
export const RIVIERA_DEFAULT_BRAND: BrandConfig = {
  key: "riviera",
  displayName: "RivieraApp",
  motherBrandName: "Riviera Open",
  coBrandLine: "by Riviera Open",
  coBrandCompact: "RivieraApp · Riviera Open",
  logoUrl: "/logo-riviera.png",
  slogan: "Organiza. Juega. Compite.",
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
};
