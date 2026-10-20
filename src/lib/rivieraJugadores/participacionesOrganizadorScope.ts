import { supabase, supabasePublicRead } from "../supabaseClient";
import type { JugadorParticipacion } from "./types";

export type ParticipacionOrganizadorScopeOptions = {
  /** Club dueño del perfil riviera_jugadores (origen). */
  jugadorHomeOrganizadorId?: string | null;
};

/** Dedup de warnings: una vez por participación (o evento) por sesión de página. */
const orphanOrganizadorsWarned = new Set<string>();
let orphanOrganizadorsWarnedCount = 0;
const ORPHAN_WARN_CAP = 3;

function warnOrphanParticipacionOnce(row: JugadorParticipacion): void {
  if (process.env.NODE_ENV === "production") return;
  if (typeof console === "undefined") return;

  const key =
    String((row as { id?: string }).id ?? "").trim() ||
    `${row.jugador_id}|${row.tipo_evento}|${row.evento_id}`;
  if (!key || orphanOrganizadorsWarned.has(key)) return;
  if (orphanOrganizadorsWarnedCount >= ORPHAN_WARN_CAP) return;

  orphanOrganizadorsWarned.add(key);
  orphanOrganizadorsWarnedCount += 1;
  console.warn(
    "[riviera-jugadores] participación huérfana: falta metadata.organizador_id, se excluye de la atribución por club",
    {
      jugadorId: row.jugador_id,
      eventoId: row.evento_id,
      tipoEvento: row.tipo_evento,
      participacionId: (row as { id?: string }).id,
    }
  );
}

/**
 * Club al que pertenece una participación.
 *
 * IMPORTANTE: NUNCA se debe "adivinar" el club usando el perfil de origen
 * del jugador (jugadorHomeOrganizadorId). Antes, si faltaba
 * metadata.organizador_id (evento padre borrado, fila legacy, fallo de
 * enrichment, race condition), esta función asignaba la participación al
 * club de origen del perfil aunque el jugador hubiera jugado en otro club —
 * causando que todo lo "sin metadata limpia" se apilara en un solo club.
 *
 * Ahora: si falta metadata.organizador_id, la participación se trata como
 * huérfana (retorna null) y se excluye de la atribución por club, en vez de
 * asignarse a ciegas. Debe corregirse en origen (ver
 * supabase/diagnose-participaciones-organizador-huerfanas.sql).
 *
 * @param jugadorHomeOrganizadorId Ya no se usa para resolver el club; se
 * mantiene el parámetro por compatibilidad de firma con los llamadores
 * existentes. No lo elimines sin revisar todos los call sites.
 */
export function resolveParticipacionOrganizadorId(
  row: JugadorParticipacion,
  jugadorHomeOrganizadorId?: string | null
): string | null {
  const metaOrg = String(row.metadata?.organizador_id ?? "").trim();
  if (metaOrg) return metaOrg;

  warnOrphanParticipacionOnce(row);
  return null;
}

/** Participaciones visibles en ranking/ficha interna de un organizador. */
export function filterParticipacionesForOrganizador(
  rows: JugadorParticipacion[],
  organizadorId: string,
  options?: ParticipacionOrganizadorScopeOptions
): JugadorParticipacion[] {
  const org = organizadorId.trim();
  if (!org) return rows;
  return rows.filter((row) => {
    const rowOrg = resolveParticipacionOrganizadorId(
      row,
      options?.jugadorHomeOrganizadorId
    );
    if (!rowOrg) return false;
    return rowOrg === org;
  });
}

export function sumPuntosFromParticipaciones(
  rows: JugadorParticipacion[]
): number {
  return rows.reduce((sum, row) => sum + (row.puntos_obtenidos ?? 0), 0);
}

/** @deprecated Usar filterOtherClubHistorial en nativeMulticlubHomeView */
export { filterOtherClubHistorial as filterOtherClubParticipaciones } from "./nativeMulticlubHomeView";

