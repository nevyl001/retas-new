import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
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
import { debugLog } from "../lib/debug/debugLog";
import {
  getClubExperienceScopeStyle,
  getNeutralPublicScopeStyle,
} from "./applyClubExperienceTheme";
import { resolveBootstrapOrganizadorId } from "./clubExperienceBootstrap";
import {
  isClubBrandedOrganizer,
  resolveClubManifest,
} from "./manifestResolver";
import type { BrandManifest } from "./types";

export type ClubBrandingStatus = "pending" | "resolved";

export interface ClubExperienceContextValue {
  manifest: BrandManifest;
  branding: TenantBranding;
  isClubBranded: boolean;
  organizadorId: string | null;
  isBrandingReady: boolean;
  isBrandingTransitioning: boolean;
  /** Estado del scope: pending = no pintar identidad de tenant. */
  brandingStatus: ClubBrandingStatus;
  isScopeBrandingReady: boolean;
  isResolvingBranding: boolean;
  /** @deprecated Usar manifest */
  brand: BrandManifest;
  /** @deprecated Usar isClubBranded */
  isCoBranded: boolean;
}

const ClubExperienceContext = createContext<
  ClubExperienceContextValue | undefined
>(undefined);

function normalizeOrganizadorId(
  organizadorId: string | null | undefined
): string | null {
  const normalized = organizadorId?.trim().toLowerCase();
  return normalized || null;
}

function appliedMatchesOrganizador(
  organizadorId: string | null | undefined
): boolean {
  const orgId = normalizeOrganizadorId(organizadorId);
  if (!orgId) return false;
  return (
    normalizeOrganizadorId(getAppliedBranding()?.organizadorId) === orgId
  );
}

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
  const brandingStatus: ClubBrandingStatus =
    isBrandingReady && !isBrandingTransitioning ? "resolved" : "pending";

  const value = useMemo(
    () => ({
      manifest,
      branding,
      isClubBranded,
      organizadorId,
      isBrandingReady,
      isBrandingTransitioning,
      brandingStatus,
      isScopeBrandingReady: brandingStatus === "resolved",
      isResolvingBranding: brandingStatus === "pending",
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
      brandingStatus,
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
  /**
   * Vistas públicas cuyo org se conoce tras cargar el recurso.
   * Con `organizadorId` null → branding pending (no Riviera transitorio).
   * Default false para no romper home/admin/scopes madre.
   */
  pendingUntilOrganizador?: boolean;
}

/** Scoped: tokens en contenedor, sin mutar `<html>`. */
export const ClubExperienceScope: React.FC<ClubExperienceScopeProps> = ({
  organizadorId,
  children,
  pendingUntilOrganizador = false,
}) => {
  const [bindingRevision, bumpBindingRevision] = useReducer((n: number) => n + 1, 0);
  const normalizedOrgId = normalizeOrganizadorId(organizadorId);

  const [brandingStatus, setBrandingStatus] = useState<ClubBrandingStatus>(() => {
    if (pendingUntilOrganizador && !normalizedOrgId) return "pending";
    if (!normalizedOrgId) return "resolved";
    return appliedMatchesOrganizador(normalizedOrgId) ? "resolved" : "pending";
  });

  useEffect(() => {
    let cancelled = false;

    if (pendingUntilOrganizador && !normalizedOrgId) {
      setBrandingStatus("pending");
      debugLog("[branding-flash] branding-scope: pending", {
        reason: "awaiting-organizador",
      });
      return () => {
        cancelled = true;
      };
    }

    if (!normalizedOrgId) {
      void syncRuntimeBindingForOrganizador(null).then(() => {
        if (cancelled) return;
        bumpBindingRevision();
        setBrandingStatus("resolved");
        debugLog("[branding-flash] branding-scope: resolved", {
          organizadorId: null,
          source: "mother-scope",
        });
      });
      return () => {
        cancelled = true;
      };
    }

    const alreadyApplied = appliedMatchesOrganizador(normalizedOrgId);
    if (!alreadyApplied) {
      setBrandingStatus("pending");
      debugLog("[branding-flash] branding-scope: pending", {
        reason: "awaiting-binding",
        organizadorId: normalizedOrgId,
      });
    }

    void syncRuntimeBindingForOrganizador(normalizedOrgId).then(() => {
      if (cancelled) return;
      bumpBindingRevision();
      setBrandingStatus("resolved");
      debugLog("[branding-flash] branding-scope: resolved", {
        organizadorId: normalizedOrgId,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [normalizedOrgId, pendingUntilOrganizador]);

  const isPending = brandingStatus === "pending";

  const manifest = useMemo(() => {
    void bindingRevision;
    return resolveClubManifest(normalizedOrgId);
  }, [normalizedOrgId, bindingRevision]);
  const isClubBranded = useMemo(() => {
    void bindingRevision;
    if (isPending) return false;
    return isClubBrandedOrganizer(normalizedOrgId);
  }, [normalizedOrgId, bindingRevision, isPending]);
  const branding = useMemo(() => {
    void bindingRevision;
    return resolveBrandingSync(normalizedOrgId);
  }, [normalizedOrgId, bindingRevision]);

  const value = useMemo(
    () => ({
      manifest,
      branding,
      isClubBranded,
      organizadorId: normalizedOrgId,
      isBrandingReady: getIsBrandingReady(),
      isBrandingTransitioning: getIsBrandingTransitioning(),
      brandingStatus,
      isScopeBrandingReady: !isPending,
      isResolvingBranding: isPending,
      brand: manifest,
      isCoBranded: isClubBranded,
    }),
    [manifest, branding, isClubBranded, normalizedOrgId, brandingStatus, isPending]
  );

  return (
    <ClubExperienceContext.Provider value={value}>
      <div
        data-brand={isPending ? "pending" : manifest.brandingKey}
        data-club={isPending ? "pending" : manifest.brandingKey}
        data-branding-status={brandingStatus}
        className="club-experience-scope"
        style={
          isPending
            ? getNeutralPublicScopeStyle()
            : getClubExperienceScopeStyle(manifest)
        }
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
    const isBrandingReady = getIsBrandingReady();
    const isBrandingTransitioning = getIsBrandingTransitioning();
    const brandingStatus: ClubBrandingStatus =
      isBrandingReady && !isBrandingTransitioning ? "resolved" : "pending";
    return {
      manifest: branding.manifest,
      branding,
      isClubBranded: branding.isClubBranded,
      organizadorId: branding.organizadorId,
      isBrandingReady,
      isBrandingTransitioning,
      brandingStatus,
      isScopeBrandingReady: brandingStatus === "resolved",
      isResolvingBranding: brandingStatus === "pending",
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
