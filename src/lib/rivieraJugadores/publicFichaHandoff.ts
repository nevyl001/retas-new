/**
 * Handoff ligero ranking → ficha pública (sessionStorage, TTL corto).
 * Evita re-pedir nombre/foto/categoría/#/puntos solo para pintar el hero.
 * Deep-link sin handoff sigue funcionando vía red.
 *
 * Idempotente durante TTL: StrictMode remount puede leer el mismo handoff
 * sin perderlo (peek). clearPublicFichaHandoff al confirmar perfil cargado.
 */
import type { RivieraJugadorGenero } from "./genero";
import type { RivieraJugadorCategoria } from "./types";

export type PublicFichaHandoff = {
  jugadorId: string;
  organizadorId: string;
  nombre: string;
  fotoUrl: string | null;
  categoria: RivieraJugadorCategoria | string;
  genero: RivieraJugadorGenero | string | null;
  posicion: number | null;
  puntosClub: number | null;
  rivieraId: string | null;
  savedAt: number;
};

const PREFIX = "riviera_public_ficha_handoff:";
const TTL_MS = 5 * 60 * 1000;

function storageKey(organizadorId: string, jugadorId: string): string {
  return `${PREFIX}${organizadorId.trim()}:${jugadorId.trim()}`;
}

function parseHandoff(
  raw: string,
  organizadorId: string,
  jugadorId: string
): PublicFichaHandoff | null {
  try {
    const parsed = JSON.parse(raw) as PublicFichaHandoff;
    if (!parsed?.jugadorId || parsed.jugadorId !== jugadorId) return null;
    if (!parsed.organizadorId || parsed.organizadorId !== organizadorId) return null;
    if (!Number.isFinite(parsed.savedAt) || Date.now() - parsed.savedAt > TTL_MS) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function savePublicFichaHandoff(
  payload: Omit<PublicFichaHandoff, "savedAt">
): void {
  if (typeof window === "undefined") return;
  const org = payload.organizadorId.trim();
  const id = payload.jugadorId.trim();
  if (!org || !id) return;
  try {
    const row: PublicFichaHandoff = { ...payload, savedAt: Date.now() };
    sessionStorage.setItem(storageKey(org, id), JSON.stringify(row));
  } catch {
    /* quota / private mode */
  }
}

/** Lee handoff sin consumir (idempotente durante TTL). */
export function peekPublicFichaHandoff(
  organizadorId: string | null | undefined,
  jugadorId: string | null | undefined
): PublicFichaHandoff | null {
  if (typeof window === "undefined") return null;
  const org = organizadorId?.trim();
  const id = jugadorId?.trim();
  if (!org || !id) return null;
  const key = storageKey(org, id);
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = parseHandoff(raw, org, id);
    if (!parsed) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Alias idempotente: StrictMode-safe. Preferir peek; take no borra durante TTL. */
export function takePublicFichaHandoff(
  organizadorId: string | null | undefined,
  jugadorId: string | null | undefined
): PublicFichaHandoff | null {
  return peekPublicFichaHandoff(organizadorId, jugadorId);
}

/** Limpia handoff tras perfil confirmado (o al salir). */
export function clearPublicFichaHandoff(
  organizadorId: string | null | undefined,
  jugadorId: string | null | undefined
): void {
  if (typeof window === "undefined") return;
  const org = organizadorId?.trim();
  const id = jugadorId?.trim();
  if (!org || !id) return;
  try {
    sessionStorage.removeItem(storageKey(org, id));
  } catch {
    /* ignore */
  }
}
