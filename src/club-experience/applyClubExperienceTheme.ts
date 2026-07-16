import type { CSSProperties } from "react";
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
 * Tokens neutrales mientras el organizador / binding público aún no está listo.
 * Evita pintar Riviera o un tenant anterior como fallback transitorio.
 * Incluye aliases legacy (`--ro-accent`, …) para que CSS de /jugar no herede
 * el oro Riviera de `<html>` durante el pending (FOUC móvil / WhatsApp WebView).
 */
export function getNeutralPublicScopeStyle(): CSSProperties {
  const accent = "#a1a1aa";
  return {
    ["--brand-primary" as string]: "#71717a",
    ["--brand-secondary" as string]: "#52525b",
    ["--brand-accent" as string]: accent,
    ["--brand-surface" as string]: "#0f0f0f",
    ["--brand-surface-alt" as string]: "#1a1a1a",
    ["--brand-border" as string]: "#2a2a2a",
    ["--brand-text" as string]: "#ffffff",
    ["--brand-muted" as string]: "#a1a1aa",
    ["--brand-success" as string]: "#4ade80",
    ["--brand-warning" as string]: "#fbbf24",
    ["--brand-danger" as string]: "#f87171",
    ["--brand-font-heading" as string]:
      'var(--ro-font-heading, "Stack Sans Headline", system-ui, sans-serif)',
    ["--brand-font-body" as string]:
      'var(--ro-font-body, "Inter", system-ui, sans-serif)',
    ["--brand-heading-weight" as string]: "700",
    ["--brand-heading-letter-spacing" as string]: "-0.02em",
    ["--club-home-background-image" as string]: "none",
    ["--accent-gold" as string]: accent,
    ["--accent-gold-light" as string]: accent,
    ["--ro-accent" as string]: accent,
    ["--ro-border-accent" as string]:
      "color-mix(in srgb, #a1a1aa 35%, transparent)",
  };
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
