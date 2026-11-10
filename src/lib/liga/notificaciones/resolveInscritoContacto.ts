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
  /**
   * Evaluación canónica del servidor (`liga_notificacion_evaluar_correo`).
   * Ausente si el RPC todavía no expone la columna.
   */
  evalCorreo?: string | null;
}

export function mapContactoInscritoRow(row: {
  liga_jugador_id?: unknown;
  email?: unknown;
  telefono?: unknown;
  riviera_jugador_id?: unknown;
  identidad_global_id?: unknown;
  origen?: unknown;
  registro_autorizado_at?: unknown;
  eval_correo?: unknown;
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
  const evalCorreo =
    typeof row.eval_correo === "string" && row.eval_correo.trim()
      ? row.eval_correo.trim().toLowerCase()
      : null;
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
    evalCorreo,
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
 * Ambigüedad alineada con liga_notificacion_evaluar_correo:
 * - cuenta identidades globales distintas;
 * - si nadie tiene identidad global, cuenta rosters distintos;
 * - un roster sin global no inventa una segunda identidad cuando ya hay una global.
 */
export function contarPerfilesPorCorreo(
  filas: Array<{
    email: string | null;
    identidadGlobalId: string | null;
    jugadorId: string;
  }>
): Map<string, number> {
  const porCorreo = new Map<
    string,
    { globals: Set<string>; unlinked: Set<string> }
  >();
  for (const fila of filas) {
    const correo = normalizarCorreo(fila.email);
    if (!correo) continue;
    const mutable = porCorreo.get(correo) ?? {
      globals: new Set<string>(),
      unlinked: new Set<string>(),
    };
    const globalId = (fila.identidadGlobalId ?? "").trim();
    if (globalId) mutable.globals.add(globalId);
    else {
      const jugadorId = fila.jugadorId.trim();
      if (jugadorId) mutable.unlinked.add(jugadorId);
    }
    porCorreo.set(correo, mutable);
  }
  const counts = new Map<string, number>();
  for (const [correo, sets] of Array.from(porCorreo.entries())) {
    counts.set(
      correo,
      sets.globals.size > 0 ? sets.globals.size : sets.unlinked.size
    );
  }
  return counts;
}
