import type { CampaignEstado, RewardsModality } from "./campaigns";

export const MODALITY_LABELS: Record<RewardsModality, string> = {
  reta_equipos: "Reta por equipos",
  round_robin: "Round robin",
  americano: "Americano",
  duelo_2v2: "Duelo 2v2",
};

export const REWARD_TYPES = [
  "reta_gratis",
  "clase_grupal",
  "producto",
  "paquete",
  "descuento_fijo",
  "descuento_porcentaje",
  "personalizado",
] as const;

export type RewardType = (typeof REWARD_TYPES)[number];

export const REWARD_TYPE_LABELS: Record<RewardType, string> = {
  reta_gratis: "Reta gratuita",
  clase_grupal: "Clase grupal",
  producto: "Producto",
  paquete: "Paquete",
  descuento_fijo: "Descuento fijo",
  descuento_porcentaje: "Descuento porcentual",
  personalizado: "Personalizado",
};

export const CAMPAIGN_STATE_LABELS: Record<CampaignEstado, string> = {
  borrador: "Borrador",
  programada: "Programada",
  activa: "Activa",
  pausada: "Pausada",
  finalizada: "Finalizada",
};

const MX = "America/Mexico_City";

export function mexicoDayStart(date: string): string {
  return new Date(`${date}T00:00:00-06:00`).toISOString();
}

/** El último día inclusive se guarda como el inicio del día siguiente. */
export function mexicoDayAfter(date: string): string {
  const start = new Date(`${date}T00:00:00-06:00`);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

export function mexicoDateInput(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MX,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function mexicoInclusiveEndInput(exclusiveIso: string): string {
  return mexicoDateInput(new Date(new Date(exclusiveIso).getTime() - 1000).toISOString());
}

export function formatMexicoDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: MX,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatWindowEnd(exclusiveIso: string): string {
  return formatMexicoDate(new Date(new Date(exclusiveIso).getTime() - 1000).toISOString());
}

export function formatMonthName(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("es-MX", {
      timeZone: MX,
      month: "long",
    }).format(d);
  } catch {
    return "";
  }
}

export function formatCampaignNarrative(balance: {
  acumula_desde: string;
  canje_desde: string;
  canje_hasta: string;
}): string {
  const acumulaMes = formatMonthName(balance.acumula_desde);
  const canjeMes = formatMonthName(balance.canje_desde);
  if (acumulaMes && canjeMes) {
    if (acumulaMes === canjeMes) {
      return `Acumula y canjea en ${acumulaMes}.`;
    }
    return `Acumula en ${acumulaMes} · Canjea en ${canjeMes}.`;
  }
  return `Válida hasta ${formatWindowEnd(balance.canje_hasta)}.`;
}

export interface DuplicateWindowInput {
  nombre: string;
  acumulaDesde: string;
  acumulaHasta: string;
  canjeDesde: string;
  canjeHasta: string;
  puntosPorParticipacion: number;
}

function addMexicoMonths(iso: string, months: number): string {
  const [year, month, day] = mexicoDateInput(iso).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + months, day, 6, 0, 0)).toISOString();
}

/** Copia solo reglas y fechas. No incluye lotes, ledger, canjes ni participaciones. */
export function suggestDuplicateCampaign(source: DuplicateWindowInput) {
  return {
    nombre: `${source.nombre} (siguiente)`,
    acumula_desde: addMexicoMonths(source.acumulaDesde, 1),
    acumula_hasta: addMexicoMonths(source.acumulaHasta, 1),
    canje_desde: addMexicoMonths(source.canjeDesde, 1),
    canje_hasta: addMexicoMonths(source.canjeHasta, 1),
    puntos_por_participacion: source.puntosPorParticipacion,
    estado: "borrador" as const,
  };
}

export interface BalanceView {
  campaign_id: string;
  nombre: string;
  fase: "acumulacion" | "canje" | "cerrada";
  acumulando: number;
  disponible: number;
  reservado: number;
  utilizado: number;
  cerrado: number;
  canje_hasta: string;
}

export function accumulatingNow(balances: BalanceView[]): BalanceView | null {
  return balances.find((row) => row.fase === "acumulacion") ?? null;
}

export function redeemingNow(balances: BalanceView[]): BalanceView | null {
  return balances.find((row) => row.fase === "canje") ?? null;
}

export interface StatsInput {
  reviews: { jugador_id: string; estado: string; campaign_id: string | null }[];
  lots: { jugador_id: string; campaign_id: string; puntos_restantes: number; anulado: boolean }[];
  ledger: { jugador_id: string; campaign_id: string | null; tipo: string; puntos: number }[];
  redemptions: { jugador_id: string; campaign_id: string; estado: string }[];
  campaigns: { id: string; nombre: string; canje_desde: string; canje_hasta: string }[];
  names: Record<string, string>;
  now?: Date;
}

export interface CampaignComparison {
  id: string;
  nombre: string;
  emitidos: number;
  disponibles: number;
  utilizados: number;
  entregados: number;
}

export function summarizeRewards(input: StatsInput) {
  const now = input.now ?? new Date();
  const approved = input.reviews.filter((row) => row.estado === "aprobada");
  const activePlayers = new Set(approved.map((row) => row.jugador_id));
  const issued = input.ledger
    .filter((row) => row.tipo === "acreditacion")
    .reduce((sum, row) => sum + row.puntos, 0);
  const used = input.ledger
    .filter((row) => row.tipo === "canje")
    .reduce((sum, row) => sum + -row.puntos, 0);
  const openCampaigns = new Set(
    input.campaigns
      .filter((campaign) => {
        const from = new Date(campaign.canje_desde).getTime();
        const to = new Date(campaign.canje_hasta).getTime();
        return now.getTime() >= from && now.getTime() < to;
      })
      .map((campaign) => campaign.id)
  );
  const available = input.lots
    .filter((lot) => !lot.anulado && openCampaigns.has(lot.campaign_id))
    .reduce((sum, lot) => sum + lot.puntos_restantes, 0);
  const delivered = input.redemptions.filter((row) => row.estado === "entregado").length;
  const counts = new Map<string, number>();
  approved.forEach((row) => counts.set(row.jugador_id, (counts.get(row.jugador_id) ?? 0) + 1));
  const consistent = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([jugadorId, participaciones]) => ({
      jugadorId,
      nombre: input.names[jugadorId] ?? "Jugador",
      participaciones,
    }));
  const comparison: CampaignComparison[] = input.campaigns.map((campaign) => ({
    id: campaign.id,
    nombre: campaign.nombre,
    emitidos: input.ledger
      .filter((row) => row.campaign_id === campaign.id && row.tipo === "acreditacion")
      .reduce((sum, row) => sum + row.puntos, 0),
    disponibles: input.lots
      .filter((lot) => lot.campaign_id === campaign.id && !lot.anulado && openCampaigns.has(campaign.id))
      .reduce((sum, lot) => sum + lot.puntos_restantes, 0),
    utilizados: input.ledger
      .filter((row) => row.campaign_id === campaign.id && row.tipo === "canje")
      .reduce((sum, row) => sum + -row.puntos, 0),
    entregados: input.redemptions.filter(
      (row) => row.campaign_id === campaign.id && row.estado === "entregado"
    ).length,
  }));
  return {
    activePlayers: activePlayers.size,
    approved: approved.length,
    issued,
    available,
    used,
    delivered,
    consistent,
    comparison,
  };
}
