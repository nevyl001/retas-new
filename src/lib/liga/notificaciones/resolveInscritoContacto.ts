/**
 * Resolución de contacto de inscritos vía identidad global (Riviera ID / cesión).
 * El panel de notificaciones no debe depender solo de liga_jugadores.email.
 */

import { normalizarCorreo } from "./bienvenidaPolicy";

export type ContactoInscritoOrigen =
  | "global_source"
  | "global_local"
  | "liga"
  | "ninguno";

export interface ContactoInscritoResuelto {
  ligaJugadorId: string;
  email: string | null;
  telefono: string | null;
  rivieraJugadorId: string | null;
  identidadGlobalId: string | null;
  origen: ContactoInscritoOrigen;
  /** Alta del Riviera ID. Ausente hasta 0107, o si solo hay correo de roster. */
  registroAutorizadoAt: string | null;
}

export function mapContactoInscritoRow(row: {
  liga_jugador_id?: unknown;
  email?: unknown;
  telefono?: unknown;
  riviera_jugador_id?: unknown;
  identidad_global_id?: unknown;
  origen?: unknown;
  registro_autorizado_at?: unknown;
}): ContactoInscritoResuelto | null {
  const ligaJugadorId =
    typeof row.liga_jugador_id === "string" ? row.liga_jugador_id.trim() : "";
  if (!ligaJugadorId) return null;
  const origenRaw =
    typeof row.origen === "string" ? row.origen.trim().toLowerCase() : "ninguno";
  const origen: ContactoInscritoOrigen =
    origenRaw === "global_source" ||
    origenRaw === "global_local" ||
    origenRaw === "liga"
      ? origenRaw
      : "ninguno";
  return {
    ligaJugadorId,
    email: normalizarCorreo(
      typeof row.email === "string" ? row.email : null
    ),
    telefono:
      typeof row.telefono === "string" && row.telefono.trim()
        ? row.telefono.trim()
        : null,
    rivieraJugadorId:
      typeof row.riviera_jugador_id === "string"
        ? row.riviera_jugador_id
        : null,
    identidadGlobalId:
      typeof row.identidad_global_id === "string"
        ? row.identidad_global_id
        : null,
    origen,
    registroAutorizadoAt:
      typeof row.registro_autorizado_at === "string" &&
      row.registro_autorizado_at.trim()
        ? row.registro_autorizado_at.trim()
        : null,
  };
}

/**
 * Elige el correo visible: global resuelto gana sobre local vacío.
 * No inventa. No marca verificado ni consentimiento.
 */
export function correoEfectivoDestinatario(input: {
  emailLocal: string | null | undefined;
  emailGlobal: string | null | undefined;
}): string | null {
  const global = normalizarCorreo(input.emailGlobal);
  if (global) return global;
  return normalizarCorreo(input.emailLocal);
}

/**
 * Ambigüedad solo entre identidades globales distintas.
 * Roster + ficha del mismo jugador no cuenta como dos perfiles.
 */
export function contarPerfilesPorCorreo(
  filas: Array<{
    email: string | null;
    identidadGlobalId: string | null;
    jugadorId: string;
  }>
): Map<string, number> {
  const porCorreo = new Map<string, Set<string>>();
  for (const fila of filas) {
    const correo = normalizarCorreo(fila.email);
    if (!correo) continue;
    const identidad = (fila.identidadGlobalId ?? fila.jugadorId).trim();
    if (!identidad) continue;
    const set = porCorreo.get(correo) ?? new Set<string>();
    set.add(identidad);
    porCorreo.set(correo, set);
  }
  const counts = new Map<string, number>();
  for (const [correo, set] of Array.from(porCorreo.entries())) {
    counts.set(correo, set.size);
  }
  return counts;
}
