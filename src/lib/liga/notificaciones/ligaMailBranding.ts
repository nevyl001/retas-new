import {
  isRivieraOwnAccountName,
  RIVIERA_CO_BRAND_ATTRIBUTION,
  RIVIERA_PRODUCT_NAME,
} from "../../../club-experience/motherBrand";
import { getRivieraAppPublicBase } from "../../rivieraOfficialSite";
import type { BrandManifest } from "../../../club-experience/types";

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

export function logoSeguro(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith("/")) {
    const base = getRivieraAppPublicBase().replace(/\/+$/, "");
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

export function resolveLigaMailBranding(options: {
  clubNombre?: string | null;
  logoUrl?: string | null;
  acentoHex?: string | null;
  manifest?: BrandManifest | null;
}): LigaMailBranding {
  const manifest = options.manifest;
  const clubNombre = options.clubNombre?.trim() || manifest?.displayName?.trim() || RIVIERA_PRODUCT_NAME;
  const isRiviera = isRivieraOwnAccountName(clubNombre);

  if (isRiviera) {
    return {
      ...RIVIERA_DEFAULT_MAIL_BRANDING,
      brandAccentColor: hexSeguro(options.acentoHex, RIVIERA_DEFAULT_MAIL_BRANDING.brandAccentColor),
    };
  }

  const rawLogo = options.logoUrl || manifest?.logos?.light || manifest?.logos?.dark || null;
  const brandLogoUrl = logoSeguro(rawLogo);

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
