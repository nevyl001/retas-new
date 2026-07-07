/**
 * Motor de auditoría arquitectónica — carrera global multiclub.
 * Valida TODOS los Riviera ID contra reglas congeladas.
 */

export const HACK_PADEL_ORG_DEFAULT = "e724de97-3552-4a01-a269-f621e6f1ed26";
export const RIVIERA_OPEN_ORG_DEFAULT = "2770b522-9064-4c7b-a729-4a0ea7e3f6e8";

export const REQUIRED_RIVIERA_IDS = [
  "RIV-00000071",
  "RIV-00000003",
  "RIV-00000031",
  "RIV-00000011",
  "RIV-00000009",
  "RIV-00000024",
  "RIV-00000019",
  "RIV-00000041",
];

export function participacionKey(row) {
  return String(row?.id ?? "").trim();
}

export function sumPuntos(rows) {
  return rows.reduce((acc, r) => acc + Number(r.puntos_obtenidos ?? r.puntos ?? 0), 0);
}

export async function rpcCareerIds(supabase, anchorId) {
  const { data, error } = await supabase.rpc("get_public_career_jugador_ids", {
    p_jugador_id: anchorId,
  });
  if (error) throw new Error(`get_public_career_jugador_ids(${anchorId}): ${error.message}`);
  return Array.from(
    new Set(
      (data ?? [])
        .map((row) => (typeof row === "string" ? row : String(row?.jugador_id ?? row)))
        .filter(Boolean)
    )
  );
}

export async function rpcCareerParticipaciones(supabase, anchorId, limit = 500) {
  const { data, error } = await supabase.rpc("riviera_list_career_participaciones_public", {
    p_jugador_id: anchorId,
    p_limit: limit,
  });
  if (error) {
    throw new Error(`riviera_list_career_participaciones_public(${anchorId}): ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    ...row,
    id: String(row.id),
    jugador_id: String(row.jugador_id),
    puntos_obtenidos: Number(row.puntos_obtenidos ?? 0),
  }));
}

export async function rpcParticipacionesForIds(supabase, jugadorIds, limit = 500) {
  if (jugadorIds.length === 0) return null;
  const { data, error } = await supabase.rpc("riviera_list_participaciones_for_jugador_ids", {
    p_jugador_ids: jugadorIds,
    p_limit: limit,
  });
  if (error) {
    if (
      error.code === "42883" ||
      error.code === "PGRST202" ||
      String(error.message).includes("riviera_list_participaciones_for_jugador_ids")
    ) {
      return null;
    }
    throw new Error(`riviera_list_participaciones_for_jugador_ids: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    ...row,
    id: String(row.id),
    jugador_id: String(row.jugador_id),
    puntos_obtenidos: Number(row.puntos_obtenidos ?? 0),
  }));
}

export async function fetchDbParticipaciones(supabase, jugadorIds) {
  if (jugadorIds.length === 0) return [];

  const viaRpc = await rpcParticipacionesForIds(supabase, jugadorIds, 500);
  if (viaRpc) {
    return viaRpc;
  }

  const careerRows = await rpcCareerParticipaciones(supabase, jugadorIds[0] ?? "");
  if (careerRows.length > 0) {
    return careerRows;
  }

  return [];
}

export function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/**
 * Audita un Riviera ID y sus perfiles vinculados.
 * @returns {{ rivieraId, issues: Array, multiclub: boolean, profileCount: number }}
 */
