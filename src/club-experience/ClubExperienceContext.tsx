import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { useAdmin } from "../contexts/AdminContext";
import { useUser } from "../contexts/UserContext";
import {
  applyClubExperienceTheme,
  applyClubFavicon,
  clearClubExperienceTheme,
  getClubExperienceScopeStyle,
} from "./applyClubExperienceTheme";
import {
  isClubBrandedOrganizer,
  resolveClubManifest,
} from "./manifestResolver";
import type { BrandManifest } from "./types";

export interface ClubExperienceContextValue {
  manifest: BrandManifest;
  isClubBranded: boolean;
  organizadorId: string | null;
  /** @deprecated Usar manifest */
  brand: BrandManifest;
  /** @deprecated Usar isClubBranded */
  isCoBranded: boolean;
}

const ClubExperienceContext = createContext<
  ClubExperienceContextValue | undefined
>(undefined);

function applyClubKeyToDocument(brandingKey: string): void {
  document.documentElement.setAttribute("data-brand", brandingKey);
  document.documentElement.setAttribute("data-club", brandingKey);
}

interface ClubExperienceProviderProps {
  children: React.ReactNode;
}

/** Resuelve la experiencia del club por sesión del organizador logueado. */
export const ClubExperienceProvider: React.FC<ClubExperienceProviderProps> = ({
  children,
}) => {
  const { user } = useUser();
  const { isAdminLoggedIn } = useAdmin();
  const organizadorId =
    isAdminLoggedIn ? null : (user?.id ?? null);

  const manifest = useMemo(
    () => resolveClubManifest(organizadorId),
    [organizadorId]
  );
  const isClubBranded = useMemo(
    () => isClubBrandedOrganizer(organizadorId),
    [organizadorId]
  );

  useEffect(() => {
    applyClubKeyToDocument(manifest.brandingKey);
    applyClubExperienceTheme(manifest);
    if (isClubBranded) {
      applyClubFavicon(manifest);
    }
    return () => {
      applyClubKeyToDocument("riviera");
      clearClubExperienceTheme();
    };
  }, [manifest, isClubBranded]);

  const value = useMemo(
    () => ({
      manifest,
      isClubBranded,
      organizadorId,
      brand: manifest,
      isCoBranded: isClubBranded,
    }),
    [manifest, isClubBranded, organizadorId]
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

/** Para vistas públicas futuras — anida experiencia sin cambiar el documento global. */
export const ClubExperienceScope: React.FC<ClubExperienceScopeProps> = ({
  organizadorId,
  children,
}) => {
  const manifest = useMemo(
    () => resolveClubManifest(organizadorId),
    [organizadorId]
  );
  const isClubBranded = useMemo(
    () => isClubBrandedOrganizer(organizadorId),
    [organizadorId]
  );

  const value = useMemo(
    () => ({
      manifest,
      isClubBranded,
      organizadorId: organizadorId ?? null,
      brand: manifest,
      isCoBranded: isClubBranded,
    }),
    [manifest, isClubBranded, organizadorId]
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
    const manifest = resolveClubManifest(null);
    return {
      manifest,
      isClubBranded: false,
      organizadorId: null,
      brand: manifest,
      isCoBranded: false,
    };
  }
  return ctx;
}

/** @deprecated Usar ClubExperienceProvider */
export const BrandProvider = ClubExperienceProvider;

/** @deprecated Usar ClubExperienceScope */
export const BrandScope = ClubExperienceScope;

/** @deprecated Usar useClubExperience */
export const useBrand = useClubExperience;