/** Puntos en otros clubes detectados por metadata/evento (perfil origen). */
export function groupPuntosByOtherOrganizadores(
  rows: JugadorParticipacion[],
  homeOrganizadorId: string
): Array<{ organizadorId: string; puntosTotales: number }> {
  const home = homeOrganizadorId.trim();
  if (!home) return [];

  const byOrg = new Map<string, number>();
  for (const row of rows) {
    const org = resolveParticipacionOrganizadorId(row, home)?.trim();
    if (!org || org === home) continue;
    byOrg.set(org, (byOrg.get(org) ?? 0) + (row.puntos_obtenidos ?? 0));
  }

  return Array.from(byOrg.entries()).map(([organizadorId, puntosTotales]) => ({
    organizadorId,
    puntosTotales,
  }));
}

function withOrganizadorMetadata(
  row: JugadorParticipacion,
  organizadorId: string
): JugadorParticipacion {
  return {
    ...row,
    metadata: {
      ...(row.metadata ?? {}),
      organizador_id: organizadorId,
    },
  };
}

function isMissingResolveRpcError(error: {
  code?: string;
  message?: string;
  status?: number;
} | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.status === 404 ||
    error.code === "42883" ||
    error.code === "PGRST202" ||
    msg.includes("riviera_resolve_event_organizador_ids")
  );
}

function parseUuidList(ids: string[]): string[] {
  return Array.from(
    new Set(
      ids
        .map((id) => id.trim())
        .filter((id) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        )
    )
  );
}

async function fetchEventOrganizadorMaps(
  dueloIds: string[],
  torneoIds: string[]
): Promise<{ dueloOrgById: Map<string, string>; torneoOrgById: Map<string, string> }> {
  const dueloOrgById = new Map<string, string>();
  const torneoOrgById = new Map<string, string>();

  const dueloUuidList = parseUuidList(dueloIds);
  const torneoUuidList = parseUuidList(torneoIds);

  if (dueloUuidList.length > 0 || torneoUuidList.length > 0) {
    const { data, error } = await supabase.rpc(
      "riviera_resolve_event_organizador_ids",
      {
        p_duelo_ids: dueloUuidList,
        p_torneo_ids: torneoUuidList,
      }
    );

    if (!error) {
      for (const row of data ?? []) {
        const eventoId = String((row as { evento_id?: string }).evento_id ?? "").trim();
        const org = String(
          (row as { organizador_id?: string }).organizador_id ?? ""
        ).trim();
        const tipo = String((row as { tipo_evento?: string }).tipo_evento ?? "").trim();
        if (!eventoId || !org) continue;
        if (tipo === "duelo_2v2") dueloOrgById.set(eventoId, org);
        else if (tipo === "torneo_express") torneoOrgById.set(eventoId, org);
      }
    } else if (!isMissingResolveRpcError(error)) {
      console.warn(
        "[riviera-jugadores] riviera_resolve_event_organizador_ids:",
        error
      );
    }
  }

  if (dueloUuidList.length > 0 && dueloOrgById.size < dueloUuidList.length) {
    for (const client of [supabasePublicRead, supabase]) {
      const { data, error } = await client
        .from("duelos_2v2")
        .select("id, organizador_id")
        .in("id", dueloUuidList);
      if (!error) {
        for (const row of data ?? []) {
          const id = String((row as { id?: string }).id ?? "").trim();
          const org = String((row as { organizador_id?: string }).organizador_id ?? "").trim();
          if (id && org && !dueloOrgById.has(id)) dueloOrgById.set(id, org);
        }
      }
      if (dueloOrgById.size >= dueloUuidList.length) break;
    }
  }

  if (torneoUuidList.length > 0 && torneoOrgById.size < torneoUuidList.length) {
    for (const client of [supabasePublicRead, supabase]) {
      const { data, error } = await client
        .from("torneo_express")
        .select("id, organizador_id")
        .in("id", torneoUuidList);
      if (!error) {
        for (const row of data ?? []) {
          const id = String((row as { id?: string }).id ?? "").trim();
          const org = String((row as { organizador_id?: string }).organizador_id ?? "").trim();
          if (id && org && !torneoOrgById.has(id)) torneoOrgById.set(id, org);
        }
      }
      if (torneoOrgById.size >= torneoUuidList.length) break;
    }
  }

  return { dueloOrgById, torneoOrgById };
}

function hasTorneoCategoriaMetadata(row: JugadorParticipacion): boolean {
  const meta = row.metadata ?? {};
  const raw = meta.categoria;
  return typeof raw === "string" && raw.trim().length > 0;
}

