import {
  setRuntimeOrganizerClubBindings,
  type ClubBrandingKey,
  type ClubOrganizerBinding,
} from "../../club-experience";
import { supabase } from "../supabaseClient";

export interface OrganizerBrandingPublicSettings {
  premiumBrandingEnabled: boolean;
  brandingKey: ClubBrandingKey | null;
}

const DEFAULT_SETTINGS: OrganizerBrandingPublicSettings = {
  premiumBrandingEnabled: false,
  brandingKey: null,
};

function normalizeOrganizadorId(
  organizadorId: string | null | undefined
): string | null {
  const normalized = organizadorId?.trim().toLowerCase();
  return normalized || null;
}

function rowToSettings(
  row: { premium_branding_enabled?: boolean; branding_key?: string | null } | null
): OrganizerBrandingPublicSettings {
  if (!row) return DEFAULT_SETTINGS;
  const brandingKey = row.branding_key?.trim() || null;
  return {
    premiumBrandingEnabled: row.premium_branding_enabled === true,
    brandingKey: brandingKey as ClubBrandingKey | null,
  };
}

export function bindingFromBrandingSettings(
  organizadorId: string,
  settings: OrganizerBrandingPublicSettings
): ClubOrganizerBinding | null {
  if (!settings.premiumBrandingEnabled || !settings.brandingKey) return null;
  return {
    organizadorId: normalizeOrganizadorId(organizadorId) ?? organizadorId,
    brandingKey: settings.brandingKey,
    active: true,
    premiumBrandingEnabled: true,
  };
}

export async function fetchOrganizerBrandingPublicSettings(
  organizadorId: string | null | undefined
): Promise<OrganizerBrandingPublicSettings> {
  const id = normalizeOrganizadorId(organizadorId);
  if (!id) return DEFAULT_SETTINGS;

  const { data, error } = await supabase.rpc("get_organizador_branding_public", {
    p_org_id: id,
  });

  if (error) {
    if (
      error.code === "42883" ||
      error.message?.includes("get_organizador_branding_public")
    ) {
      return DEFAULT_SETTINGS;
    }
    console.warn("[branding] fetchOrganizerBrandingPublicSettings:", error);
    return DEFAULT_SETTINGS;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return rowToSettings(row as Record<string, unknown> | null);
}

/** Sincroniza binding runtime desde BD (gana sobre organizadorClubIndex estático). */
export async function syncRuntimeBindingForOrganizador(
  organizadorId: string | null | undefined
): Promise<void> {
  const id = normalizeOrganizadorId(organizadorId);
  if (!id) {
    setRuntimeOrganizerClubBindings([]);
    return;
  }

  const settings = await fetchOrganizerBrandingPublicSettings(id);
  const binding = bindingFromBrandingSettings(id, settings);
  setRuntimeOrganizerClubBindings(binding ? [binding] : []);
}
