/**
 * El ajuste del club es un total oficial. Las jornadas siguientes suman
 * encima de ese total: el delta se conserva y no se vuelve a calcular
 * desde los juegos anteriores al ajuste.
 */
export function deltaAjusteDesdeTotal(input: {
  totalDeseado: number;
  puntosPartidos: number;
  puntosHeredados: number;
}): number {
  const base =
    Math.max(0, input.puntosPartidos) + Math.max(0, input.puntosHeredados);
  return Math.round(input.totalDeseado) - base;
}

export function puntosOficialesConAjuste(input: {
  puntosPartidos: number;
  puntosHeredados: number;
  ajusteDelta: number;
}): number {
  const total =
    Math.max(0, input.puntosPartidos) +
    Math.max(0, input.puntosHeredados) +
    Math.trunc(input.ajusteDelta);
  return Math.max(0, total);
}
