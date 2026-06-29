import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { useUser } from "../contexts/UserContext";
import { resolveBrand, isCoBrandedOrganizer } from "./brandResolver";
import {
  applyBrandFavicon,
  applyBrandThemeTokens,
  clearBrandThemeTokens,
} from "./applyBrandTheme";
import type { BrandConfig } from "./types";

interface BrandContextValue {
  brand: BrandConfig;
  isCoBranded: boolean;
  organizadorId: string | null;
}

const BrandContext = createContext<BrandContextValue | undefined>(undefined);

function applyBrandToDocument(brandKey: string): void {
  document.documentElement.setAttribute("data-brand", brandKey);
}

interface BrandProviderProps {
  children: React.ReactNode;
}

/** Resuelve marca por sesión del organizador logueado (user.id). */
export const BrandProvider: React.FC<BrandProviderProps> = ({ children }) => {
  const { user } = useUser();
  const organizadorId = user?.id ?? null;

  const brand = useMemo(() => resolveBrand(organizadorId), [organizadorId]);
  const isCoBranded = useMemo(
    () => isCoBrandedOrganizer(organizadorId),
    [organizadorId]
  );

  useEffect(() => {
    applyBrandToDocument(brand.key);
    applyBrandThemeTokens(brand);
    if (isCoBranded) {
      applyBrandFavicon(brand);
    }
    return () => {
      applyBrandToDocument("riviera");
      clearBrandThemeTokens();
    };
  }, [brand, isCoBranded]);

  const value = useMemo(
    () => ({ brand, isCoBranded, organizadorId }),
    [brand, isCoBranded, organizadorId]
  );

  return (
    <BrandContext.Provider value={value}>{children}</BrandContext.Provider>
  );
};

interface BrandScopeProps {
  organizadorId: string | null | undefined;
  children: React.ReactNode;
}

/** Para vistas públicas (fases futuras) — anida marca sin cambiar el documento global. */
export const BrandScope: React.FC<BrandScopeProps> = ({
  organizadorId,
  children,
}) => {
  const brand = useMemo(() => resolveBrand(organizadorId), [organizadorId]);
  const isCoBranded = useMemo(
    () => isCoBrandedOrganizer(organizadorId),
    [organizadorId]
  );

  const value = useMemo(
    () => ({
      brand,
      isCoBranded,
      organizadorId: organizadorId ?? null,
    }),
    [brand, isCoBranded, organizadorId]
  );

  return (
    <BrandContext.Provider value={value}>
      <div data-brand={brand.key} className="brand-scope">
        {children}
      </div>
    </BrandContext.Provider>
  );
};

export function useBrand(): BrandContextValue {
  const ctx = useContext(BrandContext);
  if (!ctx) {
    return {
      brand: resolveBrand(null),
      isCoBranded: false,
      organizadorId: null,
    };
  }
  return ctx;
}
