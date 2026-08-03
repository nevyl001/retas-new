/**
 * Preferencia de UI: panel «Lanzar convocatoria» abierto/cerrado por duelo.
 * Independiente de si la convocatoria ya está publicada (live).
 */

function key(dueloId: string): string {
  return `duelo-2v2-conv-panel-open:${dueloId.trim()}`;
}

function storage(): Storage | null {
  if (typeof localStorage !== "undefined") return localStorage;
  if (typeof sessionStorage !== "undefined") return sessionStorage;
  return null;
}

export function readDueloConvocatoriaPanelOpen(dueloId: string): boolean {
  const id = dueloId.trim();
  const store = storage();
  if (!id || !store) return false;
  try {
    return store.getItem(key(id)) === "1";
  } catch {
    return false;
  }
}

export function writeDueloConvocatoriaPanelOpen(
  dueloId: string,
  open: boolean
): void {
  const id = dueloId.trim();
  const store = storage();
  if (!id || !store) return;
  try {
    store.setItem(key(id), open ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}
