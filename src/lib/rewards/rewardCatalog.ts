/**
 * Riviera Rewards — catálogo visible vs. premios canjeables (solo presentación).
 *
 * Separa dos conceptos que antes estaban mezclados en un único filtro:
 *   A. VISIBLE: premio activo de una campaña activa (acumulación o canje) del
 *      club administrado. Se muestra aunque el jugador tenga 0 puntos o la
 *      ventana de canje siga cerrada.
 *   B. CANJEABLE: además, campaña en ventana de canje, saldo DISPONIBLE
 *      suficiente, inventario, vigencia del premio y límite por jugador.
 *
 * Saldos: durante acumulación el progreso usa `acumulando`; durante canje se
 * usa exclusivamente `disponible`. Nunca se mezclan.
 *
 * Esto NO sustituye las validaciones del servidor (rewards_request_redemption
 * sigue siendo la autoridad); solo evita ofrecer en la UI lo que no procede.
 */
import type { BalanceRecord, CampaignRecord, RedemptionRecord, RewardRecord } from "./api";

export type CatalogPhase = "acumulacion" | "canje" | "cerrada";

export type RewardAvailabilityStatus =
  | "disponible"
  | "bloqueado"
  | "pendiente_canje"
  | "agotado"
  | "fuera_de_vigencia"
  | "limite_alcanzado";

export interface RewardAvailability {
  reward: RewardRecord;
  status: RewardAvailabilityStatus;
  canRedeem: boolean;
  /** Puntos usados para el progreso (acumulados en acumulación, disponibles en canje). */
  points: number;
  missing: number;
  reachedCost: boolean;
  progressPct: number;
}

export interface CampaignCatalog {
  campaign: CampaignRecord;
  phase: CatalogPhase;
  /** Qué saldo alimenta el progreso. */
  pointsSource: "acumulando" | "disponible";
  points: number;
  items: RewardAvailability[];
}

export interface FallbackCampaignBalance {
  campaign_id: string | null;
  acumulando: number;
  disponible: number;
  fase?: string | null;
}

/** Estados de canje que siguen contando contra el límite por jugador. */
const LIVE_REDEMPTION_STATES = new Set(["solicitado", "reservado", "entregado", "confirmado"]);

export function catalogPhase(
  campaign: Pick<CampaignRecord, "canje_desde" | "canje_hasta">,
  now: Date = new Date()
): CatalogPhase {
  const t = now.getTime();
  if (t >= new Date(campaign.canje_hasta).getTime()) return "cerrada";
  if (t >= new Date(campaign.canje_desde).getTime()) return "canje";
  return "acumulacion";
}

/**
 * Campañas cuyo catálogo debe mostrarse en la ficha: activas, del club
 * administrado y en acumulación o canje. Primero las que están en canje.
 */
export function catalogCampaigns(
  campaigns: CampaignRecord[],
  organizadorId: string,
  now: Date = new Date()
): CampaignRecord[] {
  return campaigns
    .filter(
      (campaign) =>
        (campaign.organizador_id ?? organizadorId) === organizadorId &&
        campaign.estado === "activa" &&
        catalogPhase(campaign, now) !== "cerrada"
    )
    .sort((a, b) => {
      const pa = catalogPhase(a, now) === "canje" ? 0 : 1;
      const pb = catalogPhase(b, now) === "canje" ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return new Date(a.acumula_desde).getTime() - new Date(b.acumula_desde).getTime();
    });
}

