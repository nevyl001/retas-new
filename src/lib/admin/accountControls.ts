import { supabase } from "../supabaseClient";
import type { RivieraJugadorCategoria } from "../rivieraJugadores/types";
import {
  DEFAULT_ORGANIZADOR_GAME_MODES,
  inputFromEnabledModes,
  rowToAccountSettings,
  type OrganizadorAccountSettings,
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

function isMissingColumnError(
  error: { code?: string; message?: string } | null,
  column: string
): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "42703" ||
    msg.includes(column.toLowerCase()) ||
    msg.includes("does not exist")
  );
}

export async function fetchOrganizadorAccountSettings(
  organizadorId: string
): Promise<OrganizadorAccountSettings> {
  const { data, error } = await supabase
    .from("organizador_game_modes")
    .select("*")
    .eq("organizador_id", organizadorId)
    .maybeSingle();

  if (error) {
    if (
      isMissingTableError(error) ||
      isMissingColumnError(error, "permite_ajuste_puntos_manuales") ||
      isMissingColumnError(error, "visible_ranking_oficial") ||
      isMissingColumnError(error, "premium_branding_enabled") ||
      isMissingColumnError(error, "branding_key")
    ) {
      return rowToAccountSettings(DEFAULT_ORGANIZADOR_GAME_MODES);
    }
    console.warn("[admin] fetchOrganizadorAccountSettings:", error);
    return rowToAccountSettings(DEFAULT_ORGANIZADOR_GAME_MODES);
  }

  return rowToAccountSettings((data as OrganizadorGameModesRow | null) ?? null);
}

/** @deprecated Usar fetchOrganizadorAccountSettings */
export async function fetchOrganizadorGameModes(
  organizadorId: string
): Promise<OrganizadorAccountSettings["modes"]> {
  const settings = await fetchOrganizadorAccountSettings(organizadorId);
  return settings.modes;
}

export async function upsertOrganizadorAccountSettings(
  organizadorId: string,
  settings: OrganizadorAccountSettings
): Promise<void> {
  const payload: OrganizadorGameModesRow = {
    organizador_id: organizadorId,
    ...inputFromEnabledModes(
      settings.modes,
      settings.permiteAjustePuntosManuales,
      settings.visibleRankingOficial,
      settings.premiumBrandingEnabled,
      settings.brandingKey
    ),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("organizador_game_modes")
    .upsert(payload, { onConflict: "organizador_id" });

  if (error) {
    throw new Error(error.message || "No se pudo guardar la configuración");
  }
}

/** @deprecated Usar upsertOrganizadorAccountSettings */
export async function upsertOrganizadorGameModes(
  organizadorId: string,
  modes: OrganizadorAccountSettings["modes"]
): Promise<void> {
  const current = await fetchOrganizadorAccountSettings(organizadorId);
  await upsertOrganizadorAccountSettings(organizadorId, {
    modes,
    permiteAjustePuntosManuales: current.permiteAjustePuntosManuales,
    visibleRankingOficial: current.visibleRankingOficial,
    premiumBrandingEnabled: current.premiumBrandingEnabled,
    brandingKey: current.brandingKey,
  });
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
      visible_publico: row.visible_publico === true,
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
  const { suma_ranking: _ignored, ...rest } = patch;
  const { error } = await supabase
    .from("riviera_jugadores")
    .update({ ...rest, suma_ranking: true })
    .eq("id", jugadorId);

  if (error) throw new Error(error.message || "No se pudo actualizar el jugador");
}

export async function bulkUpdateJugadoresAdminControls(
  organizadorId: string,
  jugadorIds: string[],
  patch: Partial<{
    suma_ranking: boolean;
    visible_publico: boolean;
  }>
): Promise<number> {
  const ids = Array.from(
    new Set(jugadorIds.map((id) => id.trim()).filter(Boolean))
  );
  if (ids.length === 0) return 0;

  const { suma_ranking: _ignored, ...rest } = patch;
  const { error, count } = await supabase
    .from("riviera_jugadores")
    .update({ ...rest, suma_ranking: true }, { count: "exact" })
    .eq("organizador_id", organizadorId)
    .in("id", ids);

  if (error) {
    throw new Error(error.message || "No se pudo actualizar los jugadores");
  }

  return count ?? ids.length;
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

/** ¿El ranking público de esta cuenta está publicado en el sitio? */
export async function isOrganizadorRankingPublico(
  organizadorId: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from("riviera_jugadores")
    .select("id", { count: "exact", head: true })
    .eq("organizador_id", organizadorId)
    .eq("estado", "activo")
    .eq("visible_publico", true);

  if (error) {
    if (isMissingTableError(error)) {
      const settings = await fetchOrganizadorAccountSettings(organizadorId);
      return settings.visibleRankingOficial;
    }
    console.warn("[admin] isOrganizadorRankingPublico:", error);
    return false;
  }

  return (count ?? 0) > 0;
}

/** Marca el club como publicado (compatibilidad con datos legacy). */
export async function ensureOrganizadorRankingPublico(
  organizadorId: string
): Promise<void> {
  const current = await fetchOrganizadorAccountSettings(organizadorId);
  if (current.visibleRankingOficial) return;
  await upsertOrganizadorAccountSettings(organizadorId, {
    ...current,
    visibleRankingOficial: true,
  });
}

export async function updateJugadorAdminControlsForOrganizer(
  organizadorId: string,
  jugadorId: string,
  patch: Parameters<typeof updateJugadorAdminControls>[1]
): Promise<void> {
  if (patch.visible_publico === true) {
    await ensureOrganizadorRankingPublico(organizadorId);
  }
  await updateJugadorAdminControls(jugadorId, patch);
}

export async function bulkUpdateJugadoresAdminControlsForOrganizer(
  organizadorId: string,
  jugadorIds: string[],
  patch: Parameters<typeof bulkUpdateJugadoresAdminControls>[2]
): Promise<number> {
  if (patch.visible_publico === true) {
    await ensureOrganizadorRankingPublico(organizadorId);
  }
  return bulkUpdateJugadoresAdminControls(organizadorId, jugadorIds, patch);
}

export interface OrganizadorRankingOficial {
  organizador_id: string;
  nombre: string;
  email: string;
}

/** Clubs con ranking publicado en el sitio oficial (índice /ranking). */
export async function listOrganizadoresRankingOficial(): Promise<
  OrganizadorRankingOficial[]
> {
  const { data, error } = await supabase.rpc("riviera_organizadores_ranking_oficial");

  if (error) {
    if (
      isMissingTableError(error) ||
      error.message?.includes("riviera_organizadores_ranking_oficial")
    ) {
      return [];
    }
    console.warn("[admin] listOrganizadoresRankingOficial:", error);
    return [];
  }

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    organizador_id: String(row.organizador_id ?? ""),
    nombre: String(row.nombre ?? "").trim() || "Club",
    email: String(row.email ?? "").trim(),
  }));
}

/** ¿Este jugador puede verse en el ranking/perfil oficial (appriviera)? */
export async function isJugadorVisibleSitioOficial(
  jugadorId: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_jugador_visible_sitio_oficial", {
    p_jugador_id: jugadorId,
  });

  if (error) {
    if (
      isMissingTableError(error) ||
      error.message?.includes("is_jugador_visible_sitio_oficial")
    ) {
      return false;
    }
    console.warn("[admin] isJugadorVisibleSitioOficial:", error);
    return false;
  }

  return data === true;
}
