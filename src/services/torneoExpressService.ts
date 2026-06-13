import { supabase, supabasePublicRead } from "../lib/supabaseClient";
import { isMissingColumnError } from "../lib/db/schemaHelpers";
import {
  CANCHA_DEFAULT_VALUE,
  normalizeCanchaForSave,
} from "../lib/torneoExpress/canchaDisplay";
import {
  generateBalancedRoundRobin,
  dedupePartidosExpress,
} from "../lib/torneoExpress/roundRobin";
import { formatPairDisplay } from "../lib/torneoExpress/standings";
import { crucesPrimeraRonda } from "../lib/torneoExpress/bracket";
import type { BracketFase, BracketSlotEntry } from "../lib/torneoExpress/bracketTypes";
import {
  buildSiguienteRondaPartidos,
  buildTercerLugarPartido,
  eliminatoriaBracketSize,
  eliminatoriaIncluyeTercerLugar,
  eliminatoriaUltimaRondaCompleta,
  isRondaTercerLugar,
  maxRondaActual,
  rondaCompleta,
  totalRondasEliminatoria,
} from "../lib/torneoExpress/bracketRounds";
import { serializeBracketSlots } from "../lib/torneoExpress/bracketPersistence";
import { buildPersistPayload } from "../lib/torneoExpress/partidoSets";
import type {
  GrupoAssignmentDraft,
  PartidoSetScore,
  TorneoExpress,
  TorneoExpressBundle,
  TorneoExpressEliminatoriaPartido,
  TorneoExpressFaseEliminacion,
  TorneoExpressGrupo,
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "../lib/torneoExpress/types";
import type { Pair } from "../lib/database";
import { deletePair, updatePair } from "../lib/database";
import { splitParejaDraftsByPlayerName } from "../lib/rivieraJugadores/playerNameKey";
import type { Player } from "../lib/db/types";

const readClient = supabasePublicRead;

const PAIRS_SELECT =
  "id, tournament_id, player1_id, player2_id, player1_name, player2_name, created_at";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatSupabaseError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: string }).message);
  }
  return "Error desconocido";
}

function throwIfError(
  error: { message: string } | null,
  operation: string
): void {
  if (error) {
    throw new Error(`Error en ${operation}: ${error.message}`);
  }
}

async function requireAuthUser() {
  const { data: sessionData, error: sessionErr } =
    await supabase.auth.getSession();
  throwIfError(sessionErr, "auth.getSession");
  if (sessionData.session?.user) return sessionData.session.user;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  throwIfError(error, "auth.getUser");
  if (!user) throw new Error("No autenticado");
  return user;
}

async function fetchPlayerNamesByIds(
  playerIds: string[],
  client = supabase
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(playerIds.filter(Boolean)));
  const map = new Map<string, string>();
  if (!unique.length) return map;

  const { data, error } = await client
    .from("players")
    .select("id, name")
    .in("id", unique);
  if (error) {
    console.warn("[torneoExpress] fetchPlayerNamesByIds:", error.message);
    return map;
  }
  for (const row of data ?? []) {
    const r = row as { id: string; name: string };
    if (r.id && r.name) map.set(r.id, r.name.trim());
  }
  return map;
}

function pairLabelFromRow(p: Pair, playerNames: Map<string, string>): string {
  const n1 =
    playerNames.get(p.player1_id) ?? p.player1_name?.trim() ?? "Jugador 1";
  const n2 =
    playerNames.get(p.player2_id) ?? p.player2_name?.trim() ?? "Jugador 2";
  return formatPairDisplay(n1, n2);
}

/** Sincroniza player1_name / player2_name desde la tabla players (evita Carlos Co vs Carlos R). */
async function syncPairsNamesFromPlayers(
  pairs: Pair[],
  client = supabase
): Promise<void> {
  const playerIds = pairs.flatMap((p) => [p.player1_id, p.player2_id]);
  const names = await fetchPlayerNamesByIds(playerIds, client);

  for (const p of pairs) {
    const n1 = names.get(p.player1_id);
    const n2 = names.get(p.player2_id);
    if (!n1 || !n2) continue;
    if (p.player1_name === n1 && p.player2_name === n2) continue;
    try {
      await updatePair(p.id, {
        player1_name: n1,
        player2_name: n2,
      });
      p.player1_name = n1;
      p.player2_name = n2;
    } catch (e) {
      console.warn("[torneoExpress] syncPairsNamesFromPlayers:", p.id, e);
    }
  }
}

function enrichParejasWithLabels(
  rows: TorneoExpressGrupoPareja[],
  labels: Map<string, string>
): TorneoExpressGrupoPareja[] {
  return rows.map((row) => ({
    ...row,
    pareja_display: labels.get(row.pareja_id) ?? row.pareja_display ?? row.pareja_id,
  }));
}

type PartidoInsertRow = {
  grupo_id: string;
  pareja_local_id: string;
  pareja_visitante_id: string;
  estado: "pendiente";
  orden?: number;
  ronda?: number;
  cancha?: string;
};

/** Round robin circular balanceado por rondas. */
function buildRoundRobinPartidos(
  grupoId: string,
  parejaIds: string[]
): PartidoInsertRow[] {
  return generateBalancedRoundRobin(parejaIds).map((m) => ({
    grupo_id: grupoId,
    pareja_local_id: m.localId,
    pareja_visitante_id: m.visitanteId,
    estado: "pendiente",
    orden: m.orden,
    ronda: m.ronda,
    cancha: CANCHA_DEFAULT_VALUE,
  }));
}

async function insertPartidosRows(
  rows: PartidoInsertRow[],
  grupoLabel: string
): Promise<void> {
  if (rows.length === 0) return;

  const { error } = await supabase.from("torneo_express_partidos").insert(rows);
  if (!error) return;

  if (
    isMissingColumnError(error, "torneo_express_partidos", "orden") ||
    isMissingColumnError(error, "torneo_express_partidos", "ronda") ||
    isMissingColumnError(error, "torneo_express_partidos", "cancha")
  ) {
    const legacy = rows.map(
      ({ grupo_id, pareja_local_id, pareja_visitante_id, estado, orden, ronda }) => {
        const row: Record<string, unknown> = {
          grupo_id,
          pareja_local_id,
          pareja_visitante_id,
          estado,
        };
        if (orden != null) row.orden = orden;
        if (ronda != null) row.ronda = ronda;
        return row;
      }
    );
    const { error: legacyErr } = await supabase
      .from("torneo_express_partidos")
      .insert(legacy);
    throwIfError(legacyErr, `insert torneo_express_partidos (${grupoLabel})`);
    return;
  }

  throwIfError(error, `insert torneo_express_partidos (${grupoLabel})`);
}

let partidosOrdenColumnKnown: boolean | null = null;

export function partidosOrdenColumnIsAvailable(): boolean {
  return partidosOrdenColumnKnown !== false;
}

