import { accrualKey, type RewardsModality } from "./campaigns";

export type ReviewEstado = "pendiente" | "aprobada" | "rechazada";
export type QueueEstado = "pendiente" | "acreditada" | "omitida" | "error";
export type ValidationSource = "admin" | "payment";

export interface Candidate {
  participacionId: string;
  organizadorId: string;
  jugadorId: string;
  tipoEvento: string;
  eventoId: string;
  modalidad: RewardsModality;
  /** Momento del cierre deportivo. No es el ranking. */
  closedAt: Date;
}

export interface CampaignRule {
  id: string;
  organizadorId: string;
  estado: "activa" | "pausada" | "programada" | "finalizada" | "borrador";
  acumulaDesde: Date;
  acumulaHasta: Date;
  puntosPorParticipacion: number;
  canjeDesde: Date;
  canjeHasta: Date;
  timeZone: string;
  modalidades: readonly RewardsModality[];
  /** Hoy solo `admin` acredita. `payment` queda reservado. */
  validationMode: ValidationSource;
}

export interface AccrualLot {
  id: string;
  key: string;
  participacionId: string;
  campaignId: string;
  jugadorId: string;
  points: number;
  remaining: number;
  /** Canjes ya registrados. No se borra si la participación se invalida. */
  canjeado: number;
  anulado: boolean;
  earnedAt: Date;
}

export interface Obligation {
  lotId: string;
  jugadorId: string;
  original: number;
  pending: number;
}

export interface LedgerLine {
  lotId: string;
  campaignId: string;
  tipo: "acreditacion" | "canje" | "reversion" | "compensacion" | "cierre";
  puntos: number;
}

export interface CampaignBalance {
  campaignId: string;
  fase: "acumulacion" | "canje" | "cerrada";
  acumulando: number;
  disponible: number;
  utilizado: number;
  cerrado: number;
}

export interface QueueItem {
  id: string;
  key: string;
  participacionId: string;
  campaignId: string;
  estado: QueueEstado;
  attempts: number;
  lastError: string | null;
  validationSource: ValidationSource;
}

export interface Review {
  participacionId: string;
  estado: ReviewEstado;
  campaignId: string | null;
  validationSource: ValidationSource | null;
}

export interface BenefitUse {
  id: string;
  redemptionId: string;
  jugadorId: string;
  participacionId: string | null;
  eventoId: string | null;
}

export interface EngineState {
  reviews: Map<string, Review>;
  queue: QueueItem[];
  lots: AccrualLot[];
  obligations: Obligation[];
  ledger: LedgerLine[];
  benefits: BenefitUse[];
  /** Claves ya acreditadas. Impide el segundo lote. */
  creditedKeys: Set<string>;
  failNextProcess: boolean;
}

export function emptyEngine(): EngineState {
  return {
    reviews: new Map(),
    queue: [],
    lots: [],
    obligations: [],
    ledger: [],
    benefits: [],
    creditedKeys: new Set(),
    failNextProcess: false,
  };
}

function keyOf(candidate: Candidate): string {
  return accrualKey({
    organizadorId: candidate.organizadorId,
    jugadorId: candidate.jugadorId,
    tipoEvento: candidate.tipoEvento,
    eventoId: candidate.eventoId,
  });
}

/** El cierre deportivo solo deja la participación pendiente de validar. */
export function enqueueCandidate(state: EngineState, candidate: Candidate): void {
  if (state.reviews.has(candidate.participacionId)) return;
  state.reviews.set(candidate.participacionId, {
    participacionId: candidate.participacionId,
    estado: "pendiente",
    campaignId: null,
    validationSource: null,
  });
}

