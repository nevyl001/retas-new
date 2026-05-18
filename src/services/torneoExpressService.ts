import { supabase, supabasePublicRead } from "../lib/supabaseClient";
import { isMissingColumnError } from "../lib/db/schemaHelpers";
import { formatPairDisplay } from "../lib/torneoExpress/standings";
import type {
  GrupoAssignmentDraft,
  TorneoExpress,
  TorneoExpressBundle,
  TorneoExpressGrupo,
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "../lib/torneoExpress/types";
import type { Pair } from "../lib/database";

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

function pairLabelFromRow(p: Pair): string {
  const n1 = p.player1_name || "Jugador 1";
  const n2 = p.player2_name || "Jugador 2";
  return formatPairDisplay(n1, n2);
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

/** Round robin: cada pareja juega una vez contra cada otra del grupo. */
function buildRoundRobinPartidos(
  grupoId: string,
  parejaIds: string[]
): Array<{
  grupo_id: string;
  pareja_local_id: string;
  pareja_visitante_id: string;
  estado: "pendiente";
}> {
  const partidos: Array<{
    grupo_id: string;
    pareja_local_id: string;
    pareja_visitante_id: string;
    estado: "pendiente";
  }> = [];
  for (let i = 0; i < parejaIds.length; i++) {
    for (let j = i + 1; j < parejaIds.length; j++) {
      partidos.push({
        grupo_id: grupoId,
        pareja_local_id: parejaIds[i],
        pareja_visitante_id: parejaIds[j],
        estado: "pendiente",
      });
    }
  }
  return partidos;
}

async function insertTorneoExpressRow(
  nombre: string,
  organizador_id: string
): Promise<TorneoExpress> {
  const attempts: Record<string, unknown>[] = [
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
    if (
      error &&
      "estado" in payload &&
      isMissingColumnError(error, "torneo_express", "estado")
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
  (data as Pair[]).forEach((p) => map.set(p.id, pairLabelFromRow(p)));
  return map;
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

  if (grupoIds.length === 0) {
    return {
      torneo,
      grupos: grupoList,
      parejasPorGrupo: {},
      partidosPorGrupo: {},
    };
  }

  const { data: parejasRows, error: pErr } = await client
    .from("torneo_express_grupo_parejas")
    .select("*")
    .in("grupo_id", grupoIds);
  throwIfError(pErr, "fetchTorneoExpressBundle.grupo_parejas");

  const { data: partidosRows, error: mErr } = await client
    .from("torneo_express_partidos")
    .select("*")
    .in("grupo_id", grupoIds)
    .order("created_at", { ascending: true });
  throwIfError(mErr, "fetchTorneoExpressBundle.partidos");

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

  (partidosRows ?? []).forEach((row) => {
    const m = row as TorneoExpressPartido;
    if (!partidosPorGrupo[m.grupo_id]) partidosPorGrupo[m.grupo_id] = [];
    partidosPorGrupo[m.grupo_id].push(m);
  });

  return { torneo, grupos: grupoList, parejasPorGrupo, partidosPorGrupo };
}

// ---------------------------------------------------------------------------
// Creación (orden: torneo → grupos → parejas → partidos)
// ---------------------------------------------------------------------------

export async function createTorneoExpressWithGroups(input: {
  nombre: string;
  sourceTournamentId: string;
  grupos: GrupoAssignmentDraft[];
}): Promise<string> {
  const user = await requireAuthUser();
  const organizador_id = user.id;

  const pairsFromDb = await fetchPairsForTournament(input.sourceTournamentId);
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
    organizador_id
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

    // Paso 4: partidos round robin
    const partidoRows = buildRoundRobinPartidos(grupoId, draft.parejaIds);
    if (partidoRows.length > 0) {
      const { error: partidosErr } = await supabase
        .from("torneo_express_partidos")
        .insert(partidoRows);
      throwIfError(
        partidosErr,
        `insert torneo_express_partidos (${draft.nombre})`
      );
    }
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

// ---------------------------------------------------------------------------
// Realtime y utilidades
// ---------------------------------------------------------------------------

export function subscribeTorneoExpress(
  torneoId: string,
  grupoIds: string[],
  onChange: () => void
): () => void {
  if (grupoIds.length === 0) return () => {};

  let cancelled = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let ready = false;

  const channel = supabase.channel(
    `torneo-express:${torneoId}:${grupoIds.slice(0, 8).join("-")}`
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

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