export const PARTIDOS_EXTRAS_MIGRATION_HINT =
  "Faltan columnas de partidos en Supabase (orden, ronda, cancha o programado_en). Revisa el esquema del proyecto.";

/** @deprecated Use PARTIDOS_EXTRAS_MIGRATION_HINT */
export const PARTIDOS_ORDEN_MIGRATION_HINT = PARTIDOS_EXTRAS_MIGRATION_HINT;

export async function checkPartidosOrdenColumnAvailable(
  client: typeof supabase | typeof readClient = supabase
): Promise<boolean> {
  if (partidosOrdenColumnKnown !== null) return partidosOrdenColumnKnown;

  const { error } = await client
    .from("torneo_express_partidos")
    .select("orden")
    .limit(1);

  if (!error) {
    partidosOrdenColumnKnown = true;
    return true;
  }

  if (isMissingColumnError(error, "torneo_express_partidos", "orden")) {
    partidosOrdenColumnKnown = false;
    return false;
  }

  partidosOrdenColumnKnown = true;
  return true;
}

let partidosCanchaColumnKnown: boolean | null = null;

export function partidosCanchaColumnIsAvailable(): boolean {
  return partidosCanchaColumnKnown !== false;
}

export async function checkPartidosCanchaColumnAvailable(
  client: typeof supabase | typeof readClient = supabase
): Promise<boolean> {
  if (partidosCanchaColumnKnown !== null) return partidosCanchaColumnKnown;

  const { error } = await client
    .from("torneo_express_partidos")
    .select("cancha")
    .limit(1);

  if (!error) {
    partidosCanchaColumnKnown = true;
    return true;
  }

  if (isMissingColumnError(error, "torneo_express_partidos", "cancha")) {
    partidosCanchaColumnKnown = false;
    return false;
  }

  partidosCanchaColumnKnown = true;
  return true;
}

let partidosProgramadoColumnKnown: boolean | null = null;

export function partidosProgramadoColumnIsAvailable(): boolean {
  return partidosProgramadoColumnKnown !== false;
}

export async function checkPartidosProgramadoColumnAvailable(
  client: typeof supabase | typeof readClient = supabase
): Promise<boolean> {
  if (partidosProgramadoColumnKnown !== null) {
    return partidosProgramadoColumnKnown;
  }

  const { error } = await client
    .from("torneo_express_partidos")
    .select("programado_en")
    .limit(1);

  if (!error) {
    partidosProgramadoColumnKnown = true;
    return true;
  }

  if (isMissingColumnError(error, "torneo_express_partidos", "programado_en")) {
    partidosProgramadoColumnKnown = false;
    return false;
  }

  partidosProgramadoColumnKnown = true;
  return true;
}

async function fetchPartidosForGrupoIds(
  client: typeof supabase | typeof readClient,
  grupoIds: string[]
): Promise<TorneoExpressPartido[]> {
  if (grupoIds.length === 0) return [];

  let { data, error } = await client
    .from("torneo_express_partidos")
    .select("*")
    .in("grupo_id", grupoIds)
    .order("orden", { ascending: true });

  if (isMissingColumnError(error, "torneo_express_partidos", "orden")) {
    partidosOrdenColumnKnown = false;
    ({ data, error } = await client
      .from("torneo_express_partidos")
      .select("*")
      .in("grupo_id", grupoIds)
      .order("created_at", { ascending: true }));
  } else if (!error) {
    partidosOrdenColumnKnown = true;
  }

  throwIfError(error, "fetchTorneoExpressBundle.partidos");
  return dedupePartidosExpress((data ?? []) as TorneoExpressPartido[]);
}

async function insertTorneoExpressRow(
  nombre: string,
  organizador_id: string,
  categoria?: string | null
): Promise<TorneoExpress> {
  const cat =
    categoria != null && String(categoria).trim() !== ""
      ? String(categoria).trim()
      : null;

  const attempts: Record<string, unknown>[] = [
    { nombre, organizador_id, estado: "en_curso", categoria: cat },
    { nombre, organizador_id, estado: "pendiente", categoria: cat },
    { nombre, organizador_id, categoria: cat },
    { nombre, organizador_id, estado: "en_curso" },
    { nombre, organizador_id, estado: "pendiente" },
    { nombre, organizador_id },
  ];

  let lastError: { message: string; code?: string } | null = null;

  for (const payload of attempts) {
    const { data, error } = await supabase
      .from("torneo_express")
      .insert(payload)
      .select()
      .single();

    if (!error && data) {
      return data as TorneoExpress;
    }

    lastError = error;
    if (!error) continue;
    if (
      "estado" in payload &&
      isMissingColumnError(error, "torneo_express", "estado")
    ) {
      continue;
    }
    if (
      "categoria" in payload &&
      isMissingColumnError(error, "torneo_express", "categoria")
    ) {
      continue;
    }
    if (error) break;
  }

  throw new Error(
    `Error en insert torneo_express: ${lastError?.message ?? "sin detalle"}`
  );
}

// ---------------------------------------------------------------------------
// Lectura: tabla `pairs` (solo lectura)
// ---------------------------------------------------------------------------

export async function fetchPairsForTournament(
  tournamentId: string,
  client = supabase
): Promise<Pair[]> {
  const { data, error } = await client
    .from("pairs")
    .select(PAIRS_SELECT)
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: true });
  throwIfError(error, "fetchPairsForTournament");
  return (data ?? []) as Pair[];
}

/**
 * Borra parejas huérfanas del borrador y duplicados por jugador (nombre).
 * La UI (`keepPairIds`) es la fuente de verdad al crear el torneo.
 */
export async function pruneDraftPairsForTournament(
  tournamentId: string,
  keepPairIds: string[] = []
): Promise<Pair[]> {
  const keep = new Set(keepPairIds.filter(Boolean));
  let rows = await fetchPairsForTournament(tournamentId);
  await syncPairsNamesFromPlayers(rows);

  for (const row of rows) {
    if (keep.size > 0 && !keep.has(row.id)) {
      await deletePair(row.id);
    }
  }

  rows = await fetchPairsForTournament(tournamentId);
  await syncPairsNamesFromPlayers(rows);

  const drafts = rows.map((row) => ({
    id: row.id,
    jugador1: {
      id: row.player1_id,
      name: row.player1_name,
      email: "",
      created_at: row.created_at,
    } as Player,
    jugador2: {
      id: row.player2_id,
      name: row.player2_name,
      email: "",
      created_at: row.created_at,
    } as Player,
  }));

  const { droppedIds } = splitParejaDraftsByPlayerName(
    drafts,
    Array.from(keep)
  );
  for (const id of droppedIds) {
    await deletePair(id);
  }

  const final = await fetchPairsForTournament(tournamentId);
  await syncPairsNamesFromPlayers(final);
  return final;
}

