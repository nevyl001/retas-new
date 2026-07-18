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

/**
 * Un jugador por `liga_jugadores.id`. Homónimos con IDs distintos se conservan.
 */
export function dedupeLigaJugadoresById(
  jugadores: LigaJugador[],
  opts?: { preferIds?: string[]; rivieraLinkedIds?: string[] }
): LigaJugador[] {
  const preferIds = new Set(opts?.preferIds ?? []);
  const rivieraLinkedIds = new Set(opts?.rivieraLinkedIds ?? []);
  const byId = new Map<string, LigaJugador>();

  for (const j of jugadores) {
    const id = j.id?.trim();
    if (!id) continue;
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, j);
      continue;
    }
    const scoreOpts = { preferIds, rivieraLinkedIds };
    const prevScore = scoreLigaJugador(prev, scoreOpts);
    const nextScore = scoreLigaJugador(j, scoreOpts);
    if (
      nextScore > prevScore ||
      (nextScore === prevScore && j.created_at < prev.created_at)
    ) {
      byId.set(id, j);
    }
  }

  return Array.from(byId.values()).sort((a, b) =>
    a.nombre.localeCompare(b.nombre, "es")
  );
}

/** @deprecated Use dedupeLigaJugadoresById — no dedupe por nombre. */
export const dedupeLigaJugadoresByName = dedupeLigaJugadoresById;

/** Agrupa por id (diagnóstico). No fusiona homónimos. */
export function groupLigaJugadoresById(
  jugadores: LigaJugador[]
): Map<string, LigaJugador[]> {
  const groups = new Map<string, LigaJugador[]>();
  for (const j of jugadores) {
    const id = j.id?.trim();
    if (!id) continue;
    const list = groups.get(id) ?? [];
    list.push(j);
    groups.set(id, list);
  }
  return groups;
}

/** @deprecated Use groupLigaJugadoresById */
export const groupLigaJugadoresByName = groupLigaJugadoresById;
