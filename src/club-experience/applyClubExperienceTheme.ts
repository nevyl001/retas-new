import type { CSSProperties } from "react";
import { RIVIERA_DEFAULT_MANIFEST } from "./manifests/riviera-default";
import type { BrandManifest } from "./types";

export function applyClubKeyToDocument(brandingKey: string): void {
  document.documentElement.setAttribute("data-brand", brandingKey);
  document.documentElement.setAttribute("data-club", brandingKey);
}

/** Tokens de marca en un contenedor scoped (vistas públicas sin tocar `<html>`).
 * Incluye aliases legacy (`--accent-gold`, `--ro-accent`, …) solo en este scope
 * para que ranking/ficha usen el acento del club sin redefinir el tema global. */
export function getClubExperienceScopeStyle(
  manifest: BrandManifest
): CSSProperties {
  const { colors, fonts, home, images } = manifest;
  const homeBg =
    home.backgroundImage ?? images.heroBackground ?? images.hero ?? "";

  return {
    ["--brand-primary" as string]: colors.primary,
    ["--brand-secondary" as string]: colors.secondary,
    ["--brand-accent" as string]: colors.accent,
    ["--brand-surface" as string]: colors.surface,
    ["--brand-surface-alt" as string]: colors.surfaceAlt,
    ["--brand-border" as string]: colors.border,
    ["--brand-text" as string]: colors.text,
    ["--brand-muted" as string]: colors.muted,
    ["--brand-success" as string]: colors.success,
    ["--brand-warning" as string]: colors.warning,
    ["--brand-danger" as string]: colors.danger,
    ["--brand-font-heading" as string]: fonts.heading,
    ["--brand-font-body" as string]: fonts.body,
    ["--brand-heading-weight" as string]: String(fonts.headingWeight),
    ["--brand-heading-letter-spacing" as string]: fonts.headingLetterSpacing,
    ["--club-home-background-image" as string]: homeBg
      ? `url(${homeBg})`
      : "none",
    /* Alias legacy usados por CSS público (ranking, ficha, shells) */
    ["--accent-gold" as string]: colors.accent,
    ["--accent-gold-light" as string]: colors.accent,
    ["--ro-accent" as string]: colors.accent,
    ["--ro-border-accent" as string]: `color-mix(in srgb, ${colors.accent} 35%, transparent)`,
  };
}

/**
 * Mientras el anfitrión no está resuelto: mismos tokens que Riviera Open.
 * No usar gris ni oro — evita flash blanco→dorado en clubs sin upgrade.
 * El verde Hack solo aparece al resolver un org premium.
 */
export function getNeutralPublicScopeStyle(): CSSProperties {
  return getClubExperienceScopeStyle(RIVIERA_DEFAULT_MANIFEST);
}

/** Inyecta tokens de experiencia del club en <html> para CSS y temas dinámicos. */
export function applyClubExperienceTheme(manifest: BrandManifest): void {
  const root = document.documentElement;
  const { colors, fonts, images, home } = manifest;

  root.style.setProperty("--brand-primary", colors.primary);
  root.style.setProperty("--brand-secondary", colors.secondary);
  root.style.setProperty("--brand-accent", colors.accent);
  root.style.setProperty("--brand-surface", colors.surface);
  root.style.setProperty("--brand-surface-alt", colors.surfaceAlt);
  root.style.setProperty("--brand-border", colors.border);
  root.style.setProperty("--brand-text", colors.text);
  root.style.setProperty("--brand-muted", colors.muted);
  root.style.setProperty("--brand-success", colors.success);
  root.style.setProperty("--brand-warning", colors.warning);
  root.style.setProperty("--brand-danger", colors.danger);
  root.style.setProperty("--brand-font-heading", fonts.heading);
  root.style.setProperty("--brand-font-body", fonts.body);
  root.style.setProperty(
    "--brand-heading-weight",
    String(fonts.headingWeight)
  );
  root.style.setProperty(
    "--brand-heading-letter-spacing",
    fonts.headingLetterSpacing
  );

  const homeBg =
    home.backgroundImage ?? images.heroBackground ?? images.hero ?? "";
  root.style.setProperty("--club-home-background-image", homeBg ? `url(${homeBg})` : "none");
  root.style.setProperty(
    "--club-login-background-image",
    images.loginBackground ? `url(${images.loginBackground})` : "none"
  );
  root.style.setProperty(
    "--club-dashboard-background-image",
    images.dashboardBackground ? `url(${images.dashboardBackground})` : "none"
  );

  root.style.setProperty("--bg-canvas", colors.surface);
  root.style.setProperty("--bg-base", colors.surface);
  root.style.setProperty("--accent-gold", colors.accent);
  root.style.setProperty("--accent-gold-light", colors.accent);
  root.style.setProperty("--ro-accent", colors.accent);
  root.style.setProperty(
    "--ro-border-accent",
    `color-mix(in srgb, ${colors.accent} 35%, transparent)`
  );
  root.style.setProperty("--ro-surface", colors.surfaceAlt);
}

export function clearClubExperienceTheme(): void {
  const root = document.documentElement;
  const props = [
    "--brand-primary",
    "--brand-secondary",
    "--brand-accent",
    "--brand-surface",
    "--brand-surface-alt",
    "--brand-border",
    "--brand-text",
    "--brand-muted",
    "--brand-success",
    "--brand-warning",
    "--brand-danger",
    "--brand-font-heading",
    "--brand-font-body",
    "--brand-heading-weight",
    "--brand-heading-letter-spacing",
    "--club-home-background-image",
    "--club-login-background-image",
    "--club-dashboard-background-image",
    "--bg-canvas",
    "--bg-base",
    "--accent-gold",
    "--accent-gold-light",
    "--ro-accent",
    "--ro-border-accent",
    "--ro-surface",
  ];
  props.forEach((prop) => root.style.removeProperty(prop));
}

export function applyClubFavicon(manifest: BrandManifest): void {
  const href = manifest.logos.favicon;
  if (!href) return;

  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  if (link.getAttribute("href") !== href) {
    link.href = href;
  }
}

/** @deprecated Usar applyClubExperienceTheme */
export const applyBrandThemeTokens = applyClubExperienceTheme;

/** @deprecated Usar clearClubExperienceTheme */
export const clearBrandThemeTokens = clearClubExperienceTheme;

/** @deprecated Usar applyClubFavicon */
export const applyBrandFavicon = applyClubFavicon;
