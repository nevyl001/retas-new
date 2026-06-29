import { getBrandConfigByKey, resolveBrandKeyForOrganizador } from "./brandRegistry";
import { mergeBrandConfig } from "./brandConfigFactory";
import type { BrandConfig, BrandKey, BrandOrganizerBinding } from "./types";

/**
 * Fuente de configuración de marcas.
 *
 * Hoy: registry estático en código.
 * Mañana: `loadBindings()` desde Supabase + merge con registry base.
 */
export interface BrandConfigSource {
  resolveKeyForOrganizador(organizadorId: string | null | undefined): BrandKey;
  getConfigByKey(key: BrandKey): BrandConfig;
  resolveForOrganizador(organizadorId: string | null | undefined): BrandConfig;
}

let runtimeBindings: BrandOrganizerBinding[] = [];

/** Hook futuro para hidratar overrides del panel sin redeploy. */
export function setRuntimeBrandBindings(bindings: BrandOrganizerBinding[]): void {
  runtimeBindings = bindings;
}

function findRuntimeBinding(
  organizadorId: string | null | undefined
): BrandOrganizerBinding | undefined {
  if (!organizadorId) return undefined;
  const normalized = organizadorId.trim().toLowerCase();
  return runtimeBindings.find(
    (b) => b.organizadorId.trim().toLowerCase() === normalized
  );
}

export const brandConfigSource: BrandConfigSource = {
  resolveKeyForOrganizador(organizadorId) {
    const runtime = findRuntimeBinding(organizadorId);
    if (runtime?.active && runtime.brandingKey) {
      return runtime.brandingKey;
    }
    return resolveBrandKeyForOrganizador(organizadorId);
  },

  getConfigByKey(key) {
    return getBrandConfigByKey(key);
  },

  resolveForOrganizador(organizadorId) {
    const runtime = findRuntimeBinding(organizadorId);
    const key = this.resolveKeyForOrganizador(organizadorId);
    const base = getBrandConfigByKey(key);

    if (!runtime?.active) {
      if (key === "riviera" || !base.active) {
        return getBrandConfigByKey("riviera");
      }
      return base;
    }

    return mergeBrandConfig(base, {
      active: runtime.active,
      ...runtime.overrides,
    });
  },
};
