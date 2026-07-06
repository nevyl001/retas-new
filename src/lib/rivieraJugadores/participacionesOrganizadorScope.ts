import { supabase, supabasePublicRead } from "../supabaseClient";
import type { JugadorParticipacion } from "./types";

export type ParticipacionOrganizadorScopeOptions = {
  /** Club dueño del perfil riviera_jugadores (origen). */
  jugadorHomeOrganizadorId?: string | null;
};

/** Club al que pertenece una participación (metadata o club del perfil). */
export function resolveParticipacionOrganizadorId(
  row: JugadorParticipacion,
  jugadorHomeOrganizadorId?: string | null
): string | null {
  const metaOrg = String(row.metadata?.organizador_id ?? "").trim();
  if (metaOrg) return metaOrg;
  const home = jugadorHomeOrganizadorId?.trim();
  return home || null;
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

/**
 * Completa metadata.organizador_id desde duelos_2v2 / torneo_express cuando falta.
 * Usa RPC SECURITY DEFINER para duelos de otros clubes (RLS cross-club).
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

  const dueloIds = Array.from(new Set(needsDuelo.map((r) => r.evento_id.trim())));
  const torneoIds = Array.from(
    new Set(needsTorneo.map((r) => r.evento_id.trim()))
  );

  const { dueloOrgById, torneoOrgById } = await fetchEventOrganizadorMaps(
    dueloIds,
    torneoIds
  );

  if (dueloOrgById.size === 0 && torneoOrgById.size === 0) return rows;

  return rows.map((row) => {
    if (String(row.metadata?.organizador_id ?? "").trim()) return row;
    const eventoId = row.evento_id.trim();
    if (row.tipo_evento === "duelo_2v2") {
      const org = dueloOrgById.get(eventoId);
      if (org) return withOrganizadorMetadata(row, org);
    }
    if (row.tipo_evento === "torneo_express") {
      const org = torneoOrgById.get(eventoId);
      if (org) return withOrganizadorMetadata(row, org);
    }
    return row;
  });
}
