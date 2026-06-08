import { normalizePlayerNameKey } from "../rivieraJugadores/playerNameKey";
import type { LigaJugador } from "./types";

function scoreLigaJugador(
  j: LigaJugador,
  opts?: { preferIds?: Set<string>; rivieraLinkedIds?: Set<string> }
): number {
  let s = 0;
  if (opts?.preferIds?.has(j.id)) s += 200;
  if (opts?.rivieraLinkedIds?.has(j.id)) s += 100;
  if (j.email?.trim()) s += 10;
  if (j.telefono?.trim()) s += 5;
  if (j.nivel != null) s += 2;
  return s;
}

/** Un jugador activo por nombre (para listados de liga). */
export function dedupeLigaJugadoresByName(
  jugadores: LigaJugador[],
  opts?: { preferIds?: string[]; rivieraLinkedIds?: string[] }
): LigaJugador[] {
  const preferIds = new Set(opts?.preferIds ?? []);
  const rivieraLinkedIds = new Set(opts?.rivieraLinkedIds ?? []);
  const byName = new Map<string, LigaJugador>();

  for (const j of jugadores) {
    const key = normalizePlayerNameKey(j.nombre);
    if (!key) continue;
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, j);
      continue;
    }
    const scoreOpts = { preferIds, rivieraLinkedIds };
    const prevScore = scoreLigaJugador(prev, scoreOpts);
    const nextScore = scoreLigaJugador(j, scoreOpts);
    if (
      nextScore > prevScore ||
      (nextScore === prevScore && j.created_at < prev.created_at)
    ) {
      byName.set(key, j);
    }
  }

  return Array.from(byName.values()).sort((a, b) =>
    a.nombre.localeCompare(b.nombre, "es")
  );
}

export function groupLigaJugadoresByName(
  jugadores: LigaJugador[]
): Map<string, LigaJugador[]> {
  const groups = new Map<string, LigaJugador[]>();
  for (const j of jugadores) {
    const key = normalizePlayerNameKey(j.nombre);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(j);
    groups.set(key, list);
  }
  return groups;
}
