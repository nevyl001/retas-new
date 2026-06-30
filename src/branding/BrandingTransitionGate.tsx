import React, { useEffect, useReducer } from "react";
import {
  getIsBrandingReady,
  getIsBrandingTransitioning,
  subscribeBrandingTransition,
} from "./brandingTransition";

interface BrandingTransitionGateProps {
  children: React.ReactNode;
}

/**
 * Oculta la app mientras el branding de sesión se resuelve/aplica.
 * El splash visual lo controla `html.branding-transitioning` en index.html.
 */
export const BrandingTransitionGate: React.FC<BrandingTransitionGateProps> = ({
  children,
}) => {
  const [, revision] = useReducer((n: number) => n + 1, 0);

  useEffect(() => subscribeBrandingTransition(() => revision()), []);

  const isTransitioning = getIsBrandingTransitioning();
  const isReady = getIsBrandingReady();

  if (isTransitioning || !isReady) {
    return null;
  }

  return <>{children}</>;
};
