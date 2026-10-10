/**
 * Cruce del otro lado de la siguiente ronda, conservando local/visita.
 * En cuartos, 0 se cambia con 2 y 1 con 3.
 */
export function cruceDelOtroLado(
  cruceIndex: number,
  cruces: readonly number[]
): number | null {
  const half = Math.floor(cruceIndex / 2);
  const parity = cruceIndex % 2;
  const targetHalf = half === 0 ? 1 : 0;
  const sameParity = cruces.find(
    (cruce) =>
      cruce !== cruceIndex &&
      Math.floor(cruce / 2) === targetHalf &&
      cruce % 2 === parity
  );
  if (sameParity != null) return sameParity;
  return (
    cruces.find(
      (cruce) => cruce !== cruceIndex && Math.floor(cruce / 2) === targetHalf
    ) ?? null
  );
}
