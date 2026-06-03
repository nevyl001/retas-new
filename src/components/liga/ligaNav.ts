import { navigateAppTo, normalizeAppPathname } from "../../lib/appRouting";

export function navigateLiga(path: string): void {
  navigateAppTo(normalizeAppPathname(path));
}

export function ligaGestionarPath(ligaId: string): string {
  return `/liga/${ligaId}/gestionar`;
}

export function ligaJornadaPath(ligaId: string, numero: number): string {
  return `/liga/${ligaId}/jornada/${numero}`;
}

export function publicLigaPath(ligaId: string): string {
  return `/public/liga/${ligaId}`;
}

export function publicLigaJornadaPath(ligaId: string, numero: number): string {
  return `/public/liga/${ligaId}/jornada/${numero}`;
}

export function publicLigaJornadaUrl(ligaId: string, numero: number): string {
  if (typeof window === "undefined") {
    return publicLigaJornadaPath(ligaId, numero);
  }
  return `${window.location.origin}${publicLigaJornadaPath(ligaId, numero)}`;
}
