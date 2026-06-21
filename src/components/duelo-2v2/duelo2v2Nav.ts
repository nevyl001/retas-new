import { navigateAppTo, normalizeAppPathname } from "../../lib/appRouting";

export function navigateDuelo2v2(path: string): void {
  navigateAppTo(normalizeAppPathname(path));
}

export function duelo2v2GestionarPath(id: string): string {
  return `/duelo-2v2/${id}/gestionar`;
}

export function publicDuelo2v2Path(id: string): string {
  return `/public/duelo-2v2/${id}`;
}

export function publicDuelo2v2Url(id: string): string {
  if (typeof window === "undefined") return publicDuelo2v2Path(id);
  return `${window.location.origin}${publicDuelo2v2Path(id)}`;
}
