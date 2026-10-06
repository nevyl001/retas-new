import { supabase } from "../lib/supabaseClient";

export class TorneoExpressGrupoOpError extends Error {
  readonly code: string;
  readonly version: number | null;

  constructor(code: string, version: number | null = null) {
    super(code);
    this.name = "TorneoExpressGrupoOpError";
    this.code = code;
    this.version = version;
  }
}

export type AppendMatchInput = {
  rivalId: string;
  ronda: number;
  orden: number;
  cancha?: string | null;
  programadoEn?: string | null;
};

type RpcObject = Record<string, unknown>;

function asObject(value: unknown): RpcObject | null {
  if (typeof value !== "object" || value === null) return null;
  return value as RpcObject;
}

function readVersion(row: RpcObject): number | null {
  return typeof row.version === "number" ? row.version : null;
}

async function requireSession(): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  if (data.session?.user) return;
  const userResult = await supabase.auth.getUser();
  if (userResult.error) throw new Error(userResult.error.message);
  if (!userResult.data.user) throw new Error("No autenticado");
}

async function callRpc(name: string, args: RpcObject): Promise<RpcObject> {
  await requireSession();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  const row = asObject(data);
  if (!row || typeof row.ok !== "boolean") {
    throw new TorneoExpressGrupoOpError("RESET_FAILED");
  }
  if (!row.ok) {
    const code = typeof row.error === "string" ? row.error : "RESET_FAILED";
    throw new TorneoExpressGrupoOpError(code, readVersion(row));
  }
  return row;
}

export async function addPairToGroup(input: {
  torneoId: string;
  grupoId: string;
  player1Id: string;
  player2Id: string;
  partidos: AppendMatchInput[];
  expectedVersion: number;
}): Promise<{ parejaId: string; partidosCreados: number; version: number }> {
  const row = await callRpc("append_torneo_express_pareja_grupo", {
    p_torneo_id: input.torneoId,
    p_grupo_id: input.grupoId,
    p_player1_id: input.player1Id,
    p_player2_id: input.player2Id,
    p_partidos: input.partidos.map((partido) => ({
      rival_id: partido.rivalId,
      ronda: partido.ronda,
      orden: partido.orden,
      cancha: partido.cancha ?? null,
      programado_en: partido.programadoEn ?? null,
    })),
    p_expected_version: input.expectedVersion,
  });
  return {
    parejaId: String(row.pareja_id),
    partidosCreados: Number(row.partidos_creados),
    version: Number(row.version),
  };
}

export async function changePairPlayer(input: {
  grupoId: string;
  parejaId: string;
  outgoingPlayerId: string;
  incomingPlayerId: string;
  expectedVersion: number;
}): Promise<{ parejaId: string; mode: string; version: number }> {
  const row = await callRpc("cambiar_torneo_express_jugador_grupo", {
    p_grupo_id: input.grupoId,
    p_pareja_id: input.parejaId,
    p_jugador_saliente_id: input.outgoingPlayerId,
    p_jugador_nuevo_id: input.incomingPlayerId,
    p_expected_version: input.expectedVersion,
  });
  return {
    parejaId: String(row.pareja_id),
    mode: String(row.mode),
    version: Number(row.version),
  };
}

export async function resolveVirtualPair(input: {
  torneoId: string;
  parejaId: string;
  player1Id: string;
  player2Id: string;
  acceptExistingHistory: boolean;
}): Promise<{ parejaId: string; playedCount: number }> {
  const row = await callRpc("resolve_torneo_express_virtual_pair", {
    p_torneo_id: input.torneoId,
    p_pareja_id: input.parejaId,
    p_player1_id: input.player1Id,
    p_player2_id: input.player2Id,
    p_accept_existing_history: input.acceptExistingHistory,
  });
  return {
    parejaId: String(row.pareja_id),
    playedCount: Number(row.played_count ?? 0),
  };
}

export function virtualPairResolveMessage(code: string): string {
  switch (code) {
    case "PLAYER_ALREADY_REGISTERED":
      return "Uno de esos jugadores ya está en otra pareja de esta categoría.";
    case "PLAYER_NOT_FOUND":
      return "No encontré a uno de los jugadores en el registro.";
    case "VIRTUAL_PAIR_ALREADY_RESOLVED":
      return "Esa plaza ya tiene jugadores.";
    case "TOURNAMENT_CLOSED":
      return "Esta categoría ya no se puede editar.";
    case "VIRTUAL_PAIR_HAS_HISTORY":
      return "Esa plaza ya tiene resultados. Si la sustituyes, esos marcadores quedan con los jugadores nuevos.";
    case "INVALID_MATCH_PAYLOAD":
      return "Elige dos jugadores distintos.";
    default:
      return "No se pudo sustituir la pareja.";
  }
}