export function buildCampaignCatalog(input: {
  campaign: CampaignRecord;
  rewards: RewardRecord[];
  balances: BalanceRecord[];
  fallbackBalance?: FallbackCampaignBalance | null;
  redemptions?: RedemptionRecord[];
  organizadorId: string;
  now?: Date;
}): CampaignCatalog {
  const { campaign, rewards, balances, fallbackBalance = null, redemptions = [], organizadorId } = input;
  const now = input.now ?? new Date();
  const datePhase = catalogPhase(campaign, now);
  const balance = balances.find((row) => row.campaign_id === campaign.id) ?? null;
  const matchingFallback =
    !balance && fallbackBalance && fallbackBalance.campaign_id === campaign.id ? fallbackBalance : null;
  const reportedPhase = balance?.fase ?? matchingFallback?.fase ?? null;

  let phase: CatalogPhase;
  if (datePhase === "cerrada" || reportedPhase === "cerrada") {
    phase = "cerrada";
  } else if (datePhase === "canje" && (!reportedPhase || reportedPhase === "canje")) {
    phase = "canje";
  } else {
    phase = "acumulacion";
  }

  const pointsSource: CampaignCatalog["pointsSource"] = phase === "canje" ? "disponible" : "acumulando";
  const rawPoints = balance ? balance[pointsSource] : matchingFallback ? matchingFallback[pointsSource] : 0;
  const points = Math.max(0, Number(rawPoints) || 0);
  const campaignBelongs = (campaign.organizador_id ?? organizadorId) === organizadorId;
  const windowOpen = campaignBelongs && campaign.estado === "activa" && phase === "canje";

  const items = rewards
    .filter(
      (reward) =>
        campaignBelongs &&
        reward.estado === "activo" &&
        reward.campaign_id === campaign.id &&
        (reward.organizador_id ?? organizadorId) === organizadorId
    )
    .sort((a, b) => a.costo_puntos - b.costo_puntos || a.nombre.localeCompare(b.nombre, "es"))
    .map((reward): RewardAvailability => {
      const cost = Math.max(0, Number(reward.costo_puntos) || 0);
      const missing = Math.max(0, cost - points);
      const reachedCost = missing === 0;
      const progressPct = cost === 0 ? 100 : Math.min(100, Math.round((points / cost) * 100));

      const soldOut = reward.inventario_restante != null && reward.inventario_restante <= 0;
      const notYet = reward.disponible_desde != null && now.getTime() < new Date(reward.disponible_desde).getTime();
      const expired = reward.disponible_hasta != null && now.getTime() >= new Date(reward.disponible_hasta).getTime();
      const used = redemptions.filter(
        (item) => item.reward_id === reward.id && LIVE_REDEMPTION_STATES.has(item.estado)
      ).length;
      const limitReached = reward.limite_por_jugador != null && used >= reward.limite_por_jugador;

      let status: RewardAvailabilityStatus;
      if (soldOut) status = "agotado";
      else if (expired) status = "fuera_de_vigencia";
      else if (!reachedCost) status = "bloqueado";
      else if (!windowOpen || notYet) status = "pendiente_canje";
      else if (limitReached) status = "limite_alcanzado";
      else status = "disponible";

      return {
        reward,
        status,
        canRedeem: status === "disponible",
        points,
        missing,
        reachedCost,
        progressPct,
      };
    });

  return { campaign, phase, pointsSource, points, items };
}

export const REWARD_STATUS_LABELS: Record<RewardAvailabilityStatus, string> = {
  disponible: "Disponible",
  bloqueado: "Bloqueado",
  pendiente_canje: "Pendiente de apertura de canje",
  agotado: "Agotado",
  fuera_de_vigencia: "Fuera de vigencia",
  limite_alcanzado: "Límite alcanzado",
};

export function formatRewardOptionLabel(item: RewardAvailability): string {
  const base = `${item.reward.nombre} (${item.reward.costo_puntos} pts)`;
  if (item.canRedeem) return `${base} — Disponible`;
  if (item.status === "agotado") {
    return `${base} — Agotado${item.missing > 0 ? ` · Faltan ${item.missing} pts` : ""}`;
  }
  if (item.status === "bloqueado") {
    return `${base} — Bloqueado · Faltan ${item.missing} pts`;
  }
  return `${base} — ${REWARD_STATUS_LABELS[item.status]}`;
}

export function rewardStatusBadgeClass(status: RewardAvailabilityStatus): string {
  if (status === "disponible") return "rrw-badge rrw-badge--active";
  if (status === "pendiente_canje") return "rrw-badge rrw-badge--warning";
  if (status === "agotado") return "rrw-badge rrw-badge--danger";
  return "rrw-badge rrw-badge--ghost";
}

export function formatRewardProgressNote(item: RewardAvailability, phase: CatalogPhase): string {
  if (item.status === "agotado") {
    return item.missing > 0 ? `Faltan ${item.missing} pts · Agotado` : "Sin inventario disponible";
  }
  if (item.missing > 0) {
    return phase === "acumulacion"
      ? `Faltan ${item.missing} pts · Canje aún no abierto`
      : `Faltan ${item.missing} pts`;
  }
  if (item.status === "pendiente_canje") {
    return "Puntos cubiertos · Canje aún no abierto";
  }
  if (item.canRedeem) {
    return "Listo para canjear";
  }
  return REWARD_STATUS_LABELS[item.status];
}
