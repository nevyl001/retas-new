import { supabase } from "../lib/supabaseClient";
import { finalizeCareerEvent } from "../lib/rivieraJugadores/careerEventPipeline";
import type {
  CreateDuelo2v2Input,
  Duelo2v2,
  Duelo2v2Ganador,
  Duelo2v2SetDetalle,
  UpdateDuelo2v2DetailsInput,
  UpdateDuelo2v2ScoreInput,
} from "../lib/duelo2v2/types";
import { computeDueloScore } from "../lib/duelo2v2/scoring";

async function requireUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error("Debes iniciar sesión para gestionar duelos 2 vs 2.");
  }
  return user.id;
}

function isDuelosTableMissing(error: {
  code?: string;
  message?: string;
  status?: number;
} | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.status === 404 ||
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    msg.includes("duelos_2v2") ||
    msg.includes("could not find the table")
  );
}

function formatDueloDbError(
  error: { code?: string; message?: string; status?: number } | null
): string {
  if (isDuelosTableMissing(error)) {
    return "Falta la tabla duelos_2v2 en Supabase. Abre el SQL Editor del proyecto y ejecuta el archivo supabase/duelos-2v2.sql (una sola vez).";
  }
  return error?.message ?? "Error de base de datos";
}

function parseDetalleSets(raw: unknown): Duelo2v2SetDetalle[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const a = Number(o.a);
      const b = Number(o.b);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      return { a, b };
    })
    .filter((x): x is Duelo2v2SetDetalle => x !== null);
}

function mapDuelo(row: Record<string, unknown>): Duelo2v2 {
  return {
    id: String(row.id),
    organizador_id: String(row.organizador_id),
    nombre: String(row.nombre),
    descripcion: row.descripcion ? String(row.descripcion) : null,
    cancha: row.cancha != null ? String(row.cancha) : null,
    programado_en: row.programado_en ? String(row.programado_en) : null,
    programado_hasta: row.programado_hasta ? String(row.programado_hasta) : null,
    estado: row.estado as Duelo2v2["estado"],
    pareja_a_j1_id: row.pareja_a_j1_id ? String(row.pareja_a_j1_id) : null,
    pareja_a_j2_id: row.pareja_a_j2_id ? String(row.pareja_a_j2_id) : null,
    pareja_a_j1_nombre: String(row.pareja_a_j1_nombre),
    pareja_a_j2_nombre: String(row.pareja_a_j2_nombre),
    pareja_b_j1_id: row.pareja_b_j1_id ? String(row.pareja_b_j1_id) : null,
    pareja_b_j2_id: row.pareja_b_j2_id ? String(row.pareja_b_j2_id) : null,
    pareja_b_j1_nombre: String(row.pareja_b_j1_nombre),
    pareja_b_j2_nombre: String(row.pareja_b_j2_nombre),
    sets_pareja_a: Number(row.sets_pareja_a ?? 0),
    sets_pareja_b: Number(row.sets_pareja_b ?? 0),
    detalle_sets: parseDetalleSets(row.detalle_sets),
    ganador: (row.ganador as Duelo2v2Ganador | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    finalizado_at: row.finalizado_at ? String(row.finalizado_at) : null,
  };
}

function resolveGanadorFromDetalle(
  detalle: Duelo2v2SetDetalle[]
): {
  setsA: number;
  setsB: number;
  ganador: Duelo2v2Ganador | null;
} {
  const summary = computeDueloScore(detalle);
  return {
    setsA: summary.setsWonA,
    setsB: summary.setsWonB,
    ganador: summary.ganador,
  };
}

export async function getDuelos2v2(): Promise<Duelo2v2[]> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from("duelos_2v2")
    .select("*")
    .eq("organizador_id", uid)
    .order("created_at", { ascending: false });

  if (error) throw new Error(formatDueloDbError(error));
  return (data ?? []).map((row) => mapDuelo(row as Record<string, unknown>));
}

export async function getDuelo2v2ById(id: string): Promise<Duelo2v2 | null> {
  const { data, error } = await supabase
    .from("duelos_2v2")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(formatDueloDbError(error));
  if (!data) return null;
  return mapDuelo(data as Record<string, unknown>);
}