export function approveParticipations(
  state: EngineState,
  input: {
    candidates: readonly Candidate[];
    campaign: CampaignRule;
    source?: ValidationSource;
  }
): QueueItem[] {
  if (input.campaign.validationMode === "payment" && input.source !== "payment") {
    throw new Error("Esta campaña espera validación de pago, que aún no está disponible");
  }
  if (input.campaign.estado !== "activa") {
    throw new Error("La campaña no está activa");
  }
  const source = input.source ?? "admin";
  if (source === "payment") {
    throw new Error("La validación automática por pago todavía no está conectada");
  }
  const created: QueueItem[] = [];
  for (const candidate of input.candidates) {
    if (candidate.organizadorId !== input.campaign.organizadorId) {
      throw new Error("La participación no pertenece a este club");
    }
    const review = state.reviews.get(candidate.participacionId);
    if (!review || review.estado === "rechazada") {
      throw new Error("La participación no está pendiente de validación");
    }
    if (review.estado === "aprobada") {
      const existing = state.queue.find((row) => row.participacionId === candidate.participacionId);
      if (existing) created.push(existing);
      continue;
    }
    review.estado = "aprobada";
    review.campaignId = input.campaign.id;
    review.validationSource = source;
    const item: QueueItem = {
      id: `q-${candidate.participacionId}`,
      key: keyOf(candidate),
      participacionId: candidate.participacionId,
      campaignId: input.campaign.id,
      estado: "pendiente",
      attempts: 0,
      lastError: null,
      validationSource: source,
    };
    state.queue.push(item);
    created.push(item);
    processQueue(state, { candidates: [candidate], campaigns: [input.campaign] });
  }
  return created;
}

export function assignFreeReta(
  state: EngineState,
  input: { redemptionId: string; jugadorId: string; participacionId: string; eventoId: string }
): void {
  const already = state.benefits.find(
    (row) => row.participacionId === input.participacionId
  );
  if (already) return;
  state.benefits.push({
    id: `b-${input.participacionId}`,
    redemptionId: input.redemptionId,
    jugadorId: input.jugadorId,
    participacionId: input.participacionId,
    eventoId: input.eventoId,
  });
}

function inWindow(candidate: Candidate, campaign: CampaignRule): boolean {
  const t = candidate.closedAt.getTime();
  return t >= campaign.acumulaDesde.getTime() && t < campaign.acumulaHasta.getTime();
}

/**
 * Procesa la cola. Un fallo deja la fila en `error` sin borrar la aprobación.
 * Reintentar es idempotente: la clave de participación no crea un segundo lote.
 */
export function processQueue(
  state: EngineState,
  input: { candidates: readonly Candidate[]; campaigns: readonly CampaignRule[] }
): void {
  const byParticipation = new Map(input.candidates.map((row) => [row.participacionId, row]));
  const byCampaign = new Map(input.campaigns.map((row) => [row.id, row]));

  for (const item of state.queue) {
    if (item.estado === "acreditada" || item.estado === "omitida") continue;
    const candidate = byParticipation.get(item.participacionId);
    const campaign = byCampaign.get(item.campaignId);
    item.attempts += 1;
    if (!candidate || !campaign) {
      item.estado = "error";
      item.lastError = "Falta la participación o la campaña";
      continue;
    }
    if (state.failNextProcess) {
      state.failNextProcess = false;
      item.estado = "error";
      item.lastError = "Falla temporal";
      continue;
    }
    if (state.benefits.some((row) => row.participacionId === candidate.participacionId)) {
      item.estado = "omitida";
      item.lastError = "Reta gratuita de Rewards";
      continue;
    }
    if (
      campaign.estado !== "activa" ||
      !campaign.modalidades.includes(candidate.modalidad) ||
      !inWindow(candidate, campaign)
    ) {
      item.estado = "omitida";
      item.lastError = "Fuera de campaña";
      continue;
    }
    if (state.creditedKeys.has(item.key)) {
      item.estado = "acreditada";
      item.lastError = null;
      continue;
    }
    const earnedAt = candidate.closedAt;
    const lot: AccrualLot = {
      id: `lot-${item.key}`,
      key: item.key,
      participacionId: candidate.participacionId,
      campaignId: campaign.id,
      jugadorId: candidate.jugadorId,
      points: campaign.puntosPorParticipacion,
      remaining: campaign.puntosPorParticipacion,
      canjeado: 0,
      anulado: false,
      earnedAt,
    };
    state.lots.push(lot);
    state.ledger.push({
      lotId: lot.id,
      campaignId: campaign.id,
      tipo: "acreditacion",
      puntos: lot.points,
    });
    compensateLot(state, lot);
    state.creditedKeys.add(item.key);
    item.estado = "acreditada";
    item.lastError = null;
  }
}

