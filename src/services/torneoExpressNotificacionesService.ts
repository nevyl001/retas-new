import { fetchClasificadosPairIds } from "../lib/torneoExpress/clasificadosPairs";
import { supabase } from "../lib/supabaseClient";

export type NotificacionTipo =
  | "bienvenida_torneo"
  | "asignacion_grupo"
  | "clasifico_eliminatoria"
  | "no_clasifico"
  | "clasifico_final"
  | "no_llego_final";

export interface NotificacionesDispatchInput {
  torneoExpressId: string;
  tipo: NotificacionTipo;
  pairId?: string;
  /** Solo notificar a este jugador (p. ej. tras guardar contacto) */
  playerId?: string;
  /** Panel admin: permite reenviar aunque ya exista log enviado */
  forceResend?: boolean;
}

export interface UpdatedPlayerContact {
  id: string;
  name?: string;
  email?: string | null;
  email_verified?: boolean | null;
  notif_opt_in_email?: boolean | null;
}

export interface NotificacionLogRow {
  id: string;
  torneo_express_id: string | null;
  player_id: string | null;
  pair_id: string | null;
  canal: "email";
  /** Tipos activos; filas legacy en BD pueden tener otros valores. */
  tipo:
    | "bienvenida_torneo"
    | "asignacion_grupo"
    | "clasifico_eliminatoria"
    | "no_clasifico"
    | "clasifico_final"
    | "no_llego_final"
    | string;
  destinatario: string;
  mensaje_preview: string | null;
  estado: "pendiente" | "enviado" | "error" | "sin_contacto";
  error_detalle: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  sent_at: string | null;
}

export interface PlayerNotificationContactUpdate {
  email?: string | null;
  email_verified?: boolean;
  notif_opt_in_email?: boolean;
}

export interface TorneoPairContactRow {
  pair_id: string;
  player1_id: string;
  player2_id: string;
  player1_name: string;
  player1_email: string | null;
  player1_email_verified: boolean | null;
  player1_opt_email: boolean | null;
  player2_name: string;
  player2_email: string | null;
  player2_email_verified: boolean | null;
  player2_opt_email: boolean | null;
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const out = email.trim().toLowerCase();
  return out.length > 0 ? out : null;
}

export function isFakePadelEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  return email.trim().toLowerCase().endsWith("@padel.local");
}

export function isValidRealEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized || isFakePadelEmail(normalized)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export interface PlayerContactFields {
  email?: string | null;
  email_verified?: boolean | null;
}

/** Listo para notificaciones por email (email real verificado). */
export function playerHasNotifiableEmail(player: PlayerContactFields): boolean {
  if (!isValidRealEmail(player.email ?? "")) return false;
  return player.email_verified !== false;
}

export function playerNeedsEmailContact(player: PlayerContactFields): boolean {
  return !playerHasNotifiableEmail(player);
}

export async function dispatchTorneoExpressNotificaciones(
  input: NotificacionesDispatchInput
) {
  const payload = {
    torneo_express_id: input.torneoExpressId,
    tipo: input.tipo,
    pair_id: input.pairId ?? undefined,
    player_id: input.playerId ?? undefined,
    force_resend: input.forceResend === true,
  };

  const { data, error } = await supabase.functions.invoke("enviar-notificaciones", {
    body: payload,
  });
  if (error) throw error;
  const body = data as { error?: string; ok?: boolean } | null;
  if (body?.error) throw new Error(body.error);
  return data as {
    ok?: boolean;
    enviados_email: number;
    sin_contacto: number;
    errores: number;
    omitidos_duplicado?: number;
    detalle?: string;
  };
}

export interface NotificacionesBatchResult {
  enviados_email: number;
  sin_contacto: number;
  errores: number;
  omitidos_duplicado: number;
  clasificaron?: number;
  no_clasificaron?: number;
  en_final?: number;
  no_en_final?: number;
}