export async function createDuelo2v2(
  input: CreateDuelo2v2Input
): Promise<Duelo2v2> {
  const uid = await requireUserId();
  const ids = [
    input.pareja_a_j1_id,
    input.pareja_a_j2_id,
    input.pareja_b_j1_id,
    input.pareja_b_j2_id,
  ];
  if (new Set(ids).size !== 4) {
    throw new Error("Los cuatro jugadores deben ser distintos.");
  }

  const { data, error } = await supabase
    .from("duelos_2v2")
    .insert({
      organizador_id: uid,
      nombre: input.nombre.trim(),
      descripcion: input.descripcion?.trim() || null,
      cancha: input.cancha?.trim() || null,
      programado_en: input.programado_en ?? null,
      programado_hasta: input.programado_hasta ?? null,
      estado: "en_juego",
      pareja_a_j1_id: input.pareja_a_j1_id,
      pareja_a_j2_id: input.pareja_a_j2_id,
      pareja_a_j1_nombre: input.pareja_a_j1_nombre.trim(),
      pareja_a_j2_nombre: input.pareja_a_j2_nombre.trim(),
      pareja_b_j1_id: input.pareja_b_j1_id,
      pareja_b_j2_id: input.pareja_b_j2_id,
      pareja_b_j1_nombre: input.pareja_b_j1_nombre.trim(),
      pareja_b_j2_nombre: input.pareja_b_j2_nombre.trim(),
    })
    .select()
    .single();

  if (error) throw new Error(formatDueloDbError(error));
  return mapDuelo(data as Record<string, unknown>);
}

export async function updateDuelo2v2Details(
  id: string,
  input: UpdateDuelo2v2DetailsInput
): Promise<Duelo2v2> {
  await requireUserId();
  const nombre = input.nombre.trim();
  if (!nombre) {
    throw new Error("El nombre del encuentro es obligatorio.");
  }

  const { data, error } = await supabase
    .from("duelos_2v2")
    .update({
      nombre,
      cancha: input.cancha?.trim() || null,
      programado_en: input.programado_en ?? null,
      programado_hasta: input.programado_hasta ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(formatDueloDbError(error));
  return mapDuelo(data as Record<string, unknown>);
}

export async function updateDuelo2v2Score(
  id: string,
  input: UpdateDuelo2v2ScoreInput
): Promise<Duelo2v2> {
  await requireUserId();
  const detalle = input.detalle_sets ?? [];
  const { setsA, setsB, ganador } = resolveGanadorFromDetalle(detalle);

  const { data, error } = await supabase
    .from("duelos_2v2")
    .update({
      sets_pareja_a: setsA,
      sets_pareja_b: setsB,
      detalle_sets: detalle,
      ganador,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(formatDueloDbError(error));
  return mapDuelo(data as Record<string, unknown>);
}

export async function finalizarDuelo2v2(id: string): Promise<Duelo2v2> {
  const uid = await requireUserId();
  const duelo = await getDuelo2v2ById(id);
  if (!duelo) throw new Error("Duelo no encontrado.");
  if (duelo.estado === "finalizado") return duelo;
  if (!duelo.ganador) {
    throw new Error(
      "Registra los sets con al menos 2 ganados por una pareja (al mejor de 3). Si van 1–1, el set decisivo debe tener ganador."
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("duelos_2v2")
    .update({
      estado: "finalizado",
      finalizado_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(formatDueloDbError(error));
  const finalizado = mapDuelo(data as Record<string, unknown>);

  const pipelineResult = await finalizeCareerEvent({
    kind: "duelo_2v2",
    organizadorId: uid,
    duelo: finalizado,
  });

  if (!pipelineResult.ok) {
    console.error(
      "[career-event-pipeline] duelo 2v2 incompleto:",
      pipelineResult.failures
    );
  }

  return finalizado;
}

export async function deleteDuelo2v2(id: string): Promise<void> {
  await requireUserId();
  const { error } = await supabase.from("duelos_2v2").delete().eq("id", id);
  if (error) throw new Error(formatDueloDbError(error));
}

export function publicDuelo2v2Path(id: string): string {
  return `/public/duelo-2v2/${id}`;
}

export function publicDuelo2v2Url(id: string): string {
  if (typeof window === "undefined") return publicDuelo2v2Path(id);
  return `${window.location.origin}${publicDuelo2v2Path(id)}`;
}

export function parejaLabel(j1: string, j2: string): string {
  return `${j1} / ${j2}`;
}

export function duelo2v2GestionarPath(id: string): string {
  return `/duelo-2v2/${id}/gestionar`;
}

/** Realtime para vista pública (marcador en vivo). */
export function subscribeDuelo2v2(
  dueloId: string,
  onChange: () => void
): () => void {
  let cancelled = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let ready = false;

  const channel = supabase.channel(`duelo-2v2:${dueloId}`);

  const handler = () => {
    if (cancelled || !ready) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!cancelled) onChange();
    }, 500);
  };

  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "duelos_2v2",
      filter: `id=eq.${dueloId}`,
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