export async function fetchPairLabelsByIds(
  pairIds: string[],
  client = supabase
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(pairIds.filter(Boolean)));
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const { data, error } = await client
    .from("pairs")
    .select(PAIRS_SELECT)
    .in("id", unique);
  if (error) {
    console.warn(
      "[torneoExpress] fetchPairLabelsByIds:",
      error.message
    );
    return map;
  }
  const pairs = (data ?? []) as Pair[];
  const names = await fetchPlayerNamesByIds(
    pairs.flatMap((p) => [p.player1_id, p.player2_id]),
    client
  );
  pairs.forEach((p) => map.set(p.id, pairLabelFromRow(p, names)));
  return map;
}

/** Parejas completas (con nombres) para vista pública del bracket. */
export async function fetchPairsByIdsPublic(
  pairIds: string[]
): Promise<Pair[]> {
  const unique = Array.from(new Set(pairIds.filter(Boolean)));
  if (unique.length === 0) return [];

  const { data, error } = await readClient
    .from("pairs")
    .select(PAIRS_SELECT)
    .in("id", unique);
  if (error) {
    console.warn("[torneoExpress] fetchPairsByIdsPublic:", error.message);
    return [];
  }

  const pairs = (data ?? []) as Pair[];
  const names = await fetchPlayerNamesByIds(
    pairs.flatMap((p) => [p.player1_id, p.player2_id]),
    readClient
  );

  return pairs.map((p) => ({
    ...p,
    player1_name: names.get(p.player1_id) ?? p.player1_name,
    player2_name: names.get(p.player2_id) ?? p.player2_name,
  }));
}

// ---------------------------------------------------------------------------
// Lectura: torneo express
// ---------------------------------------------------------------------------

export type TorneoExpressListItem = TorneoExpress & {
  grupoCount: number;
  parejaCount: number;
};

export async function fetchTorneosExpressByOrganizador(): Promise<
  TorneoExpressListItem[]
> {
  const user = await requireAuthUser();

  const { data, error } = await supabase
    .from("torneo_express")
    .select("*, torneo_express_grupos(id)")
    .eq("organizador_id", user.id)
    .order("created_at", { ascending: false });

  if (!error && data) {
    const mapped = data.map((row) => {
      const grupos = (row as { torneo_express_grupos?: { id: string }[] })
        .torneo_express_grupos;
      const { torneo_express_grupos: _g, ...torneo } = row as TorneoExpress & {
        torneo_express_grupos?: { id: string }[];
      };
      void _g;
      return {
        ...(torneo as TorneoExpress),
        grupoCount: Array.isArray(grupos) ? grupos.length : 0,
        parejaCount: 0,
      };
    });
    return enrichTorneoListWithParejaCounts(mapped);
  }

  const { data: torneos, error: tErr } = await supabase
    .from("torneo_express")
    .select("*")
    .eq("organizador_id", user.id)
    .order("created_at", { ascending: false });
  throwIfError(tErr ?? error, "fetchTorneosExpressByOrganizador");

  const list = (torneos ?? []) as TorneoExpress[];
  if (list.length === 0) return [];

  const ids = list.map((t) => t.id);
  const { data: grupos, error: gErr } = await supabase
    .from("torneo_express_grupos")
    .select("id, torneo_id")
    .in("torneo_id", ids);
  throwIfError(gErr, "fetchTorneosExpressByOrganizador.grupos");

  const countByTorneo = new Map<string, number>();
  (grupos ?? []).forEach((g: { torneo_id: string }) => {
    countByTorneo.set(g.torneo_id, (countByTorneo.get(g.torneo_id) ?? 0) + 1);
  });

  const withGrupos = list.map((t) => ({
    ...t,
    grupoCount: countByTorneo.get(t.id) ?? 0,
    parejaCount: 0,
  }));
  return enrichTorneoListWithParejaCounts(withGrupos);
}

async function enrichTorneoListWithParejaCounts(
  list: TorneoExpressListItem[]
): Promise<TorneoExpressListItem[]> {
  if (list.length === 0) return list;
  const ids = list.map((t) => t.id);
  const { data: grupos, error: gErr } = await supabase
    .from("torneo_express_grupos")
    .select("id, torneo_id")
    .in("torneo_id", ids);
  throwIfError(gErr, "fetchTorneosExpress.parejaCounts.grupos");

  const grupoRows = (grupos ?? []) as { id: string; torneo_id: string }[];
  const grupoToTorneo = new Map(
    grupoRows.map((g) => [g.id, g.torneo_id] as const)
  );
  const grupoIds = grupoRows.map((g) => g.id);
  if (grupoIds.length === 0) return list;

  const { data: parejas, error: pErr } = await supabase
    .from("torneo_express_grupo_parejas")
    .select("grupo_id")
    .in("grupo_id", grupoIds);
  throwIfError(pErr, "fetchTorneosExpress.parejaCounts.parejas");

  const countByTorneo = new Map<string, number>();
  (parejas ?? []).forEach((row: { grupo_id: string }) => {
    const torneoId = grupoToTorneo.get(row.grupo_id);
    if (!torneoId) return;
    countByTorneo.set(torneoId, (countByTorneo.get(torneoId) ?? 0) + 1);
  });

  return list.map((t) => ({
    ...t,
    parejaCount: countByTorneo.get(t.id) ?? 0,
  }));
}

export async function finalizeTorneoExpress(
  torneoId: string
): Promise<TorneoExpress> {
  await requireAuthUser();

  const payloads: Record<string, unknown>[] = [
    { estado: "finalizado", fecha_fin: new Date().toISOString() },
    { estado: "finalizado" },
  ];

  let lastError: { message: string } | null = null;
  for (const payload of payloads) {
    const { data, error } = await supabase
      .from("torneo_express")
      .update(payload)
      .eq("id", torneoId)
      .select()
      .single();
    if (!error && data) return data as TorneoExpress;
    lastError = error;
    if (
      isMissingColumnError(error, "torneo_express", "fecha_fin") ||
      (error?.code === "PGRST204" &&
        typeof error.message === "string" &&
        error.message.includes("fecha_fin"))
    ) {
      continue;
    }
    throwIfError(error, "finalizeTorneoExpress");
  }

  throw new Error(
    `No se pudo finalizar el torneo: ${lastError?.message ?? "sin detalle"}`
  );
}

export async function fetchTorneoExpress(
  torneoId: string,
  usePublicClient = false
): Promise<TorneoExpress | null> {
  const client = usePublicClient ? readClient : supabase;
  const { data, error } = await client
    .from("torneo_express")
    .select("*")
    .eq("id", torneoId)
    .maybeSingle();
  throwIfError(error, "fetchTorneoExpress");
  return data as TorneoExpress | null;
}

