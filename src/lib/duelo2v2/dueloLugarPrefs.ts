/**
 * Preferencias de meta del duelo en el cliente (lugar + descripción libre).
 * Cache local; la SoT de descripción libre es `duelos_2v2.categoria` cuando exista.
 */

export type DueloLugarPrefs = {
  lugar: string;
  mostrarLugar: boolean;
  /** Descripción libre; el nivel/fuerza vive en `descripcion` BD. */
  categoria?: string;
};

function key(dueloId: string): string {
  return `duelo-2v2-lugar-prefs:${dueloId.trim()}`;
}

function storage(): Storage | null {
  if (typeof localStorage !== "undefined") return localStorage;
  if (typeof sessionStorage !== "undefined") return sessionStorage;
  return null;
}

export function readDueloLugarPrefs(dueloId: string): DueloLugarPrefs | null {
  const id = dueloId.trim();
  const store = storage();
  if (!id || !store) return null;
  try {
    const raw = store.getItem(key(id));
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        lugar: typeof parsed.lugar === "string" ? parsed.lugar.trim() : "",
        mostrarLugar: parsed.mostrarLugar !== false,
        categoria:
          typeof parsed.categoria === "string" ? parsed.categoria.trim() : "",
      };
    }
    // Migrar cache legacy de sessionStorage → localStorage
    if (typeof sessionStorage !== "undefined" && store !== sessionStorage) {
      const legacySession = sessionStorage.getItem(key(id));
      if (legacySession) {
        store.setItem(key(id), legacySession);
        sessionStorage.removeItem(key(id));
        return readDueloLugarPrefs(id);
      }
    }
    // legacy key solo texto
    const legacy =
      store.getItem(`duelo-2v2-lugar:${id}`)?.trim() ||
      (typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem(`duelo-2v2-lugar:${id}`)?.trim()
        : "") ||
      "";
    if (legacy) return { lugar: legacy, mostrarLugar: true, categoria: "" };
  } catch {
    /* ignore */
  }
  return null;
}

export function writeDueloLugarPrefs(
  dueloId: string,
  prefs: DueloLugarPrefs
): void {
  const id = dueloId.trim();
  const store = storage();
  if (!id || !store) return;
  try {
    const prev = readDueloLugarPrefs(id);
    const categoria =
      prefs.categoria !== undefined
        ? prefs.categoria.trim()
        : (prev?.categoria || "").trim();
    store.setItem(
      key(id),
      JSON.stringify({
        lugar: prefs.lugar.trim(),
        mostrarLugar: prefs.mostrarLugar !== false,
        categoria,
      })
    );
  } catch {
    /* ignore */
  }
}

export function resolveDueloLugarForShare(
  duelo: { id: string; lugar?: string | null; mostrar_lugar?: boolean | null },
  fallbackClubName: string
): { lugar: string | null; includeLugar: boolean } {
  const prefs = readDueloLugarPrefs(duelo.id);
  const lugar =
    (duelo.lugar?.trim() || prefs?.lugar || fallbackClubName).trim() || null;
  const includeLugar =
    duelo.mostrar_lugar != null
      ? duelo.mostrar_lugar !== false
      : prefs
        ? prefs.mostrarLugar !== false
        : Boolean(lugar);
  return {
    lugar: includeLugar ? lugar : null,
    includeLugar,
  };
}
