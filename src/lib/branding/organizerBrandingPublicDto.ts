/**
 * DTO helpers for get_organizador_branding_public — whitelist only.
 * premium_branding_enabled is decided server-side; FE never trusts a browser flag.
 */
export type OrganizerBrandingPublicDto = {
  organizador_id: string;
  premium_branding_enabled: boolean;
  branding_key: string | null;
};

const PUBLIC_KEYS = [
  "organizador_id",
  "premium_branding_enabled",
  "branding_key",
] as const;

export function rowToPublicDtoFields(
  row: Record<string, unknown>
): OrganizerBrandingPublicDto {
  return {
    organizador_id: String(row.organizador_id || ""),
    premium_branding_enabled: row.premium_branding_enabled === true,
    branding_key:
      row.premium_branding_enabled === true && row.branding_key
        ? String(row.branding_key)
        : null,
  };
}

export function assertNoPrivateBrandingKeys(dto: Record<string, unknown>): void {
  for (const key of Object.keys(dto)) {
    if (!(PUBLIC_KEYS as readonly string[]).includes(key)) {
      throw new Error(`Campo privado en DTO branding: ${key}`);
    }
  }
}

export { bindingFromBrandingSettings } from "./organizerBrandingSettings";