export async function fetchTorneoExpressBundle(
  torneoId: string,
  usePublicClient = false
): Promise<TorneoExpressBundle | null> {
  const client = usePublicClient ? readClient : supabase;
  const torneo = await fetchTorneoExpress(torneoId, usePublicClient);
  if (!torneo) return null;

  const { data: grupos, error: gErr } = await client
    .from("torneo_express_grupos")
    .select("*")
    .eq("torneo_id", torneoId)
    .order("orden", { ascending: true });
  throwIfError(gErr, "fetchTorneoExpressBundle.grupos");

  const grupoList = (grupos ?? []) as TorneoExpressGrupo[];
  const grupoIds = grupoList.map((g) => g.id);

  let eliminatoriaPartidos = await fetchEliminatoriaPartidos(
    torneoId,
    usePublicClient
  );

  if (
    !usePublicClient &&
    torneo.fase_torneo === "eliminatoria" &&
    torneo.fase_eliminacion
  ) {
    await ensureTercerLugarPartidoSiAplica(
      torneoId,
      torneo,
      eliminatoriaPartidos
    );
    eliminatoriaPartidos = await fetchEliminatoriaPartidos(torneoId);
  }

  if (grupoIds.length === 0) {
    return {
      torneo,
      grupos: grupoList,
      parejasPorGrupo: {},
      partidosPorGrupo: {},
      eliminatoriaPartidos,
    };
  }

  const { data: parejasRows, error: pErr } = await client
    .from("torneo_express_grupo_parejas")
    .select("*")
    .in("grupo_id", grupoIds);
  throwIfError(pErr, "fetchTorneoExpressBundle.grupo_parejas");

  const partidosRows = await fetchPartidosForGrupoIds(client, grupoIds);

  const parejasPorGrupo: Record<string, TorneoExpressGrupoPareja[]> = {};
  const partidosPorGrupo: Record<string, TorneoExpressPartido[]> = {};
  const allParejaIds: string[] = [];

  grupoIds.forEach((id) => {
    parejasPorGrupo[id] = [];
    partidosPorGrupo[id] = [];
  });

  (parejasRows ?? []).forEach((row) => {
    const p = row as TorneoExpressGrupoPareja;
    if (!parejasPorGrupo[p.grupo_id]) parejasPorGrupo[p.grupo_id] = [];
    parejasPorGrupo[p.grupo_id].push(p);
    allParejaIds.push(p.pareja_id);
  });

  const labels = await fetchPairLabelsByIds(allParejaIds, client);
  Object.keys(parejasPorGrupo).forEach((grupoId) => {
    parejasPorGrupo[grupoId] = enrichParejasWithLabels(
      parejasPorGrupo[grupoId],
      labels
    );
  });

  partidosRows.forEach((m) => {
    if (!partidosPorGrupo[m.grupo_id]) partidosPorGrupo[m.grupo_id] = [];
    partidosPorGrupo[m.grupo_id].push(m);
  });

  return {
    torneo,
    grupos: grupoList,
    parejasPorGrupo,
    partidosPorGrupo,
    eliminatoriaPartidos,
  };
}

export async function fetchEliminatoriaPartidos(
  torneoId: string,
  usePublicClient = false
): Promise<TorneoExpressEliminatoriaPartido[]> {
  const client = usePublicClient ? readClient : supabase;
  const { data, error } = await client
    .from("torneo_express_eliminatoria_partidos")
    .select("*")
    .eq("torneo_id", torneoId)
    .order("ronda", { ascending: true })
    .order("orden", { ascending: true });

  if (error) {
    if (isBracketSchemaError(error)) return [];
    throwIfError(error, "fetchEliminatoriaPartidos");
  }
  return (data ?? []) as TorneoExpressEliminatoriaPartido[];
}

// ---------------------------------------------------------------------------
// Creación (orden: torneo → grupos → parejas → partidos)
// ---------------------------------------------------------------------------