async function fetchPairIdsInEliminatoriaBracket(
  torneoExpressId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("torneo_express_eliminatoria_partidos")
    .select("pareja_local_id, pareja_visitante_id")
    .eq("torneo_id", torneoExpressId);
  if (error) throw error;

  const ids = new Set<string>();
  for (const row of data ?? []) {
    if (row.pareja_local_id) ids.add(row.pareja_local_id as string);
    if (row.pareja_visitante_id) ids.add(row.pareja_visitante_id as string);
  }
  return ids;
}

/** Parejas que juegan la última ronda del cuadro (final). */
async function fetchFinalistPairIds(torneoExpressId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("torneo_express_eliminatoria_partidos")
    .select("ronda, pareja_local_id, pareja_visitante_id")
    .eq("torneo_id", torneoExpressId);
  if (error) throw error;
  if (!data?.length) return new Set();

  const maxRonda = Math.max(...data.map((r) => Number(r.ronda) || 0));
  const finalists = new Set<string>();
  for (const row of data) {
    if (Number(row.ronda) !== maxRonda) continue;
    if (row.pareja_local_id) finalists.add(row.pareja_local_id as string);
    if (row.pareja_visitante_id) finalists.add(row.pareja_visitante_id as string);
  }
  return finalists;
}

/**
 * Un aviso por pareja: clasificó a eliminatoria o no (según el cuadro actual).
 * No llama a los dos tipos para todas — solo el que corresponde a cada pareja.
 */
export async function dispatchEliminatoriaStatusForPairs(
  torneoExpressId: string,
  pairIds: string[],
  options?: { forceResend?: boolean }
): Promise<NotificacionesBatchResult> {
  const unique = Array.from(new Set(pairIds.filter(Boolean)));
  const clasificados = await fetchClasificadosPairIds(torneoExpressId);

  let enviados_email = 0;
  let sin_contacto = 0;
  let errores = 0;
  let omitidos_duplicado = 0;
  let clasificaron = 0;
  let no_clasificaron = 0;

  for (const pairId of unique) {
    const tipo: NotificacionTipo = clasificados.has(pairId)
      ? "clasifico_eliminatoria"
      : "no_clasifico";
    if (tipo === "clasifico_eliminatoria") clasificaron += 1;
    else no_clasificaron += 1;

    try {
      const out = await dispatchTorneoExpressNotificaciones({
        torneoExpressId,
        tipo,
        pairId,
        forceResend: options?.forceResend,
      });
      enviados_email += out.enviados_email ?? 0;
      sin_contacto += out.sin_contacto ?? 0;
      errores += out.errores ?? 0;
      omitidos_duplicado += out.omitidos_duplicado ?? 0;
    } catch {
      errores += 1;
    }
  }

  return {
    enviados_email,
    sin_contacto,
    errores,
    omitidos_duplicado,
    clasificaron,
    no_clasificaron,
  };
}

/**
 * Un aviso por pareja en eliminatoria: llegó a la final o no (según última ronda del cuadro).
 */
export async function dispatchFinalStatusForPairs(
  torneoExpressId: string,
  pairIds: string[],
  options?: { forceResend?: boolean }
): Promise<NotificacionesBatchResult> {
  const unique = Array.from(new Set(pairIds.filter(Boolean)));
  const inEliminatoria = await fetchPairIdsInEliminatoriaBracket(torneoExpressId);
  const finalists = await fetchFinalistPairIds(torneoExpressId);

  let enviados_email = 0;
  let sin_contacto = 0;
  let errores = 0;
  let omitidos_duplicado = 0;
  let en_final = 0;
  let no_en_final = 0;

  for (const pairId of unique) {
    if (!inEliminatoria.has(pairId)) continue;

    const tipo: NotificacionTipo = finalists.has(pairId)
      ? "clasifico_final"
      : "no_llego_final";
    if (tipo === "clasifico_final") en_final += 1;
    else no_en_final += 1;

    try {
      const out = await dispatchTorneoExpressNotificaciones({
        torneoExpressId,
        tipo,
        pairId,
        forceResend: options?.forceResend,
      });
      enviados_email += out.enviados_email ?? 0;
      sin_contacto += out.sin_contacto ?? 0;
      errores += out.errores ?? 0;
      omitidos_duplicado += out.omitidos_duplicado ?? 0;
    } catch {
      errores += 1;
    }
  }

  return {
    enviados_email,
    sin_contacto,
    errores,
    omitidos_duplicado,
    en_final,
    no_en_final,
  };
}

