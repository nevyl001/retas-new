import {
  isRivieraOwnAccountName,
  RIVIERA_CO_BRAND_ATTRIBUTION,
  RIVIERA_PRODUCT_NAME,
// @ts-expect-error El empaquetador de Edge Functions exige la extensión .ts.
} from "../../../club-experience/motherBrand.ts";
// @ts-expect-error El empaquetador de Edge Functions exige la extensión .ts.
import { getRivieraAppPublicBase } from "../../rivieraOfficialSite.ts";
// @ts-expect-error El empaquetador de Edge Functions exige la extensión .ts.
import type { BrandManifest } from "../../../club-experience/types.ts";
import {
  getManifestByKey,
  listRegisteredManifestKeys,
// @ts-expect-error El empaquetador de Edge Functions exige la extensión .ts.
} from "../../../club-experience/manifestCatalog.ts";

export interface LigaMailBranding {
  brandName: string;
  brandLogoUrl: string | null;
  brandPrimaryColor: string;
  brandSecondaryColor: string;
  brandAccentColor: string;
  brandTextOnPrimary: string;
  brandSupportLabel: string;
  isClubBranded: boolean;
  initials: string;
}

export const RIVIERA_DEFAULT_MAIL_BRANDING: LigaMailBranding = {
  brandName: RIVIERA_PRODUCT_NAME,
      brandLogoUrl: `${getRivieraAppPublicBase()}/logo-riviera.png`,
  brandPrimaryColor: "#15191F",
  brandSecondaryColor: "#232830",
  brandAccentColor: "#BFFF00",
  brandTextOnPrimary: "#FFFFFF",
  brandSupportLabel: "",
  isClubBranded: false,
  initials: "RO",
};

export function getClubInitials(name: string): string {
  const clean = (name || "").trim().replace(/[^\p{L}\p{N}\s]/gu, "");
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "RO";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export function logoSeguro(url: string | null | undefined, baseUrl?: string | null): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith("/")) {
    const base = (baseUrl?.trim() || getRivieraAppPublicBase()).replace(/\/+$/, "");
    return `${base}${trimmed}`;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.search.includes("@") || parsed.hash.includes("@")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function hexSeguro(hex: string | null | undefined, fallback: string): string {
  const value = (hex ?? "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(value)) return value;
  return fallback;
}

export function lookupManifestByClubName(clubNombre: string): BrandManifest | null {
  const norm = clubNombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  if (!norm) return null;
  for (const key of listRegisteredManifestKeys()) {
    if (key === "riviera") continue;
    const m = getManifestByKey(key);
    const keyNorm = key.replace(/[^a-z0-9]/g, "");
    const dispNorm = (m.displayName || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
    if (
      norm === keyNorm ||
      norm === dispNorm ||
      norm.includes(keyNorm) ||
      keyNorm.includes(norm) ||
      norm.includes(dispNorm) ||
      dispNorm.includes(norm)
    ) {
      if (m.active) return m;
    }
  }
  return null;
}

export function resolveLigaMailBranding(options: {
  clubNombre?: string | null;
  logoUrl?: string | null;
  acentoHex?: string | null;
  manifest?: BrandManifest | null;
  appBaseUrl?: string | null;
}): LigaMailBranding {
  const rawClubNombre = options.clubNombre?.trim();
  const manifest =
    options.manifest ?? (rawClubNombre ? lookupManifestByClubName(rawClubNombre) : null);
  const clubNombre =
    rawClubNombre || manifest?.displayName?.trim() || RIVIERA_PRODUCT_NAME;
  const isRiviera = isRivieraOwnAccountName(clubNombre);

  if (isRiviera) {
    const base = (options.appBaseUrl?.trim() || getRivieraAppPublicBase()).replace(/\/+$/, "");
    return {
      ...RIVIERA_DEFAULT_MAIL_BRANDING,
      brandLogoUrl: `${base}/logo-riviera.png`,
      brandAccentColor: hexSeguro(options.acentoHex, RIVIERA_DEFAULT_MAIL_BRANDING.brandAccentColor),
    };
  }

  const rawLogo =
    options.logoUrl ||
    manifest?.logos?.dark ||
    manifest?.logos?.light ||
    manifest?.logos?.square ||
    null;
  const brandLogoUrl = logoSeguro(rawLogo, options.appBaseUrl);

  const primary = hexSeguro(manifest?.colors?.primary, "#15191F");
  const secondary = hexSeguro(manifest?.colors?.secondary, "#232830");
  const accent = hexSeguro(options.acentoHex || manifest?.colors?.accent, "#BFFF00");
  const textOnPrimary = hexSeguro(manifest?.colors?.text, "#FFFFFF");

  return {
    brandName: clubNombre,
    brandLogoUrl,
    brandPrimaryColor: primary,
    brandSecondaryColor: secondary,
    brandAccentColor: accent,
    brandTextOnPrimary: textOnPrimary,
    brandSupportLabel: RIVIERA_CO_BRAND_ATTRIBUTION,
    isClubBranded: true,
    initials: getClubInitials(clubNombre),
  };
}

