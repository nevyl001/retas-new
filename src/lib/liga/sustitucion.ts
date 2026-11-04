import type { LigaJornada, LigaPartido } from "./types";

export type LigaSustitucionMotivoCategoria =
  | "lesion"
  | "baja"
  | "ausencia"
  | "otro";

export const LIGA_SUSTITUCION_MOTIVO_OPTIONS: Array<{
  id: LigaSustitucionMotivoCategoria;
  label: string;
}> = [
  { id: "lesion", label: "Lesión" },
  { id: "baja", label: "Baja definitiva" },
  { id: "ausencia", label: "Ausencia prolongada" },
  { id: "otro", label: "Otro motivo" },
];

export function partidoTieneResultadoRegistrado(
  partido: Pick<
    LigaPartido,
    "estado" | "score_pareja1" | "score_pareja2" | "set_scores"
  >
): boolean {
  if (partido.estado === "completed") return true;
  if (partido.score_pareja1 != null || partido.score_pareja2 != null) return true;
  if (partido.set_scores != null) return true;
  return false;
}

/** Jornadas desde las que se puede ingresar un sustituto (sin resultados futuros). */
export function listJornadasElegiblesSustitucion(
  jornadas: ReadonlyArray<
    Pick<LigaJornada, "id" | "numero" | "estado" | "partidos" | "parejas">
  >,
  fromJugadorId: string
): Array<{ id: string; numero: number; label: string }> {
  const sorted = [...jornadas].sort((a, b) => a.numero - b.numero);
  const eligible: Array<{ id: string; numero: number; label: string }> = [];

  for (const j of sorted) {
    if (j.estado === "completed") continue;

    const pairs = (j.parejas ?? []).filter(
      (p) =>
        p.jugador1_id === fromJugadorId || p.jugador2_id === fromJugadorId
    );
    if (pairs.length === 0) {
      // Sin pareja del saliente: aún puede ser jornada de ingreso (p.ej. aún no generada)
      // Solo incluir si no hay resultados en la jornada completa (segura).
      const anyResult = (j.partidos ?? []).some(partidoTieneResultadoRegistrado);
      if (anyResult) continue;
      eligible.push({
        id: j.id,
        numero: j.numero,
        label: `Jornada ${j.numero}`,
      });
      continue;
    }

    const pairIds = new Set(pairs.map((p) => p.id));
    const conflict = (j.partidos ?? []).some(
      (partido) =>
        (pairIds.has(partido.pareja1_id) || pairIds.has(partido.pareja2_id)) &&
        partidoTieneResultadoRegistrado(partido)
    );
    if (conflict) continue;

    eligible.push({
      id: j.id,
      numero: j.numero,
      label: `Jornada ${j.numero}`,
    });
  }

  return eligible;
}

export function pickDefaultJornadaSustitucionId(
  elegibles: ReadonlyArray<{ id: string; numero: number }>
): string | null {
  if (elegibles.length === 0) return null;
  return [...elegibles].sort((a, b) => a.numero - b.numero)[0]!.id;
}

export function formatPuntosLigaDesglose(
  total: number,
  heredados: number
): { total: number; heredados: number; propios: number } {
  const h = Math.max(0, Math.round(heredados));
  const t = Math.max(0, Math.round(total));
  return {
    total: t,
    heredados: h,
    propios: Math.max(0, t - h),
  };
}
