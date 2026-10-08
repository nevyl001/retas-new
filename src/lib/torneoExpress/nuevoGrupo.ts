import { generateBalancedRoundRobin } from "./roundRobin";

/**
 * Reglas puras para crear un grupo nuevo con la fase de grupos ya iniciada.
 * Sin Supabase: solo nombres, orden y round robin.
 */

export const NUEVO_GRUPO_MIN_PAREJAS = 2;
export const NUEVO_GRUPO_NOMBRE_MAX = 80;

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function normalizeNombre(nombre: string): string {
  return nombre.trim().replace(/\s+/g, " ").toLowerCase();
}

/** «Grupo D» si ya existen A–C; si los nombres son otros, continúa por cantidad. */
export function nextGrupoNombre(existingNames: readonly string[]): string {
  const used = new Set(existingNames.map(normalizeNombre));
  let maxLetter = -1;
  for (const name of existingNames) {
    const match = name.trim().match(/^grupo\s+([a-z])$/i);
    if (!match) continue;
    maxLetter = Math.max(maxLetter, LETRAS.indexOf(match[1]!.toUpperCase()));
  }

  let index = maxLetter >= 0 ? maxLetter + 1 : existingNames.length;
  for (let guard = 0; guard < 200; guard += 1, index += 1) {
    const candidate =
      index < LETRAS.length
        ? `Grupo ${LETRAS[index]}`
        : `Grupo ${index + 1}`;
    if (!used.has(normalizeNombre(candidate))) return candidate;
  }
  return `Grupo ${existingNames.length + 1}`;
}

export function nextGrupoOrden(ordenes: readonly number[]): number {
  return ordenes.length === 0 ? 1 : Math.max(...ordenes) + 1;
}

/** null si es válido; si no, el mensaje para mostrar. */
export function validateNuevoGrupo(input: {
  nombre: string;
  existingNames: readonly string[];
  parejaCount: number;
}): string | null {
  const nombre = input.nombre.trim();
  if (!nombre) return "Escribe el nombre del grupo.";
  if (nombre.length > NUEVO_GRUPO_NOMBRE_MAX) {
    return `El nombre admite hasta ${NUEVO_GRUPO_NOMBRE_MAX} caracteres.`;
  }
  const taken = new Set(input.existingNames.map(normalizeNombre));
  if (taken.has(normalizeNombre(nombre))) {
    return "Ya existe un grupo con ese nombre.";
  }
  if (input.parejaCount < NUEVO_GRUPO_MIN_PAREJAS) {
    return `El grupo necesita al menos ${NUEVO_GRUPO_MIN_PAREJAS} parejas.`;
  }
  return null;
}

export type NuevoGrupoPartidoRow = {
  pareja_local_id: string;
  pareja_visitante_id: string;
  estado: "pendiente";
  ronda: number;
  orden: number;
  cancha: null;
  programado_en: null;
};

/** Todos contra todos del grupo nuevo, sin día ni cancha (se programan después). */
export function buildNuevoGrupoPartidos(
  parejaIds: readonly string[]
): NuevoGrupoPartidoRow[] {
  return generateBalancedRoundRobin([...parejaIds]).map((m) => ({
    pareja_local_id: m.localId,
    pareja_visitante_id: m.visitanteId,
    estado: "pendiente" as const,
    ronda: m.ronda,
    orden: m.orden,
    cancha: null,
    programado_en: null,
  }));
}
