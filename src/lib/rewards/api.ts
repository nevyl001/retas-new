import { supabase } from "../supabaseClient";

export interface CampaignRecord {
  id: string;
  organizador_id: string;
  nombre: string;
  descripcion: string | null;
  timezone: string;
  acumula_desde: string;
  acumula_hasta: string;
  canje_desde: string;
  canje_hasta: string;
  puntos_por_participacion: number;
  modalidades: string[];
  estado: string;
  visible_jugadores: boolean;
  condiciones: string | null;
  reserva_dias: number;
  origen_campaign_id: string | null;
}

export interface RewardRecord {
  id: string;
  campaign_id: string;
  organizador_id: string;
  nombre: string;
  descripcion: string | null;
  costo_puntos: number;
  tipo: string;
  cantidad: number | null;
  inventario: number | null;
  inventario_restante: number | null;
  limite_por_jugador: number | null;
  disponible_desde: string | null;
  disponible_hasta: string | null;
  condiciones: string | null;
  estado: string;
}

export interface BalanceRecord {
  campaign_id: string;
  nombre: string;
  fase: "acumulacion" | "canje" | "cerrada";
  acumulando: number;
  disponible: number;
  reservado: number;
  utilizado: number;
  cerrado: number;
  acumula_desde: string;
  acumula_hasta: string;
  canje_desde: string;
  canje_hasta: string;
}

export interface ReviewRecord {
  id: string;
  participacion_id: string;
  jugador_id: string;
  modalidad: string;
  estado: string;
  campaign_id: string | null;
  closed_at: string;
  motivo: string | null;
}

export interface RedemptionRecord {
  id: string;
  campaign_id: string;
  reward_id: string;
  jugador_id: string;
  estado: string;
  costo_puntos: number;
  snapshot: { nombre?: string; tipo?: string; descripcion?: string };
  reserva_hasta: string | null;
  created_at: string;
}

export interface QueueRecord {
  id: string;
  estado: string;
  attempts: number;
  last_error: string | null;
  jugador_id: string;
  participacion_id: string;
}

export interface BenefitRecord {
  id: string;
  redemption_id: string;
  jugador_id: string;
  tipo_beneficio: string;
  estado: string;
  participacion_id: string | null;
}

function fail(error: { message: string } | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback);
}

export async function listCampaigns(organizadorId: string): Promise<CampaignRecord[]> {
  const { data, error } = await supabase
    .from("rewards_campaigns")
    .select("*")
    .eq("organizador_id", organizadorId)
    .order("acumula_desde", { ascending: false });
  fail(error, "No se pudieron leer las campañas");
  return (data ?? []) as CampaignRecord[];
}

export async function saveCampaign(payload: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.rpc("rewards_save_campaign", { p_payload: payload });
  fail(error, "No se pudo guardar la campaña");
  return data as string;
}

export async function duplicateCampaign(
  sourceId: string,
  payload: Record<string, unknown>
): Promise<string> {
  const { data, error } = await supabase.rpc("rewards_duplicate_campaign", {
    p_source_id: sourceId,
    p_payload: payload,
  });
  fail(error, "No se pudo duplicar la campaña");
  return data as string;
}

export async function listRewards(organizadorId: string): Promise<RewardRecord[]> {
  const { data, error } = await supabase
    .from("rewards_rewards")
    .select("*")
    .eq("organizador_id", organizadorId)
    .order("costo_puntos", { ascending: true });
  fail(error, "No se pudieron leer los premios");
  return (data ?? []) as RewardRecord[];
}

export async function saveReward(payload: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.rpc("rewards_save_reward", { p_payload: payload });
  fail(error, "No se pudo guardar el premio");
  return data as string;
}

export async function listPlayers(organizadorId: string): Promise<{ id: string; nombre: string }[]> {
  const { data, error } = await supabase
    .from("riviera_jugadores")
    .select("id, nombre")
    .eq("organizador_id", organizadorId)
    .order("nombre", { ascending: true });
  fail(error, "No se pudieron leer los jugadores");
  return (data ?? []) as { id: string; nombre: string }[];
}

export async function playerBalance(
  organizadorId: string,
  jugadorId: string
): Promise<BalanceRecord[]> {
  const { data, error } = await supabase.rpc("rewards_balance", {
    p_organizador_id: organizadorId,
    p_jugador_id: jugadorId,
  });
  fail(error, "No se pudo leer el saldo");
  return (data ?? []) as BalanceRecord[];
}

