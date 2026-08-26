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
import { getClubExperienceCacheIfMatches } from "../branding/organizerResolver";
import { syncRuntimeBindingForOrganizador } from "../lib/branding/organizerBrandingSettings";
import {
  getClubExperienceScopeStyle,
  getNeutralPublicScopeStyle,
} from "./applyClubExperienceTheme";
import { resolveBootstrapOrganizadorId } from "./clubExperienceBootstrap";
import { getManifestByKey } from "./manifestRegistry";
import {
  isClubBrandedOrganizer,
  resolveClubManifest,
} from "./manifestResolver";
import { isPremiumBrandingEnabledForOrganizador } from "./organizerBindingResolver";
import type { BrandManifest, ClubBrandingKey } from "./types";

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
  /**
   * true cuando ya se puede pintar UI con tokens del tenant (o Riviera final),
   * sin flash Riviera→club. Incluye pending premium con cache/índice estático.
   */
  canPaintScopedBrand: boolean;
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
      canPaintScopedBrand: brandingStatus === "resolved",
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
      return () => {
        cancelled = true;
      };
    }

    if (!normalizedOrgId) {
      void syncRuntimeBindingForOrganizador(null).then(() => {
        if (cancelled) return;
        bumpBindingRevision();
        setBrandingStatus("resolved");
      });
      return () => {
        cancelled = true;
      };
    }

    const alreadyApplied = appliedMatchesOrganizador(normalizedOrgId);
    if (!alreadyApplied) {
      setBrandingStatus("pending");
    }

    void syncRuntimeBindingForOrganizador(normalizedOrgId).then(() => {
      if (cancelled) return;
      bumpBindingRevision();
      setBrandingStatus("resolved");
    });

    return () => {
      cancelled = true;
    };
  }, [normalizedOrgId, pendingUntilOrganizador]);

  const isPending = brandingStatus === "pending";
  const cachedPremium = getClubExperienceCacheIfMatches(normalizedOrgId);
  const premiumKnown =
    Boolean(normalizedOrgId) &&
    (isPremiumBrandingEnabledForOrganizador(normalizedOrgId) ||
      Boolean(cachedPremium));

  const manifest = useMemo(() => {
    void bindingRevision;
    if (
      isPending &&
      cachedPremium?.brandingKey &&
      !isPremiumBrandingEnabledForOrganizador(normalizedOrgId)
    ) {
      try {
        return getManifestByKey(
          cachedPremium.brandingKey as ClubBrandingKey
        );
      } catch {
        /* key desconocida → caer a resolver normal */
      }
    }
    return resolveClubManifest(normalizedOrgId);
  }, [
    normalizedOrgId,
    bindingRevision,
    isPending,
    cachedPremium?.brandingKey,
  ]);
  const isClubBranded = useMemo(() => {
    void bindingRevision;
    if (isPending) return false;
    return isClubBrandedOrganizer(normalizedOrgId);
  }, [normalizedOrgId, bindingRevision, isPending]);
  const branding = useMemo(() => {
    void bindingRevision;
    return resolveBrandingSync(normalizedOrgId);
  }, [normalizedOrgId, bindingRevision]);

  const canPaintScopedBrand = !isPending || premiumKnown;

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
      canPaintScopedBrand,
      brand: manifest,
      isCoBranded: isClubBranded,
    }),
    [
      manifest,
      branding,
      isClubBranded,
      normalizedOrgId,
      brandingStatus,
      isPending,
      canPaintScopedBrand,
    ]
  );

  // Clubs sin upgrade: siempre Riviera Open (pending = resolved visualmente).
  // Premium: puede pintar manifiesto estático/caché ya en pending (inline + data-club).
  const scopeStyleManifest =
    isPending && !premiumKnown
      ? getNeutralPublicScopeStyle()
      : getClubExperienceScopeStyle(manifest);
  // Evita flash Riviera→club: CSS tenant ([data-club=…] …)
  // debe matchear desde el primer paint con org premium conocido.
  const scopeClubKey =
    isPending && !premiumKnown ? "pending" : manifest.brandingKey;

  return (
    <ClubExperienceContext.Provider value={value}>
      <div
        data-brand={scopeClubKey}
        data-club={scopeClubKey}
        data-branding-status={brandingStatus}
        className="club-experience-scope"
        style={scopeStyleManifest}
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
      canPaintScopedBrand: brandingStatus === "resolved",
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