/** Reenvío manual desde el panel (siempre permite repetir). */
export const MANUAL_NOTIF_DISPATCH = { forceResend: true as const };

/** Cuando se crea la ronda final: finalistas vs eliminados antes de la final. */
export async function notifyFinalPhase(
  torneoExpressId: string,
  finalistPairIds: string[]
): Promise<{ enviados_email: number; sin_contacto: number; errores: number; omitidos_duplicado: number }> {
  const finalists = new Set(finalistPairIds.filter(Boolean));

  const { data: elimRows, error } = await supabase
    .from("torneo_express_eliminatoria_partidos")
    .select("pareja_local_id, pareja_visitante_id")
    .eq("torneo_id", torneoExpressId);
  if (error) throw error;

  const inEliminatoria = new Set<string>();
  for (const row of elimRows ?? []) {
    if (row.pareja_local_id) inEliminatoria.add(row.pareja_local_id as string);
    if (row.pareja_visitante_id) {
      inEliminatoria.add(row.pareja_visitante_id as string);
    }
  }

  let enviados_email = 0;
  let sin_contacto = 0;
  let errores = 0;
  let omitidos_duplicado = 0;

  for (const pairId of Array.from(inEliminatoria)) {
    const tipo: NotificacionTipo = finalists.has(pairId)
      ? "clasifico_final"
      : "no_llego_final";
    try {
      const out = await dispatchTorneoExpressNotificaciones({
        torneoExpressId,
        tipo,
        pairId,
      });
      enviados_email += out.enviados_email ?? 0;
      sin_contacto += out.sin_contacto ?? 0;
      errores += out.errores ?? 0;
      omitidos_duplicado += out.omitidos_duplicado ?? 0;
    } catch {
      errores += 1;
    }
  }

  return { enviados_email, sin_contacto, errores, omitidos_duplicado };
}