export async function listReviews(organizadorId: string, jugadorId?: string): Promise<ReviewRecord[]> {
  let query = supabase
    .from("rewards_participation_reviews")
    .select("id, participacion_id, jugador_id, modalidad, estado, campaign_id, closed_at, motivo")
    .eq("organizador_id", organizadorId)
    .order("closed_at", { ascending: false })
    .limit(200);
  if (jugadorId) query = query.eq("jugador_id", jugadorId);
  const { data, error } = await query;
  fail(error, "No se pudieron leer las participaciones");
  return (data ?? []) as ReviewRecord[];
}

export async function reviewParticipations(input: {
  organizadorId: string;
  participacionIds: string[];
  decision: "aprobada" | "rechazada";
  campaignId: string | null;
  motivo?: string;
}): Promise<number> {
  const { data, error } = await supabase.rpc("rewards_review_participations", {
    p_organizador_id: input.organizadorId,
    p_participacion_ids: input.participacionIds,
    p_decision: input.decision,
    p_campaign_id: input.campaignId,
    p_motivo: input.motivo ?? null,
  });
  fail(error, "No se pudo validar");
  return data as number;
}

export async function listRedemptions(
  organizadorId: string,
  jugadorId?: string
): Promise<RedemptionRecord[]> {
  let query = supabase
    .from("rewards_redemptions")
    .select("id, campaign_id, reward_id, jugador_id, estado, costo_puntos, snapshot, reserva_hasta, created_at")
    .eq("organizador_id", organizadorId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (jugadorId) query = query.eq("jugador_id", jugadorId);
  const { data, error } = await query;
  fail(error, "No se pudieron leer los canjes");
  return (data ?? []) as RedemptionRecord[];
}

export async function requestRedemption(
  organizadorId: string,
  rewardId: string,
  jugadorId: string
): Promise<string> {
  const { data, error } = await supabase.rpc("rewards_request_redemption", {
    p_organizador_id: organizadorId,
    p_reward_id: rewardId,
    p_jugador_id: jugadorId,
  });
  fail(error, "No se pudo solicitar el premio");
  return data as string;
}

async function callVoid(name: string, args: Record<string, unknown>, fallback: string): Promise<void> {
  const { error } = await supabase.rpc(name, args);
  fail(error, fallback);
}

export function reserveRedemption(id: string): Promise<void> {
  return callVoid("rewards_reserve_redemption", { p_redemption_id: id }, "No se pudo reservar");
}

export function confirmRedemption(id: string): Promise<void> {
  return callVoid("rewards_confirm_redemption", { p_redemption_id: id }, "No se pudo entregar");
}

export function cancelRedemption(id: string): Promise<void> {
  return callVoid("rewards_cancel_redemption", { p_redemption_id: id }, "No se pudo cancelar");
}

export async function closeCampaigns(organizadorId: string): Promise<number> {
  const { data, error } = await supabase.rpc("rewards_close_campaigns", { p_organizador_id: organizadorId });
  fail(error, "No se pudieron cerrar las ventanas");
  return data as number;
}

export async function syncCandidates(organizadorId: string): Promise<number> {
  const { data, error } = await supabase.rpc("rewards_sync_candidates", { p_organizador_id: organizadorId });
  fail(error, "No se pudieron recuperar participaciones");
  return data as number;
}

export async function processAccrualQueue(organizadorId: string): Promise<number> {
  const { data, error } = await supabase.rpc("rewards_process_accrual_queue", {
    p_organizador_id: organizadorId,
    p_limit: 50,
  });
  fail(error, "No se pudo procesar la cola");
  return data as number;
}

export async function listQueue(organizadorId: string): Promise<QueueRecord[]> {
  const { data, error } = await supabase
    .from("rewards_accrual_queue")
    .select("id, estado, attempts, last_error, jugador_id, participacion_id")
    .eq("organizador_id", organizadorId)
    .in("estado", ["pendiente", "error"])
    .order("created_at", { ascending: true })
    .limit(50);
  fail(error, "No se pudo leer la cola");
  return (data ?? []) as QueueRecord[];
}

export async function listBenefits(organizadorId: string, jugadorId: string): Promise<BenefitRecord[]> {
  const { data, error } = await supabase
    .from("rewards_benefit_uses")
    .select("id, redemption_id, jugador_id, tipo_beneficio, estado, participacion_id")
    .eq("organizador_id", organizadorId)
    .eq("jugador_id", jugadorId);
  fail(error, "No se pudieron leer los beneficios");
  return (data ?? []) as BenefitRecord[];
}

export function assignBenefit(input: {
  benefitId: string;
  eventoId: string;
  tipoEvento: string;
  participacionId: string;
}): Promise<void> {
  return callVoid(
    "rewards_assign_benefit_use",
    {
      p_benefit_id: input.benefitId,
      p_evento_id: input.eventoId,
      p_tipo_evento: input.tipoEvento,
      p_participacion_id: input.participacionId,
    },
    "No se pudo marcar la reta gratuita"
  );
}

export async function listParticipaciones(jugadorId: string): Promise<
  { id: string; evento_id: string; tipo_evento: string; evento_nombre: string | null; fecha: string | null }[]
> {
  const { data, error } = await supabase
    .from("jugador_participaciones")
    .select("id, evento_id, tipo_evento, evento_nombre, fecha")
    .eq("jugador_id", jugadorId)
    .order("created_at", { ascending: false })
    .limit(30);
  fail(error, "No se pudo leer el historial deportivo");
  return (data ?? []) as {
    id: string;
    evento_id: string;
    tipo_evento: string;
    evento_nombre: string | null;
    fecha: string | null;
  }[];
}

export async function linkPlayer(organizadorId: string, jugadorId: string, email: string): Promise<string> {
  const { data, error } = await supabase.rpc("rewards_link_player", {
    p_organizador_id: organizadorId,
    p_jugador_id: jugadorId,
    p_email: email,
  });
  fail(error, "No se pudo vincular la cuenta");
  return data as string;
}

export interface PlayerSnapshot {
  organizador_id: string;
  jugador_id?: string;
  clubes_autorizados?: Array<{
    organizador_id: string;
    jugador_id: string;
  }>;
  saldos: BalanceRecord[];
  premios: {
    id: string;
    nombre: string;
    descripcion: string | null;
    costo_puntos: number;
    tipo: string;
    condiciones: string | null;
    inventario_restante: number | null;
    limite_por_jugador: number | null;
    campaign_id: string;
    campana: string;
    canje_hasta: string;
  }[];
  canjes: {
    id: string;
    estado: string;
    costo_puntos: number;
    nombre: string;
    created_at: string;
    reserva_hasta: string | null;
  }[];
}

/**
 * Requiere la migración 0059 (firma única `rewards_player_snapshot(uuid, uuid DEFAULT NULL)`).
 * Sin reintentos: si el esquema no coincide, el error de PostgREST se propaga.
 */
export async function playerSnapshot(
  jugadorId: string,
  organizadorId?: string | null
): Promise<PlayerSnapshot> {
  const { data, error } = await supabase.rpc("rewards_player_snapshot", {
    p_jugador_id: jugadorId,
    p_organizador_id: organizadorId ?? null,
  });
  fail(error, "No se pudo consultar Riviera Rewards");
  return data as PlayerSnapshot;
}

export function playerRequestRedemption(
  organizadorId: string,
  rewardId: string,
  jugadorId: string
): Promise<string> {
  return requestRedemption(organizadorId, rewardId, jugadorId);
}

export async function statsRows(organizadorId: string) {
  const [reviews, lots, ledger, redemptions, campaigns] = await Promise.all([
    supabase
      .from("rewards_participation_reviews")
      .select("jugador_id, estado, campaign_id")
      .eq("organizador_id", organizadorId),
    supabase
      .from("rewards_lots")
      .select("jugador_id, campaign_id, puntos_restantes, anulado")
      .eq("organizador_id", organizadorId),
    supabase
      .from("rewards_ledger")
      .select("jugador_id, campaign_id, tipo, puntos")
      .eq("organizador_id", organizadorId),
    supabase
      .from("rewards_redemptions")
      .select("jugador_id, campaign_id, estado")
      .eq("organizador_id", organizadorId),
    supabase
      .from("rewards_campaigns")
      .select("id, nombre, canje_desde, canje_hasta")
      .eq("organizador_id", organizadorId),
  ]);
  [reviews, lots, ledger, redemptions, campaigns].forEach((result) =>
    fail(result.error, "No se pudieron leer las estadísticas")
  );
  return {
    reviews: reviews.data ?? [],
    lots: lots.data ?? [],
    ledger: ledger.data ?? [],
    redemptions: redemptions.data ?? [],
    campaigns: campaigns.data ?? [],
  };
}
