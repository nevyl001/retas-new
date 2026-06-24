import { supabase } from "../supabaseClient";
import type { GameModeId } from "../../components/home/gameModesConfig";
import type { RivieraJugadorCategoria } from "../rivieraJugadores/types";
import {
  DEFAULT_ORGANIZADOR_GAME_MODES,
  inputFromEnabledModes,
  rowToEnabledModes,
  type OrganizadorGameModesInput,
  type OrganizadorGameModesRow,
} from "./organizadorGameModes";

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    msg.includes("organizador_game_modes") ||
    msg.includes("does not exist")
  );
}

export async function fetchOrganizadorGameModes(
  organizadorId: string
): Promise<Record<GameModeId, boolean>> {
  const { data, error } = await supabase
    .from("organizador_game_modes")
    .select("*")
    .eq("organizador_id", organizadorId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) {
      return rowToEnabledModes(DEFAULT_ORGANIZADOR_GAME_MODES);
    }
    console.warn("[admin] fetchOrganizadorGameModes:", error);
    return rowToEnabledModes(DEFAULT_ORGANIZADOR_GAME_MODES);
  }

  return rowToEnabledModes((data as OrganizadorGameModesRow | null) ?? null);
}

export async function upsertOrganizadorGameModes(
  organizadorId: string,
  modes: Record<GameModeId, boolean>
): Promise<void> {
  const payload: OrganizadorGameModesRow = {
    organizador_id: organizadorId,
    ...inputFromEnabledModes(modes),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("organizador_game_modes")
    .upsert(payload, { onConflict: "organizador_id" });

  if (error) {
    throw new Error(error.message || "No se pudieron guardar los modos de juego");
  }
}

export interface AdminJugadorRow {
  id: string;
  nombre: string;
  slug: string;
  categoria: string;
  estado: string;
  visible_publico: boolean;
  suma_ranking: boolean;
  puntos_totales: number;
  created_at: string;
}

export async function listJugadoresForAdmin(
  organizadorId: string
): Promise<AdminJugadorRow[]> {
  const { data, error } = await supabase
    .from("riviera_jugadores")
    .select(
      "id, nombre, slug, categoria, estado, visible_publico, suma_ranking, created_at, stats:jugador_stats(puntos_totales)"
    )
    .eq("organizador_id", organizadorId)
    .order("nombre");

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw error;
  }

  return (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const stats = row.stats as
      | { puntos_totales?: number }
      | { puntos_totales?: number }[]
      | null;
    const st = Array.isArray(stats) ? stats[0] : stats;
    return {
      id: String(row.id),
      nombre: String(row.nombre ?? ""),
      slug: String(row.slug ?? ""),
      categoria: String(row.categoria ?? ""),
      estado: String(row.estado ?? "activo"),
      visible_publico: row.visible_publico !== false,
      suma_ranking: row.suma_ranking !== false,
      puntos_totales: Number(st?.puntos_totales ?? 0),
      created_at: String(row.created_at ?? ""),
    };
  });
}

export async function updateJugadorAdminControls(
  jugadorId: string,
  patch: Partial<{
    suma_ranking: boolean;
    visible_publico: boolean;
    estado: "activo" | "invitado" | "archivado";
  }>
): Promise<void> {
  const { error } = await supabase
    .from("riviera_jugadores")
    .update(patch)
    .eq("id", jugadorId);

  if (error) throw new Error(error.message || "No se pudo actualizar el jugador");
}

export async function createJugadorForAdmin(
  organizadorId: string,
  input: { nombre: string; categoria?: RivieraJugadorCategoria }
): Promise<void> {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("El nombre es obligatorio");

  const { createRivieraJugador } = await import(
    "../rivieraJugadores/rivieraJugadoresService"
  );
  await createRivieraJugador(organizadorId, {
    nombre,
    categoria: input.categoria ?? "3ra_fuerza",
  });
}

export async function removeJugadorForAdmin(
  organizadorId: string,
  jugadorId: string
): Promise<void> {
  const { deleteRivieraJugador } = await import(
    "../rivieraJugadores/rivieraJugadoresService"
  );
  await deleteRivieraJugador(organizadorId, jugadorId);
}
