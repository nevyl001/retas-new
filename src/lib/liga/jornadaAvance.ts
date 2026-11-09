/** Jornada en la que va la liga: la abierta, si no la próxima, si no la última jugada. */
export function jornadaEnLaQueVa(
  jornadas: ReadonlyArray<{ numero: number; estado: string }>
): number | null {
  const validas = jornadas.filter(
    (jornada) => Number.isInteger(jornada.numero) && jornada.numero >= 1
  );
  const enCurso = validas
    .filter((jornada) => jornada.estado === "in_progress")
    .sort((a, b) => a.numero - b.numero)[0];
  if (enCurso) return enCurso.numero;
  const proxima = validas
    .filter((jornada) => jornada.estado === "upcoming")
    .sort((a, b) => a.numero - b.numero)[0];
  if (proxima) return proxima.numero;
  const ultima = validas
    .filter((jornada) => jornada.estado === "completed")
    .sort((a, b) => b.numero - a.numero)[0];
  return ultima?.numero ?? null;
}