export async function auditRivieraIdentity(supabase, identity, orgIds) {
  const rivieraId = String(identity.riviera_id);
  let officialKey = String(identity.official_player_key ?? "");
  const issues = [];

  const { data: duplicateRiviera } = await supabase
    .from("riviera_official_player_identity")
    .select("official_player_key")
    .eq("riviera_id", rivieraId);
  if ((duplicateRiviera ?? []).length > 1) {
    issues.push({
      code: "DUPLICATE_RIVIERA_ID",
      rivieraId,
      details: { count: duplicateRiviera.length },
    });
  }

  let profileIds = [];
  let links = [];

  if (officialKey) {
    const { data: linksData, error: linkErr } = await supabase
      .from("riviera_official_player_profile_link")
      .select("riviera_jugador_id, official_player_key")
      .eq("official_player_key", officialKey);
    if (!linkErr && (linksData ?? []).length > 0) {
      links = linksData;
      profileIds = Array.from(
        new Set(links.map((l) => String(l.riviera_jugador_id)).filter(Boolean))
      );
    }
  }

  if (profileIds.length === 0) {
    const anchor = identity.canonical_riviera_jugador_id?.trim() || null;
    const { data: identityRows, error: idRpcErr } = await supabase.rpc(
      "resolve_public_player_identity",
      {
        p_jugador_id: anchor,
        p_riviera_id: rivieraId,
      }
    );
    if (idRpcErr) {
      issues.push({
        code: "IDENTITY_RPC_ERROR",
        rivieraId,
        details: { error: idRpcErr.message },
      });
      return {
        rivieraId,
        nombre: null,
        issues,
        multiclub: false,
        profileCount: 0,
        eventosDb: 0,
        eventosRpc: 0,
        puntosDb: 0,
        puntosRpc: 0,
      };
    }
    if (!officialKey && identityRows?.[0]?.official_player_key) {
      officialKey = String(identityRows[0].official_player_key);
    }
    profileIds = Array.from(
      new Set(
        (identityRows ?? [])
          .map((r) => String(r.linked_jugador_id ?? "").trim())
          .filter(Boolean)
      )
    );
    links = profileIds.map((id) => ({
      riviera_jugador_id: id,
      official_player_key: officialKey,
    }));
  }

  const { data: profiles } = await supabase
    .from("riviera_jugadores")
    .select("id, nombre, organizador_id, estado")
    .in("id", profileIds.length ? profileIds : ["00000000-0000-0000-0000-000000000000"]);

  const activeProfiles = (profiles ?? []).filter((p) => p.estado === "activo");
  const orgSet = new Set(activeProfiles.map((p) => String(p.organizador_id)));
  const multiclub = orgSet.size > 1 || profileIds.length > 1;

  for (const link of links ?? []) {
    if (String(link.official_player_key) !== officialKey) {
      issues.push({
        code: "INCONSISTENT_PROFILE_LINK",
        rivieraId,
        details: {
          jugador_id: link.riviera_jugador_id,
          expected: officialKey,
          actual: link.official_player_key,
        },
      });
    }
  }

  const dbParticipaciones = await fetchDbParticipaciones(supabase, profileIds);
  const dbIds = new Set(dbParticipaciones.map(participacionKey));
  const dbPuntos = sumPuntos(dbParticipaciones);

  const anchorResults = [];
  const allCareerIds = new Set(profileIds);

  for (const profile of activeProfiles) {
    const anchorId = String(profile.id);
    let careerIds;
    try {
      careerIds = await rpcCareerIds(supabase, anchorId);
    } catch (err) {
      issues.push({ code: "CAREER_RPC_ERROR", rivieraId, details: { anchorId, error: err.message } });
      continue;
    }
    for (const cid of careerIds) allCareerIds.add(cid);

    for (const cid of careerIds) allCareerIds.add(cid);

    let careerRows;
    try {
      careerRows = await rpcCareerParticipaciones(supabase, anchorId);
    } catch (err) {
      issues.push({ code: "CAREER_LIST_RPC_ERROR", rivieraId, details: { anchorId, error: err.message } });
      continue;
    }

    const careerIdSet = new Set(careerRows.map(participacionKey));
    const byIdsRows = await rpcParticipacionesForIds(supabase, careerIds);
    const byIdsSet = byIdsRows
      ? new Set(byIdsRows.map(participacionKey))
      : null;

    anchorResults.push({
      anchorId,
      orgId: String(profile.organizador_id),
      nombre: profile.nombre,
      careerIds,
      careerIdSet,
      careerCount: careerRows.length,
      careerPuntos: sumPuntos(careerRows),
      byIdsSet,
      byIdsCount: byIdsRows?.length ?? null,
    });

    if (byIdsSet && !setsEqual(careerIdSet, byIdsSet)) {
      issues.push({
        code: "CAREER_VS_BY_IDS_MISMATCH",
        rivieraId,
        details: { anchorId, career: careerIdSet.size, byIds: byIdsSet.size },
      });
    }
  }

  const expandedDbParts =
    allCareerIds.size > 0
      ? await fetchDbParticipaciones(supabase, Array.from(allCareerIds))
      : dbParticipaciones;
  const globalDbIds = new Set(expandedDbParts.map(participacionKey));
  const globalDbPuntos = sumPuntos(expandedDbParts);

  for (const anchorResult of anchorResults) {
    for (const part of expandedDbParts) {
      if (!anchorResult.careerIds.includes(part.jugador_id)) {
        issues.push({
          code: "PARTICIPACION_OUTSIDE_CAREER_RPC",
          rivieraId,
          details: {
            participacion_id: part.id,
            jugador_id: part.jugador_id,
            anchorId: anchorResult.anchorId,
          },
        });
      }
    }

    if (!setsEqual(anchorResult.careerIdSet, globalDbIds) && globalDbIds.size > 0) {
      issues.push({
        code: "EVENTOS_DB_VS_RPC",
        rivieraId,
        details: {
          anchorId: anchorResult.anchorId,
          eventos_db: globalDbIds.size,
          eventos_rpc: anchorResult.careerCount,
        },
      });
    }

    if (anchorResult.careerPuntos !== globalDbPuntos && globalDbPuntos > 0) {
      issues.push({
        code: "PUNTOS_DB_VS_RPC",
        rivieraId,
        details: {
          anchorId: anchorResult.anchorId,
          puntos_db: globalDbPuntos,
          puntos_rpc: anchorResult.careerPuntos,
        },
      });
    }
  }

  if (anchorResults.length > 1) {
    const ref = anchorResults[0].careerIdSet;
    for (let i = 1; i < anchorResults.length; i++) {
      if (!setsEqual(ref, anchorResults[i].careerIdSet)) {
        issues.push({
          code: "HISTORIAL_CAMBIA_POR_ANCLA",
          rivieraId,
          details: {
            anchor_a: anchorResults[0].anchorId,
            anchor_b: anchorResults[i].anchorId,
            eventos_a: ref.size,
            eventos_b: anchorResults[i].careerIdSet.size,
          },
        });
      }
    }

    const refPts = anchorResults[0].careerPuntos;
    for (let i = 1; i < anchorResults.length; i++) {
      if (refPts !== anchorResults[i].careerPuntos) {
        issues.push({
          code: "PUNTOS_CAMBIAN_POR_ANCLA",
          rivieraId,
          details: {
            anchor_a: anchorResults[0].anchorId,
            anchor_b: anchorResults[i].anchorId,
            puntos_a: refPts,
            puntos_b: anchorResults[i].careerPuntos,
          },
        });
      }
    }
  }

  const hpProfile = activeProfiles.find((p) => orgIds.hackpadel === String(p.organizador_id));
  const roProfile = activeProfiles.find((p) => orgIds.riviera === String(p.organizador_id));
  if (hpProfile && roProfile && anchorResults.length >= 2) {
    const hpResult = anchorResults.find((r) => r.anchorId === String(hpProfile.id));
    const roResult = anchorResults.find((r) => r.anchorId === String(roProfile.id));
    if (hpResult && roResult && !setsEqual(hpResult.careerIdSet, roResult.careerIdSet)) {
      issues.push({
        code: "HACKPADEL_VS_RIVIERA_HISTORIAL_DISTINTO",
        rivieraId,
        details: {
          hackpadel_eventos: hpResult.careerCount,
          riviera_eventos: roResult.careerCount,
        },
      });
    }
  }

  const maxRpc = Math.max(0, ...anchorResults.map((r) => r.careerCount));

  return {
    rivieraId,
    nombre: activeProfiles[0]?.nombre ?? null,
    issues,
    multiclub,
    profileCount: activeProfiles.length,
    eventosDb: globalDbIds.size,
    eventosRpc: maxRpc,
    puntosDb: globalDbPuntos,
    puntosRpc: Math.max(0, ...anchorResults.map((r) => r.careerPuntos)),
  };
}

