/**
 * Identidad madre — única fuente de verdad para Riviera en co-branding.
 *
 * Reglas:
 * - Marca madre: "Riviera Open" (plataforma / empresa).
 * - Atribución en partners: siempre "by Riviera Open".
 * - Sin white label: la madre siempre es visible en cuentas con branding activo.
 */

export const RIVIERA_MOTHER_BRAND_NAME = "Riviera Open" as const;

/** Frase estándar de co-branding en toda la plataforma. */
export const RIVIERA_CO_BRAND_ATTRIBUTION = "by Riviera Open" as const;

/** Nombre del producto en shell autenticado (header, login, admin). */
export const RIVIERA_PRODUCT_NAME = "Riviera Open" as const;

export const RIVIERA_DEFAULT_SLOGAN = "Organiza. Juega. Compite." as const;

export type BrandAttributionStyle = "by";

/** Hoy solo usamos "by"; el tipo queda listo si en el futuro el panel ofrece más opciones. */
export const RIVIERA_ATTRIBUTION_STYLE: BrandAttributionStyle = "by";
