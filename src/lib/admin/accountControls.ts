import { supabase } from "../supabaseClient";
import type { RivieraJugadorCategoria } from "../rivieraJugadores/types";
import {
  publicacionLocalFallback,
  type PublicacionMasivaResult,
  type PublicacionOficialEstado,
  type PublicacionOficialResult,
} from "./publicacionOficial";
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
    // B) error de consulta (tabla/columna ausente u otro fallo) → DEFAULT
    if (
      isMissingTableError(error) ||
      isMissingColumnError(error, "permite_ajuste_puntos_manuales") ||
      isMissingColumnError(error, "visible_ranking_oficial") ||
      isMissingColumnError(error, "premium_branding_enabled") ||
      isMissingColumnError(error, "branding_key")
    ) {
      console.warn(
        "[admin] fetchOrganizadorAccountSettings: DEFAULT por error de consulta (schema/tabla)",
        { organizadorId, code: error.code, message: error.message }
      );
      return rowToAccountSettings(DEFAULT_ORGANIZADOR_GAME_MODES);
    }
    console.warn(
      "[admin] fetchOrganizadorAccountSettings: DEFAULT por error de consulta",
      { organizadorId, code: error.code, message: error.message }
    );
    return rowToAccountSettings(DEFAULT_ORGANIZADOR_GAME_MODES);
  }

  if (data == null) {
    // A) fila inexistente → DEFAULT (distinto de error de consulta)
    console.warn(
      "[admin] fetchOrganizadorAccountSettings: DEFAULT por fila inexistente",
      { organizadorId }
    );
    return rowToAccountSettings(null);
  }

  return rowToAccountSettings(data as OrganizadorGameModesRow);
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
  publicacion: PublicacionOficialEstado;
}

const PUBLICACION_CODES = [
  "publicado",
  "ya_publicado",
  "retirado",
  "sin_cambio",
  "conflicto",
  "prohibido",
  "no_autorizado",
] as const;

function isMissingRpcError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST202" ||
    msg.includes("admin_directorio_publicacion_oficial") ||
    msg.includes("admin_set_publicacion_oficial") ||
    (msg.includes("function") && msg.includes("does not exist"))
  );
}

function asPublicacionEstado(raw: Record<string, unknown>): PublicacionOficialEstado {
  return {
    rivieraId: raw.riviera_id ? String(raw.riviera_id) : null,
    esCedido: raw.es_cedido === true,
    publicadoGlobal: raw.publicado_global === true,
    publicacionPropia: raw.publicacion_propia === true,
    origenOrganizadorId: raw.origen_organizador_id
      ? String(raw.origen_organizador_id)
      : null,
    origenNombre: raw.origen_nombre ? String(raw.origen_nombre) : null,
    conflicto: raw.conflicto === true,
    puedePublicar: raw.puede_publicar === true,
    puedeRetirar: raw.puede_retirar === true,
    motivoBloqueo: raw.motivo_bloqueo ? String(raw.motivo_bloqueo) : null,
  };
}

