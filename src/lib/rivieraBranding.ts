import {
  RIVIERA_CO_BRAND_ATTRIBUTION,
  RIVIERA_DEFAULT_SLOGAN,
  RIVIERA_MOTHER_BRAND_NAME,
  RIVIERA_PRODUCT_NAME,
} from "../club-experience/motherBrand";

/** @deprecated Importar desde `branding/motherBrand` o `branding`. */
export const RIVIERA_APP_DISPLAY = RIVIERA_PRODUCT_NAME;

/** Tagline de producto — header, auth, vistas públicas, meta */
export const RIVIERA_APP_TAGLINE = RIVIERA_DEFAULT_SLOGAN;

export {
  RIVIERA_MOTHER_BRAND_NAME,
  RIVIERA_CO_BRAND_ATTRIBUTION,
  RIVIERA_PRODUCT_NAME,
  RIVIERA_DEFAULT_SLOGAN,
};

/**
 * Descripción unificada: enlaces compartidos (OG), manifest y cabeceras públicas.
 * Debe coincidir con `public/index.html` y `public/manifest.json`.
 */
export const RIVIERA_PUBLIC_DESCRIPTION = `${RIVIERA_APP_TAGLINE} Crea retas y torneos de pádel, gestiona jugadores, estadísticas en tiempo real y enlaces públicos.`;

export const RIVIERA_SOCIAL_HANDLE = "@rivieraopen";

export const RIVIERA_SOCIAL_LINKS = [
  {
    id: "instagram" as const,
    label: "Instagram",
    href: "https://www.instagram.com/rivieraopen",
  },
  {
    id: "tiktok" as const,
    label: "TikTok",
    href: "https://www.tiktok.com/@rivieraopen",
  },
  {
    id: "facebook" as const,
    label: "Facebook",
    href: "https://www.facebook.com/rivieraopen/",
  },
];