export async function auditOrphanProfiles(supabase) {
  const { data: activePlayers, error } = await supabase
    .from("riviera_jugadores")
    .select("id, nombre, organizador_id")
    .eq("estado", "activo");
  if (error) throw error;

  const orphans = [];
  for (const player of activePlayers ?? []) {
    const id = String(player.id);

    const { data: identityRows } = await supabase.rpc("resolve_public_player_identity", {
      p_jugador_id: id,
    });
    const hasIdentity = (identityRows ?? []).some(
      (r) => String(r.riviera_id ?? "").startsWith("RIV-")
    );
    if (hasIdentity) continue;

    const { data: link } = await supabase
      .from("riviera_official_player_profile_link")
      .select("official_player_key")
      .eq("riviera_jugador_id", id)
      .maybeSingle();
    if (link?.official_player_key) continue;

    const { data: grant } = await supabase
      .from("organizer_player_access")
      .select("jugador_id")
      .eq("local_jugador_id", id)
      .eq("is_active", true)
      .maybeSingle();
    if (grant?.jugador_id) continue;

    const parts = await fetchDbParticipaciones(supabase, [id]);
    const withPoints = parts.filter((p) => p.puntos_obtenidos > 0);
    if (withPoints.length > 0) {
      orphans.push({
        jugador_id: id,
        nombre: player.nombre,
        organizador_id: player.organizador_id,
        participaciones: withPoints.length,
        puntos: sumPuntos(withPoints),
      });
    }
  }
  return orphans;
}
