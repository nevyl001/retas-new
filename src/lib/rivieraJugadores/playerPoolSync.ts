import { waitForSupabaseSession } from "../waitForSupabaseSession";
import type { Player } from "../db/types";
import { isValidUuid, sanitizeUuid } from "../db/schemaHelpers";
import { insertLegacyPlayer } from "../database";
import { supabase } from "../supabaseClient";
import {
  groupLigaJugadoresByName,
  dedupeLigaJugadoresByName,
} from "../liga/dedupeJugadores";
import type { LigaJugador } from "../liga/types";
import {
  getRivieraJugadorByLegacyPlayerId,
  linkLegacyLigaJugadorId,
  linkLegacyPlayerId,
  listRivieraJugadores,
} from "./rivieraJugadoresService";
import type { RivieraJugador } from "./types";
import { normalizePlayerNameKey } from "./playerNameKey";
import { resolveJugadorIdForOrganizer } from "./organizerPlayerAccess";

const SYNC_TTL_MS = 45_000;
const lastLegacySyncAt: Record<string, number> = {};
const lastLigaSyncAt: Record<string, number> = {};

function normalizeName(n: string): string {
  return normalizePlayerNameKey(n);
}

function isRealEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  return !email.trim().toLowerCase().endsWith("@padel.local");
}

async function fetchPlayerById(id: string): Promise<Player | null> {
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as Player;
}

