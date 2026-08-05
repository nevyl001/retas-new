import type { Duelo2v2 } from "./types";

/**
 * Nivel / fuerza que debe aparecer en la convocatoria de un Duelo 2v2.
 *
 * Contrato legado (ver types.ts): en `duelos_2v2` la columna `descripcion`
 * guarda el NIVEL (campo "Nivel" del editor, ej. "5ta Fuerza") y la columna
 * `categoria` guarda la DESCRIPCIÓN libre (ej. "Riviera Open").
 *
 * Incidente 2026-08-05: la convocatoria de WhatsApp tomaba `categoria` para la
 * línea que se imprime como "Nivel …", así que enviaba "Nivel Riviera Open"
 * en lugar de "Nivel 5ta Fuerza". Este helper existe para que el mapeo viva en
 * un solo lugar con test propio.
 */
export function dueloConvocatoriaNivel(
  duelo: Pick<Duelo2v2, "descripcion">
): string | undefined {
  return duelo.descripcion?.trim() || undefined;
}