function asPublicacionResult(raw: Record<string, unknown>): PublicacionOficialResult {
  const code = String(raw.code ?? "sin_cambio");
  const known = PUBLICACION_CODES.find((item) => item === code) ?? "sin_cambio";
  return {
    ok: raw.ok === true,
    code: known,
    publicado: raw.publicado === true,
    perfilPublicadoId: raw.perfil_publicado_id
      ? String(raw.perfil_publicado_id)
      : null,
    origenNombre: raw.origen_nombre ? String(raw.origen_nombre) : null,
    organizadorPublicadoId: raw.organizador_publicado_id
      ? String(raw.organizador_publicado_id)
      : null,
  };
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

  const filas = (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const stats = row.stats as
      | { puntos_totales?: number }
      | { puntos_totales?: number }[]
      | null;
    const st = Array.isArray(stats) ? stats[0] : stats;
    const visible = row.visible_publico === true;
    const estado = String(row.estado ?? "activo");
    return {
      id: String(row.id),
      nombre: String(row.nombre ?? ""),
      slug: String(row.slug ?? ""),
      categoria: String(row.categoria ?? ""),
      estado,
      visible_publico: visible,
      suma_ranking: row.suma_ranking !== false,
      puntos_totales: Number(st?.puntos_totales ?? 0),
      created_at: String(row.created_at ?? ""),
      publicacion: publicacionLocalFallback(visible, estado === "archivado"),
    };
  });

  const { data: publicacion, error: publicacionError } = await supabase.rpc(
    "admin_directorio_publicacion_oficial",
    { p_organizador_id: organizadorId }
  );

  if (publicacionError) {
    if (isMissingRpcError(publicacionError)) return filas;
    throw new Error(
      publicacionError.message || "No se pudo leer la publicación oficial"
    );
  }

  const porId = new Map<string, PublicacionOficialEstado>();
  for (const raw of (publicacion ?? []) as Record<string, unknown>[]) {
    const estado = asPublicacionEstado(raw);
    const id = String(raw.jugador_id ?? "");
    if (id) porId.set(id, estado);
  }

  return filas.map((fila) => {
    const estado = porId.get(fila.id);
    if (!estado) {
      return {
        ...fila,
        publicacion: {
          ...fila.publicacion,
          puedePublicar: false,
          puedeRetirar: false,
          motivoBloqueo: "No se pudo verificar la publicación global.",
        },
      };
    }
    return {
      ...fila,
      visible_publico: estado.publicadoGlobal,
      publicacion: estado,
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
  const { suma_ranking: _ignored, visible_publico: _publico, ...rest } = patch;
  if (Object.keys(rest).length === 0) return;
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

  const { suma_ranking: _ignored, visible_publico: _publico, ...rest } = patch;
  if (Object.keys(rest).length === 0) return ids.length;
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
  input: { nombre: string; email: string; categoria?: RivieraJugadorCategoria }
): Promise<void> {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("El nombre es obligatorio");

  const { normalizeRequiredEmail } = await import(
    "../rivieraJugadores/emailValidation"
  );
  const email = normalizeRequiredEmail(input.email);

  const { createRivieraJugador } = await import(
    "../rivieraJugadores/rivieraJugadoresService"
  );
  await createRivieraJugador(organizadorId, {
    nombre,
    email,
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
): Promise<PublicacionOficialResult | null> {
  let result: PublicacionOficialResult | null = null;
  if (typeof patch.visible_publico === "boolean") {
    const { data, error } = await supabase.rpc("admin_set_publicacion_oficial", {
      p_organizador_id: organizadorId,
      p_jugador_id: jugadorId,
      p_publicar: patch.visible_publico,
    });
    if (error) {
      if (isMissingRpcError(error)) {
        throw new Error(
          "Falta aplicar la migración de publicación oficial. No se creó otra ficha."
        );
      }
      throw new Error(error.message || "No se pudo actualizar la publicación");
    }
    result = asPublicacionResult((data ?? {}) as Record<string, unknown>);
  }
  await updateJugadorAdminControls(jugadorId, patch);
  const { invalidatePlayersPool } = await import(
    "../rivieraJugadores/playersPoolCache"
  );
  invalidatePlayersPool(organizadorId);
  return result;
}

export async function bulkUpdateJugadoresAdminControlsForOrganizer(
  organizadorId: string,
  jugadorIds: string[],
  patch: Parameters<typeof bulkUpdateJugadoresAdminControls>[2]
): Promise<PublicacionMasivaResult> {
  if (typeof patch.visible_publico !== "boolean") {
    await bulkUpdateJugadoresAdminControls(organizadorId, jugadorIds, patch);
    return {
      ok: true,
      publicados: 0,
      yaPublicados: 0,
      retirados: 0,
      conflictos: 0,
      bloqueados: 0,
      noAutorizados: 0,
    };
  }

  const { data, error } = await supabase.rpc(
    "admin_set_publicacion_oficial_masiva",
    {
      p_organizador_id: organizadorId,
      p_jugador_ids: jugadorIds,
      p_publicar: patch.visible_publico,
    }
  );
  if (error) {
    if (isMissingRpcError(error)) {
      throw new Error(
        "Falta aplicar la migración de publicación oficial. No se creó otra ficha."
      );
    }
    throw new Error(error.message || "No se pudo actualizar los jugadores");
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  const result: PublicacionMasivaResult = {
    ok: raw.ok !== false,
    publicados: Number(raw.publicados ?? 0),
    yaPublicados: Number(raw.ya_publicados ?? 0),
    retirados: Number(raw.retirados ?? 0),
    conflictos: Number(raw.conflictos ?? 0),
    bloqueados: Number(raw.bloqueados ?? 0),
    noAutorizados: Number(raw.no_autorizados ?? 0),
  };
  const { invalidatePlayersPool } = await import(
    "../rivieraJugadores/playersPoolCache"
  );
  invalidatePlayersPool(organizadorId);
  return result;
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