function pickBestLegacyMatch(
  candidates: Player[],
  organizadorId: string,
  rj: RivieraJugador
): Player | null {
  if (!candidates.length) return null;

  const nameKey = normalizeName(rj.nombre);
  let pool = candidates.filter((p) => normalizeName(p.name) === nameKey);
  if (!pool.length) return null;

  if (isRealEmail(rj.email)) {
    const emailKey = rj.email!.trim().toLowerCase();
    const byEmail = pool.filter(
      (p) => p.email?.trim().toLowerCase() === emailKey
    );
    if (byEmail.length) pool = byEmail;
  }

  const scored = pool.map((p) => {
    const row = p as Player & { user_id?: string | null };
    let score = 0;
    if (rj.legacy_player_id && p.id === rj.legacy_player_id) score += 100;
    if (row.user_id === organizadorId) score += 50;
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.p ?? null;
}

function legacyMatchesRivieraName(legacy: Player, rj: RivieraJugador): boolean {
  return normalizeName(legacy.name) === normalizeName(rj.nombre);
}

async function searchLegacyPlayersForOrganizer(
  nombre: string,
  organizadorId: string
): Promise<Player[]> {
  const trimmed = nombre.trim();
  if (!trimmed) return [];

  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("user_id", organizadorId)
    .ilike("name", trimmed);

  if (error) {
    console.warn("searchLegacyPlayersForOrganizer:", error);
    return [];
  }

  const key = normalizeName(trimmed);
  return ((data ?? []) as Player[]).filter(
    (p) => normalizeName(p.name) === key
  );
}

async function findLegacyPlayerForRiviera(
  organizadorId: string,
  rj: RivieraJugador
): Promise<Player | null> {
  if (rj.legacy_player_id) {
    const linked = await fetchPlayerById(rj.legacy_player_id);
    if (linked) {
      const row = linked as Player & { user_id?: string | null };
      if (!row.user_id || row.user_id === organizadorId) {
        return linked;
      }
    }
  }

  const orgScoped = await searchLegacyPlayersForOrganizer(
    rj.nombre,
    organizadorId
  );
  const orgMatch = pickBestLegacyMatch(orgScoped, organizadorId, rj);
  if (orgMatch && legacyMatchesRivieraName(orgMatch, rj)) {
    return orgMatch;
  }

  return null;
}

type LegacyPlayerContact = Player & {
  email_verified?: boolean | null;
  notif_opt_in_email?: boolean | null;
};

/** Datos de contacto del registro Riviera sobre la fila legacy (para torneos/retas). */
export function mergeRivieraContactIntoLegacyPlayer(
  rj: RivieraJugador,
  legacy: Player
): LegacyPlayerContact {
  const legacyRow = legacy as LegacyPlayerContact;
  const rivieraEmail = isRealEmail(rj.email) ? rj.email!.trim() : null;
  const legacyRealEmail = isRealEmail(legacy.email)
    ? legacy.email.trim()
    : null;
  const email = rivieraEmail ?? legacyRealEmail ?? legacy.email;
  const email_verified = rivieraEmail
    ? true
    : legacyRow.email_verified;

  return {
    ...legacy,
    name: rj.nombre.trim() || legacy.name,
    email,
    email_verified,
  };
}

/** Persiste email del registro Riviera en `players` si la fila legacy aún no está lista. */
async function applyRivieraContactToLegacyPlayer(
  rj: RivieraJugador,
  legacy: Player
): Promise<LegacyPlayerContact> {
  const merged = mergeRivieraContactIntoLegacyPlayer(rj, legacy);
  if (!isRealEmail(rj.email)) return merged;

  const legacyRow = legacy as LegacyPlayerContact;
  const targetEmail = rj.email!.trim().toLowerCase();
  const currentEmail = legacy.email?.trim().toLowerCase() ?? "";
  const needsDbSync =
    !isRealEmail(legacy.email) ||
    currentEmail !== targetEmail ||
    legacyRow.email_verified === false;

  if (!needsDbSync) return merged;

  try {
    const { updatePlayerNotificationContact } = await import(
      "../../services/torneoExpressNotificacionesService"
    );
    const updated = await updatePlayerNotificationContact(
      legacy.id,
      {
        email: rj.email!.trim(),
        notif_opt_in_email: legacyRow.notif_opt_in_email !== false,
      },
      { autoNotifyEnrollment: false }
    );
    return {
      ...merged,
      email: updated.email ?? merged.email,
      email_verified: updated.email_verified ?? true,
      notif_opt_in_email: updated.notif_opt_in_email,
    };
  } catch (e) {
    console.warn("applyRivieraContactToLegacyPlayer:", rj.nombre, e);
    return merged;
  }
}

/**
 * Pool para retas/torneos: solo jugadores ya enlazados desde el registro
 * (`legacy_player_id`). No inserta filas en `players` — eso ocurre en
 * JugadoresLista al crear un jugador nuevo.
 *
 * Cedidos con clon local: `ensure_granted_player_local` no copia legacy_player_id;
 * aquí se enlaza antes de armar el pool para round robin / retas por equipos.
 */
export async function buildLegacyPlayersFromRivieraRegistry(
  organizadorId: string
): Promise<Player[]> {
  try {
    await syncLegacyPlayersFromRivieraRegistry(organizadorId);
  } catch (e) {
    console.warn("[riviera-jugadores] buildLegacyPlayers sync:", e);
  }

  const registry = await listRivieraJugadores(organizadorId);
  const out: Player[] = [];
  const seenLegacyIds = new Set<string>();

  for (const row of registry) {
    let canonical = row;
    let legacy: Player | null = null;

    if (canonical.legacy_player_id) {
      legacy = await fetchPlayerById(canonical.legacy_player_id);
    } else {
      legacy = await ensureLegacyPlayerForRivieraJugador(organizadorId, canonical);
      if (legacy) {
        canonical = { ...canonical, legacy_player_id: legacy.id };
      }
    }

    if (!legacy || !legacyMatchesRivieraName(legacy, canonical)) continue;
    if (seenLegacyIds.has(legacy.id)) continue;
    seenLegacyIds.add(legacy.id);

    out.push(await applyRivieraContactToLegacyPlayer(canonical, legacy));
  }

  const { dedupeLegacyPlayersByName } = await import("../database");
  return dedupeLegacyPlayersByName(out);
}

/** Crea o enlaza un registro en `players` para un jugador del ecosistema Riviera. */
export async function ensureLegacyPlayerForRivieraJugador(
  organizadorId: string,
  rj: RivieraJugador
): Promise<Player | null> {
  try {
    const effectiveId = await resolveJugadorIdForOrganizer(
      organizadorId,
      rj.id
    );
    let effectiveRj = rj;
    if (effectiveId !== rj.id) {
      const { data, error: fetchErr } = await supabase
        .from("riviera_jugadores")
        .select("*")
        .eq("id", effectiveId)
        .maybeSingle();
      if (!fetchErr && data) {
        effectiveRj = data as RivieraJugador;
      }
    }

    const existing = await findLegacyPlayerForRiviera(organizadorId, effectiveRj);
    if (existing) {
      if (effectiveRj.legacy_player_id !== existing.id) {
        await linkLegacyPlayerId(effectiveRj.id, existing.id);
      }
      if (!legacyMatchesRivieraName(existing, effectiveRj)) {
        const nombre = effectiveRj.nombre.trim();
        const { error: nameErr } = await supabase
          .from("players")
          .update({ name: nombre })
          .eq("id", existing.id);
        if (nameErr) {
          console.warn("ensureLegacyPlayerForRivieraJugador rename:", nameErr);
        }
        const refreshed = (await fetchPlayerById(existing.id)) ?? {
          ...existing,
          name: nombre,
        };
        return applyRivieraContactToLegacyPlayer(effectiveRj, refreshed);
      }
      return applyRivieraContactToLegacyPlayer(effectiveRj, existing);
    }

    const created = await insertLegacyPlayer(effectiveRj.nombre, organizadorId, {
      email: isRealEmail(effectiveRj.email) ? effectiveRj.email : null,
    });
    await linkLegacyPlayerId(effectiveRj.id, created.id);
    return applyRivieraContactToLegacyPlayer(effectiveRj, created);
  } catch (e) {
    console.warn("ensureLegacyPlayerForRivieraJugador:", rj.nombre, e);
    return null;
  }
}

export async function syncLegacyPlayersFromRivieraRegistry(
  organizadorId: string,
  opts?: { force?: boolean }
): Promise<void> {
  const now = Date.now();
  if (
    !opts?.force &&
    lastLegacySyncAt[organizadorId] &&
    now - lastLegacySyncAt[organizadorId] < SYNC_TTL_MS
  ) {
    return;
  }

  const sessionReady = await waitForSupabaseSession();
  if (!sessionReady) {
    console.debug(
      "[riviera-jugadores] syncLegacyPlayersFromRivieraRegistry skipped: session not ready"
    );
    return;
  }

  const registry = await listRivieraJugadores(organizadorId, {
    skipCareerEnrich: true,
  });
  for (const rj of registry) {
    await ensureLegacyPlayerForRivieraJugador(organizadorId, rj);
  }
  lastLegacySyncAt[organizadorId] = now;
}

async function fetchLigaJugadorById(
  id: string,
  organizadorId: string
): Promise<LigaJugador | null> {
  const jugadorId = sanitizeUuid(id);
  if (!jugadorId || !isValidUuid(organizadorId)) return null;

  const { data, error } = await supabase
    .from("liga_jugadores")
    .select("*")
    .eq("id", jugadorId)
    .eq("organizador_id", organizadorId)
    .maybeSingle();
  if (error || !data) return null;
  return data as LigaJugador;
}

async function loadActiveLigaJugadoresRows(
  organizadorId: string
): Promise<LigaJugador[]> {
  if (!isValidUuid(organizadorId)) return [];

  const { data, error } = await supabase
    .from("liga_jugadores")
    .select("*")
    .eq("organizador_id", organizadorId)
    .eq("estado", "activo")
    .order("nombre");

  if (error) return [];
  return (data ?? []) as LigaJugador[];
}

async function findLigaJugadorForRiviera(
  organizadorId: string,
  rj: RivieraJugador,
  activePool?: LigaJugador[]
): Promise<LigaJugador | null> {
  const legacyLigaId = sanitizeUuid(rj.legacy_liga_jugador_id);
  if (legacyLigaId) {
    const linked = await fetchLigaJugadorById(legacyLigaId, organizadorId);
    if (linked && linked.estado === "activo") return linked;
  }

  const pool = activePool ?? (await loadActiveLigaJugadoresRows(organizadorId));
  const nameKey = normalizeName(rj.nombre);

  if (isRealEmail(rj.email)) {
    const byEmail = pool.find(
      (j) => j.email?.trim().toLowerCase() === rj.email!.trim().toLowerCase()
    );
    if (byEmail) return byEmail;
  }

  return pool.find((j) => normalizeName(j.nombre) === nameKey) ?? null;
}

/** Crea o enlaza un registro en `liga_jugadores` para el mismo perfil Riviera. */
export async function ensureLigaJugadorForRivieraJugador(
  organizadorId: string,
  rj: RivieraJugador,
  activePool?: LigaJugador[]
): Promise<LigaJugador | null> {
  if (!isValidUuid(organizadorId) || !isValidUuid(rj.id)) return null;

  try {
    const effectiveId = await resolveJugadorIdForOrganizer(
      organizadorId,
      rj.id
    );
    let effectiveRj = rj;
    if (effectiveId !== rj.id) {
      const { data, error: fetchErr } = await supabase
        .from("riviera_jugadores")
        .select("*")
        .eq("id", effectiveId)
        .maybeSingle();
      if (!fetchErr && data) {
        effectiveRj = data as RivieraJugador;
      }
    }

    const existing = await findLigaJugadorForRiviera(
      organizadorId,
      effectiveRj,
      activePool
    );
    if (existing) {
      const linkedLegacyId = sanitizeUuid(effectiveRj.legacy_liga_jugador_id);
      if (linkedLegacyId !== existing.id) {
        await linkLegacyLigaJugadorId(effectiveRj.id, existing.id);
      }
      const nombre = effectiveRj.nombre.trim();
      if (nombre && normalizeName(existing.nombre) !== normalizeName(nombre)) {
        const { data: synced, error: upErr } = await supabase
          .from("liga_jugadores")
          .update({
            nombre,
            telefono: effectiveRj.telefono?.trim() || effectiveRj.whatsapp?.trim() || null,
            ...(isRealEmail(effectiveRj.email) ? { email: effectiveRj.email!.trim() } : {}),
          })
          .eq("id", existing.id)
          .eq("organizador_id", organizadorId)
          .select()
          .single();
        if (!upErr && synced) return synced as LigaJugador;
      }
      return existing;
    }

    const nameKey = normalizeName(effectiveRj.nombre);
    if (nameKey) {
      const pool =
        activePool ?? (await loadActiveLigaJugadoresRows(organizadorId));
      const sameName = pool.filter(
        (j) => normalizeName(j.nombre) === nameKey
      );
      if (sameName.length > 0) {
        const canonicalId = await pickCanonicalLigaJugadorId(
          organizadorId,
          sameName
        );
        const linked = sameName.find((j) => j.id === canonicalId) ?? sameName[0]!;
        await linkLegacyLigaJugadorId(effectiveRj.id, linked.id);
        if (activePool && !activePool.some((j) => j.id === linked.id)) {
          activePool.push(linked);
        }
        return linked;
      }
    }

    const { data: row, error } = await supabase
      .from("liga_jugadores")
      .insert({
        nombre: effectiveRj.nombre.trim(),
        email: isRealEmail(effectiveRj.email) ? effectiveRj.email!.trim() : null,
        telefono: effectiveRj.telefono?.trim() || effectiveRj.whatsapp?.trim() || null,
        genero: effectiveRj.genero ?? null,
        nivel: null,
        organizador_id: organizadorId,
        estado: "activo",
      })
      .select()
      .single();

    if (error) throw error;
    const created = row as LigaJugador;
    await linkLegacyLigaJugadorId(effectiveRj.id, created.id);
    if (activePool) activePool.push(created);
    return created;
  } catch (e) {
    console.warn("ensureLigaJugadorForRivieraJugador:", rj.nombre, e);
    return null;
  }
}

async function pickCanonicalLigaJugadorId(
  organizadorId: string,
  group: LigaJugador[]
): Promise<string> {
  const ids = group
    .map((g) => sanitizeUuid(g.id))
    .filter((id): id is string => !!id);
  if (!ids.length) return group[0]!.id;

  const { data: rivieraLinks } = await supabase
    .from("riviera_jugadores")
    .select("legacy_liga_jugador_id")
    .eq("organizador_id", organizadorId)
    .in("legacy_liga_jugador_id", ids);

  const linked = new Set(
    (rivieraLinks ?? [])
      .map((r) => r.legacy_liga_jugador_id)
      .filter((id): id is string => typeof id === "string" && !!id)
  );

  const canonical = dedupeLigaJugadoresByName(group, {
    rivieraLinkedIds: Array.from(linked),
  })[0];
  return canonical?.id ?? group[0]!.id;
}

async function migrateLigaInscripciones(
  fromId: string,
  toId: string
): Promise<void> {
  const from = sanitizeUuid(fromId);
  const to = sanitizeUuid(toId);
  if (!from || !to) return;

  const { data: rows, error } = await supabase
    .from("liga_inscripciones")
    .select("id, liga_id, puntos")
    .eq("jugador_id", from);

  if (error) throw error;

  for (const row of rows ?? []) {
    const { data: existing } = await supabase
      .from("liga_inscripciones")
      .select("id, puntos")
      .eq("liga_id", row.liga_id)
      .eq("jugador_id", to)
      .maybeSingle();

    if (existing) {
      const mergedPts = Math.max(
        Number(existing.puntos ?? 0),
        Number(row.puntos ?? 0)
      );
      await supabase
        .from("liga_inscripciones")
        .update({ puntos: mergedPts })
        .eq("id", existing.id);
      await supabase.from("liga_inscripciones").delete().eq("id", row.id);
    } else {
      await supabase
        .from("liga_inscripciones")
        .update({ jugador_id: to })
        .eq("id", row.id);
    }
  }
}

async function migrateLigaJornadaParejas(
  fromId: string,
  toId: string
): Promise<void> {
  const from = sanitizeUuid(fromId);
  const to = sanitizeUuid(toId);
  if (!from || !to) return;

  await supabase
    .from("liga_jornada_parejas")
    .update({ jugador1_id: to })
    .eq("jugador1_id", from);
  await supabase
    .from("liga_jornada_parejas")
    .update({ jugador2_id: to })
    .eq("jugador2_id", from);
}

async function relinkRivieraLegacyLigaId(
  fromId: string,
  toId: string
): Promise<void> {
  const from = sanitizeUuid(fromId);
  const to = sanitizeUuid(toId);
  if (!from || !to) return;

  await supabase
    .from("riviera_jugadores")
    .update({ legacy_liga_jugador_id: to })
    .eq("legacy_liga_jugador_id", from);
}

/** Fusiona filas duplicadas en `liga_jugadores` (mismo nombre, mismo organizador). */
export async function consolidateDuplicateLigaJugadores(
  organizadorId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("liga_jugadores")
    .select("*")
    .eq("organizador_id", organizadorId)
    .eq("estado", "activo")
    .order("nombre");

  if (error || !data?.length) return;

  const pool = data as LigaJugador[];
  const groups = groupLigaJugadoresByName(pool);

  for (const group of Array.from(groups.values())) {
    if (group.length < 2) continue;

    const canonicalId = await pickCanonicalLigaJugadorId(organizadorId, group);
    const dupes = group.filter((j) => j.id !== canonicalId);

    for (const dupe of dupes) {
      try {
        await migrateLigaInscripciones(dupe.id, canonicalId);
        await migrateLigaJornadaParejas(dupe.id, canonicalId);
        await relinkRivieraLegacyLigaId(dupe.id, canonicalId);
        await supabase
          .from("liga_jugadores")
          .update({ estado: "inactivo" })
          .eq("id", dupe.id);
      } catch (e) {
        console.warn(
          "consolidateDuplicateLigaJugadores:",
          dupe.nombre,
          e
        );
      }
    }
  }
}

export async function syncLigaJugadoresFromRivieraRegistry(
  organizadorId: string,
  opts?: { force?: boolean }
): Promise<void> {
  const now = Date.now();
  if (
    !opts?.force &&
    lastLigaSyncAt[organizadorId] &&
    now - lastLigaSyncAt[organizadorId] < SYNC_TTL_MS
  ) {
    return;
  }

  const registry = await listRivieraJugadores(organizadorId);
  const activePool = await loadActiveLigaJugadoresRows(organizadorId);
  for (const rj of registry) {
    await ensureLigaJugadorForRivieraJugador(organizadorId, rj, activePool);
  }
  await consolidateDuplicateLigaJugadores(organizadorId);
  await deactivateOrphanLigaJugadores(organizadorId);
  lastLigaSyncAt[organizadorId] = now;
}

/** Desactiva filas en liga_jugadores que ya no están en el registro Riviera activo. */
async function deactivateOrphanLigaJugadores(
  organizadorId: string
): Promise<void> {
  const registry = await listRivieraJugadores(organizadorId);
  const allowed = new Set(
    registry
      .map((r) => sanitizeUuid(r.legacy_liga_jugador_id))
      .filter((id): id is string => !!id)
  );

  const { data: activeRows, error } = await supabase
    .from("liga_jugadores")
    .select("id")
    .eq("organizador_id", organizadorId)
    .eq("estado", "activo");

  if (error) {
    console.warn("deactivateOrphanLigaJugadores:", error.message);
    return;
  }

  const orphanIds = (activeRows ?? [])
    .map((r) => sanitizeUuid(String(r.id ?? "")))
    .filter((id): id is string => !!id && !allowed.has(id));

  if (!orphanIds.length) return;

  const { error: upErr } = await supabase
    .from("liga_jugadores")
    .update({ estado: "inactivo" })
    .eq("organizador_id", organizadorId)
    .in("id", orphanIds);

  if (upErr) {
    console.warn("deactivateOrphanLigaJugadores update:", upErr.message);
  }
}

/** IDs de liga_jugadores enlazados al registro Riviera activo del organizador. */
export async function getLinkedLigaJugadorIds(
  organizadorId: string
): Promise<string[]> {
  const registry = await listRivieraJugadores(organizadorId);
  return Array.from(
    new Set(
      registry
        .map((r) => sanitizeUuid(r.legacy_liga_jugador_id))
        .filter((id): id is string => !!id)
    )
  );
}

/**
 * Pool autorizado para ligas: solo jugadores activos del organizador
 * enlazados a su registro Riviera (nunca huérfanos ni de otros usuarios).
 */
export async function loadOrganizadorLigaJugadoresPool(
  organizadorId: string,
  opts?: { forceSync?: boolean }
): Promise<LigaJugador[]> {
  try {
    await syncLigaJugadoresFromRivieraRegistry(organizadorId, {
      force: opts?.forceSync ?? false,
    });
  } catch (e) {
    console.warn("loadOrganizadorLigaJugadoresPool sync:", e);
  }

  const linkedIds = (await getLinkedLigaJugadorIds(organizadorId)).filter(
    (id) => isValidUuid(id)
  );
  if (!linkedIds.length) return [];

  const { data, error } = await supabase
    .from("liga_jugadores")
    .select("*")
    .eq("organizador_id", organizadorId)
    .eq("estado", "activo")
    .in("id", linkedIds)
    .order("nombre", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as LigaJugador[];
}

/** Rechaza IDs que no pertenezcan al registro activo del organizador. */
export async function assertLigaJugadoresDelOrganizador(
  organizadorId: string,
  jugadorIds: string[]
): Promise<void> {
  const unique = Array.from(new Set(jugadorIds.map((id) => id.trim()).filter(Boolean)));
  if (!unique.length) {
    throw new Error("Selecciona al menos un jugador.");
  }

  const pool = await loadOrganizadorLigaJugadoresPool(organizadorId, {
    forceSync: true,
  });
  const allowed = new Set(pool.map((j) => j.id));

  for (const id of unique) {
    if (!allowed.has(id)) {
      throw new Error(
        "El jugador seleccionado no pertenece a tu registro activo."
      );
    }
  }
}

/** Propaga nombre y contacto del registro Riviera a `players`, retas, duelos y liga. */
export async function syncRivieraJugadorToLinkedPools(
  organizadorId: string,
  rj: RivieraJugador
): Promise<void> {
  const nombre = rj.nombre.trim();
  if (!nombre) return;

  const { propagatePlayerNameAcrossEvents } = await import("../pairPlayerNames");
  await propagatePlayerNameAcrossEvents({
    nombre,
    legacyPlayerId: rj.legacy_player_id,
    rivieraJugadorId: rj.id,
  });

  if (rj.legacy_player_id) {
    try {
      const legacy = await fetchPlayerById(rj.legacy_player_id);
      if (legacy) {
        await applyRivieraContactToLegacyPlayer(rj, legacy);
      }
    } catch (e) {
      console.warn("syncRivieraJugadorToLinkedPools legacy:", e);
    }
  } else {
    await ensureLegacyPlayerForRivieraJugador(organizadorId, rj);
  }

  const legacyLigaId = sanitizeUuid(rj.legacy_liga_jugador_id);
  if (legacyLigaId) {
    try {
      await supabase
        .from("liga_jugadores")
        .update({
          nombre,
          telefono: rj.telefono?.trim() || rj.whatsapp?.trim() || null,
          ...(isRealEmail(rj.email) ? { email: rj.email!.trim() } : {}),
        })
        .eq("id", legacyLigaId)
        .eq("organizador_id", organizadorId);
    } catch (e) {
      console.warn("syncRivieraJugadorToLinkedPools liga:", e);
    }
  } else {
    await ensureLigaJugadorForRivieraJugador(organizadorId, rj);
  }
}

/** Resuelve jugador Riviera a partir de un player legacy (para ranking). */
export async function resolveRivieraFromLegacyPlayer(
  organizadorId: string,
  player: Player
): Promise<RivieraJugador | null> {
  const linked = await getRivieraJugadorByLegacyPlayerId(player.id);
  if (linked) return linked;
  const { ensureRivieraJugadorForLegacyPlayer } = await import(
    "./rivieraJugadoresService"
  );
  return ensureRivieraJugadorForLegacyPlayer(organizadorId, {
    id: player.id,
    name: player.name,
    email: player.email,
  });
}
