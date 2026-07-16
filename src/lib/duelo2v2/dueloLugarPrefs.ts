/** Preferencias de lugar del duelo en el cliente (fallback si falta columna SQL). */

export type DueloLugarPrefs = {
  lugar: string;
  mostrarLugar: boolean;
};

function key(dueloId: string): string {
  return `duelo-2v2-lugar-prefs:${dueloId.trim()}`;
}

export function readDueloLugarPrefs(dueloId: string): DueloLugarPrefs | null {
  const id = dueloId.trim();
  if (!id || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key(id));
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        lugar: typeof parsed.lugar === "string" ? parsed.lugar.trim() : "",
        mostrarLugar: parsed.mostrarLugar !== false,
      };
    }
    // legacy key solo texto
    const legacy = sessionStorage.getItem(`duelo-2v2-lugar:${id}`)?.trim();
    if (legacy) return { lugar: legacy, mostrarLugar: true };
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
  if (!id || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      key(id),
      JSON.stringify({
        lugar: prefs.lugar.trim(),
        mostrarLugar: prefs.mostrarLugar !== false,
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
