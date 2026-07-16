/** Preferencias de lugar/cancha de convocatoria (reta/americano) en el cliente. */

export type ConvocatoriaLugarPrefs = {
  lugar: string;
  mostrarLugar: boolean;
  cancha: string;
};

function key(mode: string, entityId: string): string {
  return `convocatoria-lugar-prefs:${mode}:${entityId.trim()}`;
}

export function readConvocatoriaLugarPrefs(
  mode: string,
  entityId: string
): ConvocatoriaLugarPrefs | null {
  const id = entityId.trim();
  if (!id || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key(mode, id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      lugar: typeof parsed.lugar === "string" ? parsed.lugar.trim() : "",
      mostrarLugar: parsed.mostrarLugar !== false,
      cancha: typeof parsed.cancha === "string" ? parsed.cancha.trim() : "",
    };
  } catch {
    return null;
  }
}

export function writeConvocatoriaLugarPrefs(
  mode: string,
  entityId: string,
  prefs: ConvocatoriaLugarPrefs
): void {
  const id = entityId.trim();
  if (!id || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      key(mode, id),
      JSON.stringify({
        lugar: prefs.lugar.trim(),
        mostrarLugar: prefs.mostrarLugar !== false,
        cancha: prefs.cancha.trim(),
      })
    );
  } catch {
    /* ignore */
  }
}
