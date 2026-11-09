import {
  plantillaPorId,
  PLANTILLAS_COMUNICACION,
  type PlantillaComunicacion,
  type TipoComunicacionLiga,
} from "./comunicacionTemplates";

const TIPOS = new Set(PLANTILLAS_COMUNICACION.map((item) => item.id));

function clave(ligaId: string): string {
  return `ro-liga-plantillas:${ligaId}`;
}

export function plantillaParaRedactar(
  ligaId: string,
  id: string | null | undefined
): PlantillaComunicacion {
  const base = plantillaPorId(id);
  if (typeof localStorage === "undefined") return base;
  try {
    const raw = localStorage.getItem(clave(ligaId));
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Record<
      string,
      { asunto?: unknown; cuerpo?: unknown }
    >;
    const guardada = parsed?.[base.id];
    const asunto =
      typeof guardada?.asunto === "string" ? guardada.asunto.trim() : "";
    const cuerpo =
      typeof guardada?.cuerpo === "string" ? guardada.cuerpo.trim() : "";
    if (!asunto || !cuerpo) return base;
    return {
      ...base,
      asunto: asunto.slice(0, 180),
      cuerpo: cuerpo.slice(0, 8000),
    };
  } catch {
    return base;
  }
}

export function guardarPlantillaLiga(
  ligaId: string,
  id: TipoComunicacionLiga,
  asunto: string,
  cuerpo: string
): boolean {
  const asuntoLimpio = asunto.trim().slice(0, 180);
  const cuerpoLimpio = cuerpo.trim().slice(0, 8000);
  if (!TIPOS.has(id) || !asuntoLimpio || !cuerpoLimpio) return false;
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(clave(ligaId));
    const parsed = raw
      ? (JSON.parse(raw) as Record<string, { asunto: string; cuerpo: string }>)
      : {};
    parsed[id] = { asunto: asuntoLimpio, cuerpo: cuerpoLimpio };
    localStorage.setItem(clave(ligaId), JSON.stringify(parsed));
    return true;
  } catch {
    return false;
  }
}