function compensateLot(state: EngineState, lot: AccrualLot): void {
  let left = lot.remaining;
  let done = 0;
  for (const obligation of state.obligations) {
    if (obligation.jugadorId !== lot.jugadorId || obligation.pending <= 0) continue;
    const take = Math.min(obligation.pending, left);
    obligation.pending -= take;
    left -= take;
    done += take;
    if (left === 0) break;
  }
  if (done === 0) return;
  lot.remaining = left;
  state.ledger.push({
    lotId: lot.id,
    campaignId: lot.campaignId,
    tipo: "compensacion",
    puntos: -done,
  });
}

/** Anula el lote. Conserva canjes y deja la deuda para acreditaciones futuras. */
export function invalidateParticipation(state: EngineState, participacionId: string): void {
  const lot = state.lots.find((row) => row.participacionId === participacionId);
  if (!lot || lot.anulado) return;
  if (lot.remaining > 0) {
    state.ledger.push({
      lotId: lot.id,
      campaignId: lot.campaignId,
      tipo: "reversion",
      puntos: -lot.remaining,
    });
    lot.remaining = 0;
  }
  lot.anulado = true;
  if (lot.canjeado > 0 && !state.obligations.some((row) => row.lotId === lot.id)) {
    state.obligations.push({
      lotId: lot.id,
      jugadorId: lot.jugadorId,
      original: lot.canjeado,
      pending: lot.canjeado,
    });
  }
}

export function campaignPhase(campaign: CampaignRule, now: Date): CampaignBalance["fase"] {
  if (now.getTime() >= campaign.canjeHasta.getTime()) return "cerrada";
  if (now.getTime() >= campaign.canjeDesde.getTime()) return "canje";
  return "acumulacion";
}

export function campaignBalance(
  state: EngineState,
  jugadorId: string,
  campaign: CampaignRule,
  now: Date
): CampaignBalance {
  const fase = campaignPhase(campaign, now);
  const mine = state.lots.filter(
    (lot) => lot.jugadorId === jugadorId && lot.campaignId === campaign.id && !lot.anulado
  );
  const remaining = mine.reduce((sum, lot) => sum + lot.remaining, 0);
  const utilizado = state.ledger
    .filter((line) => line.campaignId === campaign.id && line.tipo === "canje")
    .reduce((sum, line) => sum + -line.puntos, 0);
  const cerrado = state.ledger
    .filter((line) => line.campaignId === campaign.id && line.tipo === "cierre")
    .reduce((sum, line) => sum + -line.puntos, 0);
  return {
    campaignId: campaign.id,
    fase,
    acumulando: fase === "acumulacion" ? remaining : 0,
    disponible: fase === "canje" ? remaining : 0,
    utilizado,
    cerrado,
  };
}

/** Cierra los puntos no usados. No borra canjes ni mueve reservas ya descontadas. */
export function closeCampaign(state: EngineState, campaign: CampaignRule, now: Date): void {
  if (now.getTime() < campaign.canjeHasta.getTime()) return;
  for (const lot of state.lots) {
    if (lot.campaignId !== campaign.id || lot.anulado || lot.remaining <= 0) continue;
    state.ledger.push({
      lotId: lot.id,
      campaignId: campaign.id,
      tipo: "cierre",
      puntos: -lot.remaining,
    });
    lot.remaining = 0;
  }
}

export function redeem(
  state: EngineState,
  input: { jugadorId: string; campaign: CampaignRule; points: number; now: Date }
): void {
  if (campaignPhase(input.campaign, input.now) !== "canje") {
    throw new Error("La ventana de canje está cerrada");
  }
  const mine = state.lots
    .filter(
      (lot) =>
        lot.jugadorId === input.jugadorId &&
        lot.campaignId === input.campaign.id &&
        !lot.anulado &&
        lot.remaining > 0
    )
    .sort((a, b) => a.earnedAt.getTime() - b.earnedAt.getTime() || a.id.localeCompare(b.id));
  let left = input.points;
  const draws: { lot: AccrualLot; take: number }[] = [];
  for (const lot of mine) {
    if (left === 0) break;
    const take = Math.min(lot.remaining, left);
    draws.push({ lot, take });
    left -= take;
  }
  if (left > 0) throw new Error("Saldo insuficiente");
  for (const draw of draws) {
    draw.lot.remaining -= draw.take;
    draw.lot.canjeado += draw.take;
    state.ledger.push({
      lotId: draw.lot.id,
      campaignId: input.campaign.id,
      tipo: "canje",
      puntos: -draw.take,
    });
  }
}