export async function listNotificacionesLogByTorneo(
  torneoExpressId: string,
  limit = 200
): Promise<NotificacionLogRow[]> {
  const { data, error } = await supabase
    .from("notificaciones_log")
    .select("*")
    .eq("torneo_express_id", torneoExpressId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as NotificacionLogRow[];
}

export async function findTorneoExpressIdsForPlayer(
  playerId: string
): Promise<string[]> {
  const { data: pairs, error: pairsErr } = await supabase
    .from("pairs")
    .select("id")
    .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`);
  if (pairsErr) throw pairsErr;

  const pairIds = (pairs ?? []).map((p) => p.id as string).filter(Boolean);
  if (pairIds.length === 0) return [];

  const { data: gpRows, error: gpErr } = await supabase
    .from("torneo_express_grupo_parejas")
    .select("grupo_id")
    .in("pareja_id", pairIds);
  if (gpErr) throw gpErr;

  const grupoIds = Array.from(
    new Set((gpRows ?? []).map((r) => r.grupo_id as string).filter(Boolean))
  );
  if (grupoIds.length === 0) return [];

  const { data: grupos, error: gruposErr } = await supabase
    .from("torneo_express_grupos")
    .select("torneo_id")
    .in("id", grupoIds);
  if (gruposErr) throw gruposErr;

  return Array.from(
    new Set((grupos ?? []).map((g) => g.torneo_id as string).filter(Boolean))
  );
}

/** Envía inscripción a torneos express donde el jugador ya está inscrito. */
export async function autoNotifyPlayerEnrollment(
  playerId: string
): Promise<{ torneos: number; enviados: number; errores: number }> {
  const torneoIds = await findTorneoExpressIdsForPlayer(playerId);
  if (torneoIds.length === 0) {
    return { torneos: 0, enviados: 0, errores: 0 };
  }

  let enviados = 0;
  let errores = 0;
  for (const torneoExpressId of torneoIds) {
    try {
      const out = await dispatchTorneoExpressNotificaciones({
        torneoExpressId,
        tipo: "asignacion_grupo",
        playerId,
      });
      enviados += out.enviados_email ?? 0;
      errores += out.errores ?? 0;
    } catch {
      errores += 1;
    }
  }
  return { torneos: torneoIds.length, enviados, errores };
}

export async function updatePlayerNotificationContact(
  playerId: string,
  updates: PlayerNotificationContactUpdate,
  options?: { autoNotifyEnrollment?: boolean }
): Promise<UpdatedPlayerContact> {
  const payload: Record<string, unknown> = {
    contact_updated_at: new Date().toISOString(),
  };

  if ("email" in updates) {
    payload.email = normalizeEmail(updates.email);
    const emailStr = payload.email as string | null;
    if (emailStr && !isFakePadelEmail(emailStr)) {
      payload.email_verified = true;
    } else if (emailStr === null || emailStr === "") {
      payload.email_verified = false;
    }
  }
  if ("email_verified" in updates && !("email" in updates)) {
    payload.email_verified = updates.email_verified ?? false;
  }
  if ("notif_opt_in_email" in updates) {
    payload.notif_opt_in_email = updates.notif_opt_in_email ?? false;
  }

  const { data, error } = await supabase
    .from("players")
    .update(payload)
    .eq("id", playerId)
    .select("*")
    .single();
  if (error) throw error;
  const row = data as UpdatedPlayerContact;

  const shouldAutoNotify = options?.autoNotifyEnrollment !== false;
  if (shouldAutoNotify && playerHasNotifiableEmail(row)) {
    await autoNotifyPlayerEnrollment(playerId);
  }

  return row;
}

export async function dispatchNotificarTodosJugadores(torneoExpressId: string) {
  const clasifico = await dispatchTorneoExpressNotificaciones({
    torneoExpressId,
    tipo: "clasifico_eliminatoria",
  });
  const noClasifico = await dispatchTorneoExpressNotificaciones({
    torneoExpressId,
    tipo: "no_clasifico",
  });
  return {
    clasifico,
    no_clasifico: noClasifico,
    enviados_email:
      (clasifico.enviados_email ?? 0) + (noClasifico.enviados_email ?? 0),
    sin_contacto:
      (clasifico.sin_contacto ?? 0) + (noClasifico.sin_contacto ?? 0),
    errores: (clasifico.errores ?? 0) + (noClasifico.errores ?? 0),
  };
}

export async function listPairContactsByTorneoExpress(
  torneoExpressId: string
): Promise<TorneoPairContactRow[]> {
  const { data: groups, error: groupsError } = await supabase
    .from("torneo_express_grupos")
    .select("id")
    .eq("torneo_id", torneoExpressId);
  if (groupsError) throw groupsError;

  const groupIds = (groups ?? []).map((g) => g.id as string);
  if (groupIds.length === 0) return [];

  const { data: gpRows, error: gpError } = await supabase
    .from("torneo_express_grupo_parejas")
    .select("pareja_id")
    .in("grupo_id", groupIds);
  if (gpError) throw gpError;

  const pairIds = Array.from(
    new Set((gpRows ?? []).map((r) => r.pareja_id as string).filter(Boolean))
  );
  if (pairIds.length === 0) return [];

  const { data: contacts, error: contactsError } = await supabase
    .from("pairs_with_contact")
    .select("*")
    .in("pair_id", pairIds);
  if (contactsError) throw contactsError;

  return (contacts ?? []) as TorneoPairContactRow[];
}
