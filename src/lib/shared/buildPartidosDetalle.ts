/** Snapshot inmutable partido a partido (historial público). */

export type PartidoDetalleResultado = "win" | "loss" | "draw";

export interface PartidoDetalle {
  id?: string;
  ronda: number;
  fase?: string;
  rival: string;
  games_favor: number;
  games_contra: number;
  resultado: PartidoDetalleResultado;
  fecha: string;
}

export function resultadoFromScores(
  favor: number,
  contra: number
): PartidoDetalleResultado {
  if (favor > contra) return "win";
  if (contra > favor) return "loss";
  return "draw";
}

export function formatRivalPair(name1: string, name2: string): string {
  const n1 = name1?.trim() || "?";
  const n2 = name2?.trim() || "?";
  return `${n1} / ${n2}`;
}

export function parsePartidosDetalle(raw: unknown): PartidoDetalle[] {
  if (!Array.isArray(raw)) return [];
  const out: PartidoDetalle[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const ronda = Number(row.ronda);
    const gamesFavor = Number(row.games_favor);
    const gamesContra = Number(row.games_contra);
    const resultado = row.resultado;
    if (
      !Number.isFinite(ronda) ||
      !Number.isFinite(gamesFavor) ||
      !Number.isFinite(gamesContra) ||
      (resultado !== "win" && resultado !== "loss" && resultado !== "draw")
    ) {
      continue;
    }
    out.push({
      id: typeof row.id === "string" ? row.id : undefined,
      ronda,
      fase: typeof row.fase === "string" ? row.fase : undefined,
      rival: typeof row.rival === "string" ? row.rival : "Rival",
      games_favor: gamesFavor,
      games_contra: gamesContra,
      resultado,
      fecha: typeof row.fecha === "string" ? row.fecha : "",
    });
  }
  return out;
}

export function summarizePartidosDetalle(detalle: PartidoDetalle[]): {
  ganados: number;
  perdidos: number;
  empatados: number;
  jugados: number;
  setsFavor: number;
  setsContra: number;
} {
  let ganados = 0;
  let perdidos = 0;
  let empatados = 0;
  let setsFavor = 0;
  let setsContra = 0;
  for (const p of detalle) {
    if (p.resultado === "win") ganados += 1;
    else if (p.resultado === "loss") perdidos += 1;
    else empatados += 1;
    setsFavor += p.games_favor;
    setsContra += p.games_contra;
  }
  return {
    ganados,
    perdidos,
    empatados,
    jugados: detalle.length,
    setsFavor,
    setsContra,
  };
}

/** Etiqueta ronda RR / remontada (retas). */
export function labelRetaRonda(
  ronda: number,
  regularRoundsMax?: number | null
): string {
  if (
    regularRoundsMax != null &&
    regularRoundsMax > 0 &&
    ronda > regularRoundsMax
  ) {
    const playoffIdx = ronda - regularRoundsMax;
    if (playoffIdx === 1) return "Semifinal";
    return "Final";
  }
  return `Ronda ${ronda}`;
}

/**
 * Fusiona metadata preservando partidos_detalle existente si ya tiene filas
 * (salvo force). Recalcula totales G/P/E desde el detalle final.
 */
export function mergeMetadataWithPartidosDetalle(
  existingMeta: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
  partidosDetalle: PartidoDetalle[],
  opts?: { force?: boolean }
): Record<string, unknown> {
  const prev = existingMeta && typeof existingMeta === "object" ? existingMeta : {};
  const prevDetalle = parsePartidosDetalle(prev.partidos_detalle);
  const useExisting = !opts?.force && prevDetalle.length > 0;
  const detalle =
    useExisting ? prevDetalle : partidosDetalle.length > 0 ? partidosDetalle : prevDetalle;

  const merged: Record<string, unknown> = { ...prev, ...patch };
  if (detalle.length > 0) {
    merged.partidos_detalle = detalle;
    const s = summarizePartidosDetalle(detalle);
    merged.partidos_ganados = s.ganados;
    merged.partidos_perdidos = s.perdidos;
    merged.partidos_empatados = s.empatados;
    merged.partidos_jugados = s.jugados;
  }
  return merged;
}

export function enrichMetadataWithPartidosDetalle(
  metadata: Record<string, unknown>,
  partidosDetalle: PartidoDetalle[]
): Record<string, unknown> {
  if (partidosDetalle.length === 0) return metadata;
  return mergeMetadataWithPartidosDetalle(null, metadata, partidosDetalle);
}