export async function createTorneoExpressWithGroups(input: {
  nombre: string;
  categoria?: string | null;
  sourceTournamentId: string;
  grupos: GrupoAssignmentDraft[];
  /** Parejas visibles en la UI; borra huérfanas del borrador en `pairs`. */
  keepPairIds?: string[];
}): Promise<string> {
  const user = await requireAuthUser();
  const organizador_id = user.id;

  const keepPairIds =
    input.keepPairIds?.length
      ? input.keepPairIds
      : input.grupos.flatMap((g) => g.parejaIds);
  const pairsFromDb = await pruneDraftPairsForTournament(
    input.sourceTournamentId,
    keepPairIds
  );

  if (pairsFromDb.length === 0) {
    throw new Error(
      "La reta no tiene parejas en la tabla pairs. Crea parejas antes de continuar."
    );
  }
  const validPairIds = new Set(pairsFromDb.map((p) => p.id));

  for (const g of input.grupos) {
    if (g.parejaIds.length < 2) {
      throw new Error(`El grupo "${g.nombre}" debe tener al menos 2 parejas.`);
    }
    for (const pid of g.parejaIds) {
      if (!validPairIds.has(pid)) {
        throw new Error(
          `Pareja no válida para esta reta. Recarga y vuelve a asignar parejas.`
        );
      }
    }
  }

  // Paso 1: torneo_express
  const torneoRow = await insertTorneoExpressRow(
    input.nombre.trim(),
    organizador_id,
    input.categoria
  );
  const torneoId = torneoRow.id;
  if (!torneoId) {
    throw new Error("Error en insert torneo_express: no se recibió id");
  }

  for (const draft of input.grupos) {
    // Paso 2: grupo
    const { data: grupoRow, error: grupoErr } = await supabase
      .from("torneo_express_grupos")
      .insert({
        torneo_id: torneoId,
        nombre: draft.nombre,
        orden: draft.orden,
      })
      .select()
      .single();
    throwIfError(grupoErr, `insert torneo_express_grupos (${draft.nombre})`);

    const grupoId = (grupoRow as TorneoExpressGrupo).id;
    if (!grupoId) {
      throw new Error(
        `Error en insert torneo_express_grupos (${draft.nombre}): no se recibió id`
      );
    }

    // Paso 3: parejas del grupo (solo grupo_id + pareja_id)
    for (const parejaId of draft.parejaIds) {
      const { error: parejaErr } = await supabase
        .from("torneo_express_grupo_parejas")
        .insert({
          grupo_id: grupoId,
          pareja_id: parejaId,
        });
      throwIfError(
        parejaErr,
        `insert torneo_express_grupo_parejas (grupo ${draft.nombre})`
      );
    }

    // Paso 4: partidos round robin balanceado
    const partidoRows = buildRoundRobinPartidos(grupoId, draft.parejaIds);
    await insertPartidosRows(partidoRows, draft.nombre);
  }

  return torneoId;
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

export async function savePartidoResultado(
  partidoId: string,
  puntosLocal: number,
  puntosVisitante: number
): Promise<TorneoExpressPartido> {
  await requireAuthUser();

  const pl = Math.max(0, Math.floor(puntosLocal));
  const pv = Math.max(0, Math.floor(puntosVisitante));
  let ganadorId: string | null = null;

  const { data: existing, error: fetchErr } = await supabase
    .from("torneo_express_partidos")
    .select("pareja_local_id, pareja_visitante_id")
    .eq("id", partidoId)
    .single();
  throwIfError(fetchErr, "fetch partido para resultado");
  if (!existing) {
    throw new Error("Error en fetch partido para resultado: partido no encontrado");
  }

  if (pl > pv) ganadorId = existing.pareja_local_id;
  else if (pv > pl) ganadorId = existing.pareja_visitante_id;

  const { data, error } = await supabase
    .from("torneo_express_partidos")
    .update({
      puntos_local: pl,
      puntos_visitante: pv,
      ganador_id: ganadorId,
      estado: "jugado",
    })
    .eq("id", partidoId)
    .select()
    .single();
  throwIfError(error, "update torneo_express_partidos");
  if (!data) {
    throw new Error("Error en update torneo_express_partidos: sin datos");
  }
  return data as TorneoExpressPartido;
}

export class PartidosOrdenColumnMissingError extends Error {
  constructor() {
    super(PARTIDOS_EXTRAS_MIGRATION_HINT);
    this.name = "PartidosOrdenColumnMissingError";
  }
}

export class PartidosCanchaColumnMissingError extends Error {
  constructor() {
    super(PARTIDOS_EXTRAS_MIGRATION_HINT);
    this.name = "PartidosCanchaColumnMissingError";
  }
}

export class PartidosProgramadoColumnMissingError extends Error {
  constructor() {
    super(PARTIDOS_EXTRAS_MIGRATION_HINT);
    this.name = "PartidosProgramadoColumnMissingError";
  }
}

export async function savePartidoCancha(
  partidoId: string,
  cancha: string | null
): Promise<TorneoExpressPartido> {
  await requireAuthUser();

  const disponible = await checkPartidosCanchaColumnAvailable();
  if (!disponible) {
    throw new PartidosCanchaColumnMissingError();
  }

  const value = normalizeCanchaForSave(cancha ?? "");

  const { data, error } = await supabase
    .from("torneo_express_partidos")
    .update({ cancha: value })
    .eq("id", partidoId)
    .select()
    .single();

  if (error) {
    if (isMissingColumnError(error, "torneo_express_partidos", "cancha")) {
      partidosCanchaColumnKnown = false;
      throw new PartidosCanchaColumnMissingError();
    }
    throwIfError(error, "update cancha torneo_express_partidos");
  }
  if (!data) {
    throw new Error("Error en update cancha: sin datos");
  }
  return data as TorneoExpressPartido;
}

export async function savePartidoProgramado(
  partidoId: string,
  programadoEn: string | null
): Promise<TorneoExpressPartido> {
  await requireAuthUser();

  const disponible = await checkPartidosProgramadoColumnAvailable();
  if (!disponible) {
    throw new PartidosProgramadoColumnMissingError();
  }

  const { data, error } = await supabase
    .from("torneo_express_partidos")
    .update({ programado_en: programadoEn })
    .eq("id", partidoId)
    .select()
    .single();

  if (error) {
    if (isMissingColumnError(error, "torneo_express_partidos", "programado_en")) {
      partidosProgramadoColumnKnown = false;
      throw new PartidosProgramadoColumnMissingError();
    }
    throwIfError(error, "update programado_en torneo_express_partidos");
  }
  if (!data) {
    throw new Error("Error en update programado: sin datos");
  }
  return data as TorneoExpressPartido;
}

export async function saveGrupoNombre(
  grupoId: string,
  nombre: string
): Promise<TorneoExpressGrupo> {
  const user = await requireAuthUser();
  const trimmed = nombre.trim();
  if (!trimmed) {
    throw new Error("El nombre del grupo no puede estar vacío");
  }
  if (trimmed.length > 80) {
    throw new Error("El nombre del grupo es demasiado largo (máx. 80 caracteres)");
  }

  const { data: grupo, error: gErr } = await supabase
    .from("torneo_express_grupos")
    .select("id, torneo_id, nombre")
    .eq("id", grupoId)
    .maybeSingle();
  throwIfError(gErr, "saveGrupoNombre.fetch");
  if (!grupo) {
    throw new Error("Grupo no encontrado");
  }

  const { data: torneo, error: tErr } = await supabase
    .from("torneo_express")
    .select("organizador_id")
    .eq("id", grupo.torneo_id)
    .maybeSingle();
  throwIfError(tErr, "saveGrupoNombre.torneo");
  if (!torneo || torneo.organizador_id !== user.id) {
    throw new Error("No tienes permiso para editar este grupo");
  }

  const { data: siblings, error: sErr } = await supabase
    .from("torneo_express_grupos")
    .select("id, nombre")
    .eq("torneo_id", grupo.torneo_id)
    .neq("id", grupoId);
  throwIfError(sErr, "saveGrupoNombre.siblings");

  const duplicate = (siblings ?? []).some(
    (row: { nombre: string }) =>
      row.nombre.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (duplicate) {
    throw new Error(`Ya existe un grupo llamado «${trimmed}» en este torneo`);
  }

  const { data, error } = await supabase
    .from("torneo_express_grupos")
    .update({ nombre: trimmed })
    .eq("id", grupoId)
    .select()
    .single();
  throwIfError(error, "saveGrupoNombre.update");
  if (!data) {
    throw new Error("No se pudo actualizar el nombre del grupo");
  }
  return data as TorneoExpressGrupo;
}

export async function savePartidosOrden(
  updates: Array<{ id: string; orden: number }>
): Promise<void> {
  await requireAuthUser();
  if (updates.length === 0) return;

  const disponible = await checkPartidosOrdenColumnAvailable();
  if (!disponible) {
    throw new PartidosOrdenColumnMissingError();
  }

  const results = await Promise.all(
    updates.map(({ id, orden }) =>
      supabase
        .from("torneo_express_partidos")
        .update({ orden })
        .eq("id", id)
    )
  );

  for (let i = 0; i < results.length; i++) {
    const { error } = results[i];
    if (error) {
      if (isMissingColumnError(error, "torneo_express_partidos", "orden")) {
        partidosOrdenColumnKnown = false;
        throw new PartidosOrdenColumnMissingError();
      }
      throwIfError(error, `update orden partido ${updates[i].id}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Realtime y utilidades
// ---------------------------------------------------------------------------

export function subscribeTorneoExpress(
  torneoId: string,
  grupoIds: string[],
  onChange: () => void
): () => void {
  let cancelled = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let ready = false;

  const channel = supabase.channel(
    `torneo-express:${torneoId}:${grupoIds.slice(0, 8).join("-") || "solo"}`
  );

  const handler = () => {
    if (cancelled || !ready) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!cancelled) onChange();
    }, 500);
  };

  grupoIds.forEach((grupoId) => {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "torneo_express_partidos",
        filter: `grupo_id=eq.${grupoId}`,
      },
      handler
    );
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "torneo_express_grupo_parejas",
        filter: `grupo_id=eq.${grupoId}`,
      },
      handler
    );
  });

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "torneo_express_grupos",
      filter: `torneo_id=eq.${torneoId}`,
    },
    handler
  );

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "torneo_express_eliminatoria_partidos",
      filter: `torneo_id=eq.${torneoId}`,
    },
    handler
  );

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "torneo_express",
      filter: `id=eq.${torneoId}`,
    },
    handler
  );

  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      setTimeout(() => {
        ready = true;
      }, 600);
    }
  });

  return () => {
    cancelled = true;
    ready = false;
    if (debounceTimer) clearTimeout(debounceTimer);
    supabase.removeChannel(channel);
  };
}

export async function deleteTorneoExpress(torneoId: string): Promise<void> {
  const user = await requireAuthUser();

  const { data: torneo, error: tErr } = await supabase
    .from("torneo_express")
    .select("id, organizador_id")
    .eq("id", torneoId)
    .maybeSingle();
  throwIfError(tErr, "deleteTorneoExpress.verificar");
  if (!torneo) {
    throw new Error("Torneo no encontrado");
  }
  if (torneo.organizador_id !== user.id) {
    throw new Error("No tienes permiso para eliminar este torneo");
  }

  const { data: grupos, error: gErr } = await supabase
    .from("torneo_express_grupos")
    .select("id")
    .eq("torneo_id", torneoId);
  throwIfError(gErr, "deleteTorneoExpress.grupos");

  const grupoIds = (grupos ?? []).map((g: { id: string }) => g.id);

  if (grupoIds.length > 0) {
    const { error: partErr } = await supabase
      .from("torneo_express_partidos")
      .delete()
      .in("grupo_id", grupoIds);
    throwIfError(partErr, "deleteTorneoExpress.partidos");

    const { error: parejaErr } = await supabase
      .from("torneo_express_grupo_parejas")
      .delete()
      .in("grupo_id", grupoIds);
    throwIfError(parejaErr, "deleteTorneoExpress.grupo_parejas");
  }

  const { error: gruposDelErr } = await supabase
    .from("torneo_express_grupos")
    .delete()
    .eq("torneo_id", torneoId);
  throwIfError(gruposDelErr, "deleteTorneoExpress.eliminar_grupos");

  const { error: torneoDelErr } = await supabase
    .from("torneo_express")
    .delete()
    .eq("id", torneoId);
  throwIfError(torneoDelErr, "deleteTorneoExpress.torneo");
}

export function publicGrupoUrl(torneoId: string, grupoId: string): string {
  return `${window.location.origin}/torneo-express/${torneoId}/grupo/${grupoId}`;
}

export function publicGeneralUrl(torneoId: string): string {
  return `${window.location.origin}/torneo-express/${torneoId}/general`;
}

/** Vista pública: tabla de clasificación de cada grupo del torneo. */
export function publicGruposUrl(torneoId: string): string {
  return `${window.location.origin}/torneo-express/${torneoId}/grupos`;
}

/** Vista pública: cuadro eliminatorio y partidos. */
export function publicEliminatoriaUrl(torneoId: string): string {
  return `${window.location.origin}/torneo-express/${torneoId}/eliminatoria`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export class BracketSchemaMissingError extends Error {
  constructor() {
    super(
      "Faltan columnas de fase eliminatoria en Supabase. Revisa el esquema del proyecto."
    );
    this.name = "BracketSchemaMissingError";
  }
}

function isBracketSchemaError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = error.message ?? "";
  return (
    isMissingColumnError(error, "torneo_express", "fase_torneo") ||
    isMissingColumnError(error, "torneo_express", "bracket_slots") ||
    msg.includes("torneo_express_eliminatoria_partidos") ||
    error.code === "42P01"
  );
}

/** Confirma el cuadro eliminatorio y genera partidos de la primera ronda. */
export async function confirmarFaseEliminatoria(
  torneoId: string,
  fase: BracketFase,
  slots: BracketSlotEntry[]
): Promise<TorneoExpress> {
  await requireAuthUser();

  const cruces = crucesPrimeraRonda(slots);
  const partidosInsert = cruces
    .map((c, idx) => {
      if (c.esBye && !c.local && !c.visitante) return null;
      const local = c.local;
      const visit = c.visitante;
      const esBye = c.esBye;
      let ganadorId: string | null = null;
      if (esBye) {
        ganadorId = local?.parejaId ?? visit?.parejaId ?? null;
      }
      return {
        torneo_id: torneoId,
        ronda: 1,
        orden: idx + 1,
        cruce_index: c.cruceIndex,
        pareja_local_id: local?.parejaId ?? null,
        pareja_visitante_id: visit?.parejaId ?? null,
        puntos_local: esBye && ganadorId ? 1 : null,
        puntos_visitante: null,
        ganador_id: esBye ? ganadorId : null,
        estado: esBye ? "jugado" : "pendiente",
        es_bye: esBye,
      };
    })
    .filter(Boolean);

  const torneoPayload: Record<string, unknown> = {
    fase_torneo: "eliminatoria",
    fase_eliminacion: fase as TorneoExpressFaseEliminacion,
    bracket_slots: serializeBracketSlots(slots),
    fase_grupos_finalizada_at: new Date().toISOString(),
    estado: "en_curso",
  };

  const { data: torneo, error: tErr } = await supabase
    .from("torneo_express")
    .update(torneoPayload)
    .eq("id", torneoId)
    .select()
    .single();

  if (isBracketSchemaError(tErr)) {
    throw new BracketSchemaMissingError();
  }
  throwIfError(tErr, "confirmarFaseEliminatoria.torneo");
  if (!torneo) throw new Error("No se pudo actualizar el torneo");

  await supabase
    .from("torneo_express_eliminatoria_partidos")
    .delete()
    .eq("torneo_id", torneoId);

  if (partidosInsert.length > 0) {
    const { error: pErr } = await supabase
      .from("torneo_express_eliminatoria_partidos")
      .insert(partidosInsert);
    if (isBracketSchemaError(pErr)) {
      throw new BracketSchemaMissingError();
    }
    throwIfError(pErr, "confirmarFaseEliminatoria.partidos");
  }

  return torneo as TorneoExpress;
}

async function cerrarTorneoEliminatoria(torneoId: string): Promise<void> {
  const payloads: Record<string, unknown>[] = [
    {
      fase_torneo: "cerrado",
      estado: "finalizado",
      fecha_fin: new Date().toISOString(),
    },
    { fase_torneo: "cerrado", estado: "finalizado" },
  ];

  for (const payload of payloads) {
    const { error } = await supabase
      .from("torneo_express")
      .update(payload)
      .eq("id", torneoId);
    if (!error) return;
    if (
      isMissingColumnError(error, "torneo_express", "fecha_fin") ||
      (error?.code === "PGRST204" &&
        typeof error.message === "string" &&
        error.message.includes("fecha_fin"))
    ) {
      continue;
    }
    throwIfError(error, "cerrarTorneoEliminatoria");
  }
}

/** Crea el partido por el 3.er lugar cuando las semifinales ya tienen resultado. */
export async function ensureTercerLugarPartidoSiAplica(
  torneoId: string,
  torneo: TorneoExpress,
  partidos: TorneoExpressEliminatoriaPartido[]
): Promise<void> {
  if (!torneo.fase_eliminacion) return;
  const bracketSize = eliminatoriaBracketSize(
    torneo.fase_eliminacion,
    torneo.bracket_slots
  );
  if (!eliminatoriaIncluyeTercerLugar(torneo.fase_eliminacion, bracketSize)) {
    return;
  }
  if (partidos.some((p) => isRondaTercerLugar(p.ronda))) return;

  const totalRondas = totalRondasEliminatoria(
    torneo.fase_eliminacion,
    bracketSize
  );
  const semiRonda = totalRondas - 1;
  if (!rondaCompleta(partidos, semiRonda)) return;

  const tercerRow = buildTercerLugarPartido(torneoId, partidos, semiRonda);
  if (!tercerRow) return;

  const { error } = await supabase
    .from("torneo_express_eliminatoria_partidos")
    .insert(tercerRow);
  if (isBracketSchemaError(error)) {
    throw new BracketSchemaMissingError();
  }
  throwIfError(error, "ensureTercerLugarPartidoSiAplica");
}

/** Tras completar una ronda, genera la siguiente. Nunca cierra el torneo solo. */
export async function avanzarEliminatoriaSiCompleta(
  torneoId: string
): Promise<void> {
  const torneo = await fetchTorneoExpress(torneoId);
  if (!torneo?.fase_eliminacion) return;
  if (torneo.fase_torneo === "cerrado" || torneo.estado === "finalizado") {
    return;
  }

  let partidos = await fetchEliminatoriaPartidos(torneoId);
  const bracketSize = eliminatoriaBracketSize(
    torneo.fase_eliminacion,
    torneo.bracket_slots
  );
  const totalRondas = totalRondasEliminatoria(
    torneo.fase_eliminacion,
    bracketSize
  );

  let ronda = maxRondaActual(
    partidos.filter((p) => !isRondaTercerLugar(p.ronda))
  );
  if (ronda === 0 || !rondaCompleta(partidos, ronda)) {
    await ensureTercerLugarPartidoSiAplica(torneoId, torneo, partidos);
    return;
  }

  if (ronda < totalRondas) {
    if (!partidos.some((p) => p.ronda === ronda + 1)) {
      const nextRows = buildSiguienteRondaPartidos(torneoId, ronda, partidos);
      if (nextRows.length > 0) {
        const inserts = [...nextRows];
        const nextRonda = ronda + 1;
        if (nextRonda === totalRondas) {
          const tercerRow = buildTercerLugarPartido(
            torneoId,
            partidos,
            ronda
          );
          if (tercerRow) inserts.push(tercerRow);
        }

        const { error } = await supabase
          .from("torneo_express_eliminatoria_partidos")
          .insert(inserts);
        if (isBracketSchemaError(error)) {
          throw new BracketSchemaMissingError();
        }
        throwIfError(error, "avanzarEliminatoriaSiCompleta.insert");

        if (nextRonda === totalRondas) {
          const finalistPairIds = nextRows.flatMap((row) => [
            row.pareja_local_id,
            row.pareja_visitante_id,
          ]);
          const { notifyFinalPhase } = await import(
            "./torneoExpressNotificacionesService"
          );
          void notifyFinalPhase(torneoId, finalistPairIds as string[]).catch(
            () => {
              /* no bloquear avance de ronda */
            }
          );
        }

        partidos = await fetchEliminatoriaPartidos(torneoId);
      }
    }
  }

  await ensureTercerLugarPartidoSiAplica(torneoId, torneo, partidos);
}

/** Reabre un torneo cerrado antes de tiempo (p. ej. auto-finalizado por error). */
export async function reabrirTorneoExpressEliminatoria(
  torneoId: string
): Promise<TorneoExpress> {
  await requireAuthUser();

  const torneo = await fetchTorneoExpress(torneoId);
  if (!torneo?.fase_eliminacion) {
    throw new Error("El torneo no tiene fase eliminatoria configurada");
  }

  const partidos = await fetchEliminatoriaPartidos(torneoId);
  if (
    eliminatoriaUltimaRondaCompleta(
      partidos,
      torneo.fase_eliminacion,
      eliminatoriaBracketSize(torneo.fase_eliminacion, torneo.bracket_slots)
    )
  ) {
    throw new Error(
      "La final ya está jugada. Usa «Finalizar torneo» si aún no lo cerraste."
    );
  }

  const payloads: Record<string, unknown>[] = [
    { estado: "en_curso", fase_torneo: "eliminatoria", fecha_fin: null },
    { estado: "en_curso", fase_torneo: "eliminatoria" },
  ];

  let updated: TorneoExpress | null = null;
  for (const payload of payloads) {
    const { data, error } = await supabase
      .from("torneo_express")
      .update(payload)
      .eq("id", torneoId)
      .select()
      .single();
    if (!error && data) {
      updated = data as TorneoExpress;
      break;
    }
    if (
      isMissingColumnError(error, "torneo_express", "fecha_fin") ||
      (error?.code === "PGRST204" &&
        typeof error?.message === "string" &&
        error.message.includes("fecha_fin"))
    ) {
      continue;
    }
    throwIfError(error, "reabrirTorneoExpressEliminatoria");
  }

  if (!updated) {
    throw new Error("No se pudo reabrir el torneo");
  }

  await avanzarEliminatoriaSiCompleta(torneoId);
  const fresh = await fetchTorneoExpress(torneoId);
  return fresh ?? updated;
}

/** Borra eliminatoria y vuelve a «grupos listos para bracket». No toca fase de grupos. */
export async function resetEliminatoriaTorneoExpress(
  torneoId: string
): Promise<TorneoExpress> {
  const user = await requireAuthUser();

  const { data: torneo, error: tErr } = await supabase
    .from("torneo_express")
    .select("id, organizador_id, fase_torneo, estado")
    .eq("id", torneoId)
    .maybeSingle();
  throwIfError(tErr, "resetEliminatoria.verificar");
  if (!torneo) {
    throw new Error("Torneo no encontrado");
  }
  if (torneo.organizador_id !== user.id) {
    throw new Error("No tienes permiso para reiniciar este torneo");
  }
  if (torneo.fase_torneo !== "eliminatoria") {
    throw new Error("El torneo no está en fase eliminatoria");
  }
  if (torneo.estado === "finalizado") {
    throw new Error("No se puede reiniciar un torneo finalizado");
  }

  console.info("[torneo-express] resetEliminatoria", {
    torneoId,
    userId: user.id,
    at: new Date().toISOString(),
  });

  const { error: delErr } = await supabase
    .from("torneo_express_eliminatoria_partidos")
    .delete()
    .eq("torneo_id", torneoId);
  if (isBracketSchemaError(delErr)) {
    throw new BracketSchemaMissingError();
  }
  throwIfError(delErr, "resetEliminatoria.partidos");

  const payloads: Record<string, unknown>[] = [
    {
      fase_torneo: "grupos",
      fase_eliminacion: null,
      bracket_slots: null,
      estado: "en_curso",
      fecha_fin: null,
    },
    {
      fase_torneo: "grupos",
      fase_eliminacion: null,
      bracket_slots: null,
      estado: "en_curso",
    },
  ];

  let updated: TorneoExpress | null = null;
  for (const payload of payloads) {
    const { data, error } = await supabase
      .from("torneo_express")
      .update(payload)
      .eq("id", torneoId)
      .select()
      .single();

    if (!error && data) {
      updated = data as TorneoExpress;
      break;
    }
    if (isBracketSchemaError(error)) {
      throw new BracketSchemaMissingError();
    }
    if (
      isMissingColumnError(error, "torneo_express", "fecha_fin") ||
      (error?.code === "PGRST204" &&
        typeof error.message === "string" &&
        error.message.includes("fecha_fin"))
    ) {
      continue;
    }
    throwIfError(error, "resetEliminatoria.torneo");
  }

  if (!updated) {
    throw new Error("No se pudo reiniciar la eliminatoria");
  }

  const fresh = await fetchTorneoExpress(torneoId);
  return fresh ?? updated;
}

/** Cierra eliminatoria y marca torneo finalizado — solo vía acción explícita del organizador. */
export async function finalizarTorneoExpressEliminatoria(
  torneoId: string
): Promise<TorneoExpress> {
  const user = await requireAuthUser();

  const torneo = await fetchTorneoExpress(torneoId);
  if (!torneo?.fase_eliminacion) {
    throw new Error("El torneo no tiene fase eliminatoria configurada");
  }
  if (torneo.fase_torneo === "cerrado" || torneo.estado === "finalizado") {
    throw new Error("El torneo ya está finalizado");
  }

  const partidos = await fetchEliminatoriaPartidos(torneoId);
  if (
    !eliminatoriaUltimaRondaCompleta(
      partidos,
      torneo.fase_eliminacion,
      eliminatoriaBracketSize(torneo.fase_eliminacion, torneo.bracket_slots)
    )
  ) {
    throw new Error(
      "Completa la final y el partido por el tercer lugar antes de finalizar el torneo"
    );
  }

  await cerrarTorneoEliminatoria(torneoId);
  const updated = await fetchTorneoExpress(torneoId);
  if (!updated) {
    throw new Error("No se pudo cargar el torneo tras finalizar");
  }

  // Registro Riviera Open: historial por jugador (no bloquea la finalización).
  void import("../lib/rivieraJugadores/syncParticipaciones")
    .then(({ syncTorneoExpressParticipaciones }) =>
      syncTorneoExpressParticipaciones(torneoId, user.id)
    )
    .catch((err) =>
      console.error(
        "[riviera-jugadores] sync tras finalizar torneo express:",
        err
      )
    );

  return updated;
}

export async function saveEliminatoriaResultado(
  partidoId: string,
  sets: PartidoSetScore[]
): Promise<TorneoExpressEliminatoriaPartido> {
  await requireAuthUser();

  const payload = buildPersistPayload(sets);
  if (!payload) {
    throw new Error(
      "Completa todos los sets y asegúrate de que haya un ganador (2 sets)"
    );
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("torneo_express_eliminatoria_partidos")
    .select(
      "torneo_id, pareja_local_id, pareja_visitante_id, es_bye"
    )
    .eq("id", partidoId)
    .single();

  if (isBracketSchemaError(fetchErr)) {
    throw new BracketSchemaMissingError();
  }
  throwIfError(fetchErr, "fetch eliminatoria partido para resultado");
  if (!existing) {
    throw new Error("Partido eliminatorio no encontrado");
  }
  if (existing.es_bye) {
    throw new Error("Este cruce es BYE y no admite edición de resultado");
  }

  const ganadorId =
    payload.ganadorSide === "local"
      ? existing.pareja_local_id
      : existing.pareja_visitante_id;

  if (!ganadorId) {
    throw new Error("No se pudo determinar el ganador del partido");
  }

  const updateRow: Record<string, unknown> = {
    puntos_local: payload.puntos_local,
    puntos_visitante: payload.puntos_visitante,
    ganador_id: ganadorId,
    estado: "jugado",
    sets_resultado: payload.sets_resultado,
  };

  const { data, error } = await supabase
    .from("torneo_express_eliminatoria_partidos")
    .update(updateRow)
    .eq("id", partidoId)
    .select()
    .single();

  if (
    error &&
    isMissingColumnError(
      error,
      "torneo_express_eliminatoria_partidos",
      "sets_resultado"
    )
  ) {
    const { sets_resultado: _drop, ...legacyRow } = updateRow;
    const { data: legacyData, error: legacyErr } = await supabase
      .from("torneo_express_eliminatoria_partidos")
      .update(legacyRow)
      .eq("id", partidoId)
      .select()
      .single();
    if (isBracketSchemaError(legacyErr)) {
      throw new BracketSchemaMissingError();
    }
    throwIfError(legacyErr, "update torneo_express_eliminatoria_partidos");
    if (!legacyData) {
      throw new Error("No se pudo guardar el resultado eliminatorio");
    }
    await avanzarEliminatoriaSiCompleta(existing.torneo_id as string);
    return legacyData as TorneoExpressEliminatoriaPartido;
  }

  if (isBracketSchemaError(error)) {
    throw new BracketSchemaMissingError();
  }
  throwIfError(error, "update torneo_express_eliminatoria_partidos");
  if (!data) {
    throw new Error("No se pudo guardar el resultado eliminatorio");
  }

  await avanzarEliminatoriaSiCompleta(existing.torneo_id as string);
  return data as TorneoExpressEliminatoriaPartido;
}

export async function saveEliminatoriaCancha(
  partidoId: string,
  cancha: string | null
): Promise<TorneoExpressEliminatoriaPartido> {
  await requireAuthUser();
  const value = normalizeCanchaForSave(cancha ?? "");

  const { data, error } = await supabase
    .from("torneo_express_eliminatoria_partidos")
    .update({ cancha: value })
    .eq("id", partidoId)
    .select()
    .single();

  if (isBracketSchemaError(error)) {
    throw new BracketSchemaMissingError();
  }
  throwIfError(error, "update cancha eliminatoria");
  if (!data) throw new Error("No se pudo guardar la cancha");
  return data as TorneoExpressEliminatoriaPartido;
}

export async function saveEliminatoriaProgramado(
  partidoId: string,
  programadoEn: string | null
): Promise<TorneoExpressEliminatoriaPartido> {
  await requireAuthUser();

  const { data, error } = await supabase
    .from("torneo_express_eliminatoria_partidos")
    .update({ programado_en: programadoEn })
    .eq("id", partidoId)
    .select()
    .single();

  if (isBracketSchemaError(error)) {
    throw new BracketSchemaMissingError();
  }
  throwIfError(error, "update programado eliminatoria");
  if (!data) throw new Error("No se pudo guardar fecha y hora");
  return data as TorneoExpressEliminatoriaPartido;
}
