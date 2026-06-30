import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import { useAdmin } from "../contexts/AdminContext";
import { useUser } from "../contexts/UserContext";
import {
  getAppliedBranding,
  resolveBrandingSync,
  subscribeBranding,
} from "../branding/BrandingService";
import {
  getIsBrandingReady,
  getIsBrandingTransitioning,
  subscribeBrandingTransition,
} from "../branding/brandingTransition";
import type { TenantBranding } from "../branding/types";
import { syncRuntimeBindingForOrganizador } from "../lib/branding/organizerBrandingSettings";
import { getClubExperienceScopeStyle } from "./applyClubExperienceTheme";
import { resolveBootstrapOrganizadorId } from "./clubExperienceBootstrap";
import {
  isClubBrandedOrganizer,
  resolveClubManifest,
} from "./manifestResolver";
import type { BrandManifest } from "./types";

export interface ClubExperienceContextValue {
  manifest: BrandManifest;
  branding: TenantBranding;
  isClubBranded: boolean;
  organizadorId: string | null;
  isBrandingReady: boolean;
  isBrandingTransitioning: boolean;
  /** @deprecated Usar manifest */
  brand: BrandManifest;
  /** @deprecated Usar isClubBranded */
  isCoBranded: boolean;
}

const ClubExperienceContext = createContext<
  ClubExperienceContextValue | undefined
>(undefined);

interface ClubExperienceProviderProps {
  children: React.ReactNode;
}

/**
 * Consume branding ya aplicado por BrandingService (bootstrap + sesión).
 * No resuelve ni aplica CSS al documento.
 */
export const ClubExperienceProvider: React.FC<ClubExperienceProviderProps> = ({
  children,
}) => {
  const { user, loading: userLoading } = useUser();
  const { isAdminLoggedIn } = useAdmin();
  const bootstrapOrganizadorId = useMemo(() => resolveBootstrapOrganizadorId(), []);
  const [brandingRevision, bumpBrandingRevision] = useReducer((n: number) => n + 1, 0);
  const [, transitionRevision] = useReducer((n: number) => n + 1, 0);

  useEffect(() => subscribeBranding(() => bumpBrandingRevision()), []);
  useEffect(() => subscribeBrandingTransition(() => transitionRevision()), []);

  const isBrandingReady = getIsBrandingReady();
  const isBrandingTransitioning = getIsBrandingTransitioning();

  const organizadorId = isAdminLoggedIn
    ? null
    : user?.id ?? (userLoading ? bootstrapOrganizadorId : null);

  const branding = useMemo(() => {
    void brandingRevision;
    const applied = getAppliedBranding();
    if (applied) return applied;
    return resolveBrandingSync(organizadorId);
  }, [organizadorId, brandingRevision]);

  const manifest = branding.manifest;
  const isClubBranded = branding.isClubBranded;

  const value = useMemo(
    () => ({
      manifest,
      branding,
      isClubBranded,
      organizadorId,
      isBrandingReady,
      isBrandingTransitioning,
      brand: manifest,
      isCoBranded: isClubBranded,
    }),
    [
      manifest,
      branding,
      isClubBranded,
      organizadorId,
      isBrandingReady,
      isBrandingTransitioning,
    ]
  );

  return (
    <ClubExperienceContext.Provider value={value}>
      {children}
    </ClubExperienceContext.Provider>
  );
};

interface ClubExperienceScopeProps {
  organizadorId: string | null | undefined;
  children: React.ReactNode;
}

/** Scoped: tokens en contenedor, sin mutar `<html>`. */
export const ClubExperienceScope: React.FC<ClubExperienceScopeProps> = ({
  organizadorId,
  children,
}) => {
  const [bindingRevision, bumpBindingRevision] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    let cancelled = false;
    void syncRuntimeBindingForOrganizador(organizadorId).then(() => {
      if (!cancelled) bumpBindingRevision();
    });
    return () => {
      cancelled = true;
    };
  }, [organizadorId]);

  const manifest = useMemo(() => {
    void bindingRevision;
    return resolveClubManifest(organizadorId);
  }, [organizadorId, bindingRevision]);
  const isClubBranded = useMemo(() => {
    void bindingRevision;
    return isClubBrandedOrganizer(organizadorId);
  }, [organizadorId, bindingRevision]);
  const branding = useMemo(() => {
    void bindingRevision;
    return resolveBrandingSync(organizadorId ?? null);
  }, [organizadorId, bindingRevision]);

  const value = useMemo(
    () => ({
      manifest,
      branding,
      isClubBranded,
      organizadorId: organizadorId ?? null,
      isBrandingReady: getIsBrandingReady(),
      isBrandingTransitioning: getIsBrandingTransitioning(),
      brand: manifest,
      isCoBranded: isClubBranded,
    }),
    [manifest, branding, isClubBranded, organizadorId]
  );

  return (
    <ClubExperienceContext.Provider value={value}>
      <div
        data-brand={manifest.brandingKey}
        data-club={manifest.brandingKey}
        className="club-experience-scope"
        style={getClubExperienceScopeStyle(manifest)}
      >
        {children}
      </div>
    </ClubExperienceContext.Provider>
  );
};

export function useClubExperience(): ClubExperienceContextValue {
  const ctx = useContext(ClubExperienceContext);
  if (!ctx) {
    const branding = getAppliedBranding() ?? resolveBrandingSync(null);
    return {
      manifest: branding.manifest,
      branding,
      isClubBranded: branding.isClubBranded,
      organizadorId: branding.organizadorId,
      isBrandingReady: getIsBrandingReady(),
      isBrandingTransitioning: getIsBrandingTransitioning(),
      brand: branding.manifest,
      isCoBranded: branding.isClubBranded,
    };
  }
  return ctx;
}

/** Branding del tenant actual — preferir sobre manifest suelto en UI nueva. */
export function useBranding(): TenantBranding {
  return useClubExperience().branding;
}

/** @deprecated Usar ClubExperienceProvider */
export const BrandProvider = ClubExperienceProvider;

/** @deprecated Usar ClubExperienceScope */
export const BrandScope = ClubExperienceScope;

/** @deprecated Usar useClubExperience */
export const useBrand = useClubExperience;
