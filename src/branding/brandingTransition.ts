import { brandingDevLog } from "./brandingDevLog";

export type BrandingTransitionReason =
  | "bootstrap"
  | "session-login"
  | "session-logout"
  | "session-restore"
  | "user-change";

let brandingTransitioning = false;
let brandingReady = false;
const transitionListeners = new Set<() => void>();

function notifyTransitionListeners(): void {
  transitionListeners.forEach((listener) => listener());
}

function syncTransitionDomClass(): void {
  if (typeof document === "undefined") return;

  if (brandingTransitioning) {
    document.documentElement.classList.add("branding-transitioning");
  } else {
    document.documentElement.classList.remove("branding-transitioning");
  }
}

export function getIsBrandingTransitioning(): boolean {
  return brandingTransitioning;
}

export function getIsBrandingReady(): boolean {
  return brandingReady;
}

export function subscribeBrandingTransition(listener: () => void): () => void {
  transitionListeners.add(listener);
  return () => {
    transitionListeners.delete(listener);
  };
}

export function beginBrandingTransition(reason: BrandingTransitionReason): void {
  brandingTransitioning = true;
  brandingReady = false;
  syncTransitionDomClass();
  brandingDevLog("transition:begin", { reason });
  notifyTransitionListeners();
}

export function endBrandingTransition(reason?: BrandingTransitionReason): void {
  brandingTransitioning = false;
  brandingReady = true;
  syncTransitionDomClass();
  brandingDevLog("transition:end", { reason });
  notifyTransitionListeners();
}

/** Bootstrap inicial completado sin transición de sesión activa. */
export function markBrandingBootstrapReady(): void {
  brandingReady = true;
  brandingTransitioning = false;
  syncTransitionDomClass();
  brandingDevLog("bootstrap:ready");
  notifyTransitionListeners();
}
