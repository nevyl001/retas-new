/**
 * Identidad madre — ecosistema Riviera Open.
 *
 * Cada club vive dentro de este ecosistema (co-branding obligatorio).
 * Sin white label.
 */

export const RIVIERA_MOTHER_BRAND_NAME = "Riviera Open" as const;

export const RIVIERA_CO_BRAND_ATTRIBUTION = "by Riviera Open" as const;

export const RIVIERA_PRODUCT_NAME = "Riviera Open" as const;

/** Cuenta madre: el nombre visible es Riviera Open, sin atribución «by Riviera Open». */
export function isRivieraOwnAccountName(
  name: string | null | undefined
): boolean {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return true;
  return (
    trimmed.localeCompare(RIVIERA_PRODUCT_NAME, undefined, {
      sensitivity: "accent",
    }) === 0
  );
}

export const RIVIERA_DEFAULT_SLOGAN = "Organiza. Juega. Compite." as const;

export type BrandAttributionStyle = "by";

export const RIVIERA_ATTRIBUTION_STYLE: BrandAttributionStyle = "by";