export async function replacePair(input: {
  grupoId: string;
  parejaId: string;
  player1Id: string;
  player2Id: string;
  expectedVersion: number;
}): Promise<{ parejaId: string; mode: string; version: number; unchanged: boolean }> {
  const row = await callRpc("reemplazar_torneo_express_pareja_grupo", {
    p_grupo_id: input.grupoId,
    p_pareja_id: input.parejaId,
    p_player1_id: input.player1Id,
    p_player2_id: input.player2Id,
    p_expected_version: input.expectedVersion,
  });
  return {
    parejaId: String(row.pareja_id),
    mode: typeof row.mode === "string" ? row.mode : "unchanged",
    version: Number(row.version),
    unchanged: row.unchanged === true,
  };
}

export async function withdrawPair(input: {
  grupoId: string;
  parejaId: string;
  expectedVersion: number;
}): Promise<{ parejaId: string; pendientesRetirados: number; version: number }> {
  const row = await callRpc("retirar_torneo_express_pareja_grupo", {
    p_grupo_id: input.grupoId,
    p_pareja_id: input.parejaId,
    p_expected_version: input.expectedVersion,
  });
  return {
    parejaId: String(row.pareja_id),
    pendientesRetirados: Number(row.pendientes_retirados),
    version: Number(row.version),
  };
}

export async function applyGroupSchedule(input: {
  grupoId: string;
  expectedVersion: number;
  mode: "faltantes" | "reorganizar";
  nowIso: string;
  courts: string[];
  slots: Array<{ cancha: string; programadoEn: string }>;
  assignments: Array<{ matchId: string; cancha: string; programadoEn: string; orden: number }>;
  occupied?: Array<{ cancha: string; programadoEn: string }>;
}): Promise<{ version: number; changed: number }> {
  const row = await callRpc("aplicar_programacion_torneo_express_grupo", {
    p_grupo_id: input.grupoId,
    p_expected_version: input.expectedVersion,
    p_mode: input.mode,
    p_now: input.nowIso,
    p_assignments: input.assignments.map((assignment) => ({
      match_id: assignment.matchId,
      cancha: assignment.cancha,
      programado_en: assignment.programadoEn,
      orden: assignment.orden,
    })),
    p_courts: input.courts,
    p_slots: input.slots.map((slot) => ({
      cancha: slot.cancha,
      programado_en: slot.programadoEn,
    })),
    p_occupied: (input.occupied ?? []).map((slot) => ({
      cancha: slot.cancha,
      programado_en: slot.programadoEn,
    })),
  });
  return {
    version: Number(row.version),
    changed: Number(row.changed),
  };
}

export async function resetGroup(input: {
  grupoId: string;
  expectedVersion: number;
}): Promise<{ matchesReset: number; ratingsReverted: number; version: number }> {
  const row = await callRpc("reset_torneo_express_grupo", {
    p_grupo_id: input.grupoId,
    p_expected_version: input.expectedVersion,
  });
  return {
    matchesReset: Number(row.matches_reset),
    ratingsReverted: Number(row.ratings_reverted),
    version: Number(row.version),
  };
}

export async function reorganizeGroups(input: {
  torneoId: string;
  payload: {
    grupos: Array<{ nombre: string; orden: number; pareja_ids: string[] }>;
    partidos: Array<{
      grupo_orden: number;
      pareja_local_id: string;
      pareja_visitante_id: string;
      ronda: number;
      orden: number;
      cancha: string;
      programado_en: string;
    }>;
  };
}): Promise<{ grupos: number; partidos: number }> {
  const row = await callRpc("reorganize_torneo_express_grupos", {
    p_torneo_id: input.torneoId,
    p_payload: input.payload,
  });
  return {
    grupos: Number(row.grupos),
    partidos: Number(row.partidos),
  };
}

export function reorganizeGroupsMessage(code: string): string {
  switch (code) {
    case "INVALID_REORGANIZATION":
      return "No se pueden cambiar los grupos si ya hay resultados.";
    case "PAIR_WITHOUT_GROUP":
    case "PAIR_NOT_IN_TOURNAMENT":
      return "Todas las parejas de la categoría tienen que quedar en un grupo.";
    case "PAIR_DUPLICATED":
      return "Una pareja quedó en dos grupos.";
    case "INVALID_GROUP":
    case "INVALID_MATCH_PAYLOAD":
    case "DUPLICATE_MATCH":
      return "No se pudo armar la nueva programación de grupos.";
    case "ROUND_ROBIN_MISMATCH":
      return "Los partidos no coinciden con el nuevo grupo.";
    case "STALE_SCHEDULE":
      return "Dos partidos quedarían a la misma hora en la misma cancha.";
    case "TOURNAMENT_NOT_EDITABLE":
    case "ELIMINATORIA_EXISTS":
    case "GROUP_NOT_EDITABLE":
      return "Esta categoría ya no se puede editar.";
    default:
      return "No se pudieron cambiar las parejas de grupo.";
  }
}

export async function reconcileGroupMatches(input: {
  grupoId: string;
  expectedVersion: number;
}): Promise<{ creados: number; retirados: number; version: number }> {
  const row = await callRpc("reconciliar_torneo_express_grupo", {
    p_grupo_id: input.grupoId,
    p_expected_version: input.expectedVersion,
  });
  return {
    creados: Number(row.creados),
    retirados: Number(row.retirados),
    version: Number(row.version),
  };
}
