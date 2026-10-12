/** Modalidades de reta que pueden acumular Rewards. Torneo, liga y coaching no. */
export const REWARDS_MODALITIES = [
  "reta_equipos",
  "round_robin",
  "americano",
  "duelo_2v2",
] as const;

export type RewardsModality = (typeof REWARDS_MODALITIES)[number];

export type CampaignEstado =
  | "borrador"
  | "programada"
  | "activa"
  | "pausada"
  | "finalizada";

export interface CampaignWindow {
  id: string;
  organizadorId: string;
  estado: CampaignEstado;
  acumulaDesde: Date;
  acumulaHasta: Date;
  modalidades: readonly RewardsModality[];
}

const OCCUPIES = new Set<CampaignEstado>(["programada", "activa", "pausada"]);

export function windowsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/**
 * Dos campañas del mismo club no pueden premiar la misma modalidad
 * en ventanas de acumulación que se cruzan, salvo que una siga en borrador
 * o ya esté finalizada.
 */
export function campaignsConflict(a: CampaignWindow, b: CampaignWindow): boolean {
  if (a.id === b.id) return false;
  if (a.organizadorId !== b.organizadorId) return false;
  if (!OCCUPIES.has(a.estado) || !OCCUPIES.has(b.estado)) return false;
  if (!windowsOverlap(a.acumulaDesde, a.acumulaHasta, b.acumulaDesde, b.acumulaHasta)) {
    return false;
  }
  return a.modalidades.some((mode) => b.modalidades.includes(mode));
}

/** Copia reglas y deja la campaña nueva vacía. No arrastra lotes ni canjes. */
export function duplicateCampaign(
  source: CampaignWindow & { puntosPorParticipacion?: number },
  input: {
    id: string;
    acumulaDesde: Date;
    acumulaHasta: Date;
    estado?: CampaignEstado;
  }
): CampaignWindow {
  return {
    id: input.id,
    organizadorId: source.organizadorId,
    estado: input.estado ?? "borrador",
    acumulaDesde: input.acumulaDesde,
    acumulaHasta: input.acumulaHasta,
    modalidades: [...source.modalidades],
  };
}

export function accrualKey(input: {
  organizadorId: string;
  jugadorId: string;
  tipoEvento: string;
  eventoId: string;
}): string {
  return [
    input.organizadorId,
    input.jugadorId,
    input.tipoEvento,
    input.eventoId,
  ].join(":");
}
