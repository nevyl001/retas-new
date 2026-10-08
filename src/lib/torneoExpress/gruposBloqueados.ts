import { partidoTieneHistorial, type PartidoHistorialSource } from "./partidoHistorial";

export type GrupoBloqueoMotivo = "iniciado" | "retirada";

type GrupoRef = { id: string };
type ParejaRef = { activa?: boolean | null };

/**
 * Un grupo queda bloqueado para cambios de parejas si ya inició (algún partido
 * con resultado) o si tiene una pareja retirada. Los demás grupos se pueden
 * reacomodar sin afectar a los que ya están en juego.
 */
export function motivoBloqueoGrupo(
  partidos: readonly PartidoHistorialSource[],
  parejas: readonly ParejaRef[]
): GrupoBloqueoMotivo | null {
  if (partidos.some((partido) => partidoTieneHistorial(partido))) {
    return "iniciado";
  }
  if (parejas.some((pareja) => pareja.activa === false)) return "retirada";
  return null;
}

export function gruposBloqueados(
  grupos: readonly GrupoRef[],
  parejasPorGrupo: Record<string, readonly ParejaRef[]>,
  partidosPorGrupo: Record<string, readonly PartidoHistorialSource[]>
): Map<string, GrupoBloqueoMotivo> {
  const out = new Map<string, GrupoBloqueoMotivo>();
  for (const grupo of grupos) {
    const motivo = motivoBloqueoGrupo(
      partidosPorGrupo[grupo.id] ?? [],
      parejasPorGrupo[grupo.id] ?? []
    );
    if (motivo) out.set(grupo.id, motivo);
  }
  return out;
}

export function textoBloqueoGrupo(motivo: GrupoBloqueoMotivo): string {
  return motivo === "iniciado"
    ? "Ya inició: no se pueden cambiar sus parejas."
    : "Tiene una pareja retirada: no se pueden cambiar sus parejas.";
}