/**
 * Categoría real de cada torneo_express (id -> categoria) en UNA consulta por
 * lote (sin N+1). Solo lectura: no modifica datos históricos.
 */
async function fetchTorneoCategoriaMap(
  torneoIds: string[]
): Promise<Map<string, string>> {
  const categoriaById = new Map<string, string>();
  const torneoUuidList = parseUuidList(torneoIds);
  if (torneoUuidList.length === 0) return categoriaById;

  for (const client of [supabasePublicRead, supabase]) {
    const { data, error } = await client
      .from("torneo_express")
      .select("id, categoria")
      .in("id", torneoUuidList);
    if (!error) {
      for (const row of data ?? []) {
        const id = String((row as { id?: string }).id ?? "").trim();
        const categoria = String(
          (row as { categoria?: string | null }).categoria ?? ""
        ).trim();
        if (id && categoria && !categoriaById.has(id)) {
          categoriaById.set(id, categoria);
        }
      }
    }
    if (categoriaById.size >= torneoUuidList.length) break;
  }

  return categoriaById;
}

function withCategoriaMetadata(
  row: JugadorParticipacion,
  categoria: string
): JugadorParticipacion {
  return {
    ...row,
    metadata: {
      ...(row.metadata ?? {}),
      categoria,
    },
  };
}

/**
 * Completa metadata.organizador_id desde duelos_2v2 / torneo_express cuando falta.
 * Usa RPC SECURITY DEFINER para duelos de otros clubes (RLS cross-club).
 *
 * Además completa metadata.categoria de las participaciones de torneo_express
 * (histórico sin categoría guardada) leyendo la categoría real del torneo por
 * su id, aunque metadata.organizador_id ya exista. No altera la atribución por
 * club ni ningún otro metadato.
 */
export async function enrichParticipacionesOrganizadorFromEvents(
  rows: JugadorParticipacion[]
): Promise<JugadorParticipacion[]> {
  if (rows.length === 0) return rows;

  const needsDuelo = rows.filter(
    (r) =>
      r.tipo_evento === "duelo_2v2" &&
      !String(r.metadata?.organizador_id ?? "").trim() &&
      r.evento_id?.trim()
  );
  const needsTorneo = rows.filter(
    (r) =>
      r.tipo_evento === "torneo_express" &&
      !String(r.metadata?.organizador_id ?? "").trim() &&
      r.evento_id?.trim()
  );
  const needsTorneoCategoria = rows.filter(
    (r) =>
      r.tipo_evento === "torneo_express" &&
      !hasTorneoCategoriaMetadata(r) &&
      r.evento_id?.trim()
  );

  const dueloIds = Array.from(new Set(needsDuelo.map((r) => r.evento_id.trim())));
  const torneoIds = Array.from(
    new Set(needsTorneo.map((r) => r.evento_id.trim()))
  );
  const torneoCategoriaIds = Array.from(
    new Set(needsTorneoCategoria.map((r) => r.evento_id.trim()))
  );

  const [{ dueloOrgById, torneoOrgById }, torneoCategoriaById] =
    await Promise.all([
      fetchEventOrganizadorMaps(dueloIds, torneoIds),
      fetchTorneoCategoriaMap(torneoCategoriaIds),
    ]);

  if (
    dueloOrgById.size === 0 &&
    torneoOrgById.size === 0 &&
    torneoCategoriaById.size === 0
  ) {
    return rows;
  }

  return rows.map((row) => {
    let next = row;
    const eventoId = row.evento_id.trim();
    const hasOrg = Boolean(String(row.metadata?.organizador_id ?? "").trim());

    if (!hasOrg) {
      if (row.tipo_evento === "duelo_2v2") {
        const org = dueloOrgById.get(eventoId);
        if (org) next = withOrganizadorMetadata(next, org);
      } else if (row.tipo_evento === "torneo_express") {
        const org = torneoOrgById.get(eventoId);
        if (org) next = withOrganizadorMetadata(next, org);
      }
    }

    if (
      row.tipo_evento === "torneo_express" &&
      !hasTorneoCategoriaMetadata(row)
    ) {
      const categoria = torneoCategoriaById.get(eventoId);
      if (categoria) next = withCategoriaMetadata(next, categoria);
    }

    return next;
  });
}
