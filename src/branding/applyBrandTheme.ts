import type { BrandConfig } from "./types";

/** Inyecta tokens de marca en <html> para CSS scoped y futuros temas dinámicos. */
export function applyBrandThemeTokens(brand: BrandConfig): void {
  const root = document.documentElement;
  const { colors, typography } = brand;

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
  root.style.setProperty("--brand-font-heading", typography.heading);
  root.style.setProperty("--brand-font-body", typography.body);
  root.style.setProperty(
    "--brand-heading-weight",
    String(typography.headingWeight)
  );
  root.style.setProperty(
    "--brand-heading-letter-spacing",
    typography.headingLetterSpacing
  );
}

export function clearBrandThemeTokens(): void {
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
  ];
  props.forEach((prop) => root.style.removeProperty(prop));
}

/** Favicon dinámico — listo para cuando el panel suba assets por club. */
export function applyBrandFavicon(brand: BrandConfig): void {
  const href = brand.assets.favicon;
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
