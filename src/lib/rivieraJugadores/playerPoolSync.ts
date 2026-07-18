import { waitForSupabaseSession } from "../waitForSupabaseSession";
import { debugLog } from "../debug/debugLog";
import type { Player } from "../db/types";
import { isValidUuid, sanitizeUuid } from "../db/schemaHelpers";
import { supabase } from "../supabaseClient";
import type { LigaJugador } from "../liga/types";
import {
  getRivieraJugadorByLegacyPlayerId,
  linkLegacyLigaJugadorId,
  listRivieraJugadores,
} from "./rivieraJugadoresService";
import type { RivieraJugador } from "./types";
import { normalizePlayerNameKey } from "./playerNameKey";
import {
  isGrantedJugadorRow,
  resolveJugadorIdForOrganizer,
} from "./organizerPlayerAccess";
import {
  LegacyLinkUnverifiableError,
  assertResolvedLocalProfileSafe,
  ensureLocalPlayersLegacyForRivieraJugador,
} from "./localLegacyIdentity";

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

/** Lectura batch pura: mismo shape que fetchPlayerById, sin efectos secundarios. */
async function fetchPlayersByIds(ids: string[]): Promise<Map<string, Player>> {
  const unique = Array.from(
    new Set(ids.map((id) => id.trim()).filter(Boolean))
  );
  const byId = new Map<string, Player>();
  if (!unique.length) return byId;

  const { data, error } = await supabase
    .from("players")
    .select("*")
    .in("id", unique);

  if (error) {
    console.warn("fetchPlayersByIds:", error.message);
    return byId;
  }

  for (const row of (data ?? []) as Player[]) {
    byId.set(row.id, row);
  }
  return byId;
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

/** Sync masivo: no crear/enlazar legacy para cedidos ni filas ya enlazadas. */
function shouldSkipBulkLegacyEnsure(row: RivieraJugador): boolean {
  return isGrantedJugadorRow(row) || Boolean(row.legacy_player_id);
}

/**
 * Pool para Americano / Torneo Express / retas: jugadores enlazados desde el registro.
 * Ensure local fail-closed (sin matching por nombre). Homónimos no se fusionan.
 */
export async function buildLegacyPlayersFromRivieraRegistry(
  organizadorId: string
): Promise<Player[]> {
  const {
    getCachedLegacyPlayersPool,
    setCachedLegacyPlayersPool,
  } = await import("./playersPoolCache");
  const cached = getCachedLegacyPlayersPool(organizadorId);
  if (cached) return cached;

  try {
    await syncLegacyPlayersFromRivieraRegistry(organizadorId);
  } catch (e) {
    console.warn("[riviera-jugadores] buildLegacyPlayers sync:", e);
  }

  const registry = await listRivieraJugadores(organizadorId);

  const linkedIds = registry
    .map((row) => row.legacy_player_id?.trim())
    .filter((id): id is string => Boolean(id));
  const playersById = await fetchPlayersByIds(linkedIds);

  const pending: Array<{ canonical: RivieraJugador; legacy: Player }> = [];
  const seenLegacyIds = new Set<string>();

  for (const row of registry) {
    let canonical = row;
    let legacy: Player | null = null;

    if (canonical.legacy_player_id) {
      legacy = playersById.get(canonical.legacy_player_id) ?? null;
      if (!legacy) {
        // Legacy definido pero no visible: no crear duplicado (fail-closed por fila).
        continue;
      }
      const owner = (legacy as Player & { user_id?: string | null }).user_id;
      if (owner && owner !== organizadorId) continue;
    } else if (isGrantedJugadorRow(row)) {
      continue;
    } else {
      try {
        const ensured = await ensureLocalPlayersLegacyForRivieraJugador(
          organizadorId,
          canonical.id,
          canonical
        );
        legacy = ensured.player;
        canonical = { ...canonical, legacy_player_id: legacy.id };
        playersById.set(legacy.id, legacy);
      } catch (e) {
        console.warn(
          "[riviera-jugadores] buildLegacyPlayers ensure skip:",
          canonical.id,
          e
        );
        continue;
      }
    }

    if (!legacy) continue;
    if (seenLegacyIds.has(legacy.id)) continue;
    seenLegacyIds.add(legacy.id);

    pending.push({ canonical, legacy });
  }

  const out = await Promise.all(
    pending.map(({ canonical, legacy }) =>
      applyRivieraContactToLegacyPlayer(canonical, legacy)
    )
  );

  // Dedupe solo por players.id — nunca por nombre (homónimos).
  const byId = new Map<string, Player>();
  for (const p of out) byId.set(p.id, p);
  const deduped = Array.from(byId.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "es")
  );
  setCachedLegacyPlayersPool(organizadorId, deduped);
  return deduped;
}

/**
 * Crea o reutiliza `players` para el perfil LOCAL del organizador.
 * Fail-closed si legacy no verificable o cross-org. Sin matching por nombre.
 */
export async function ensureLegacyPlayerForRivieraJugador(
  organizadorId: string,
  rj: RivieraJugador
): Promise<Player | null> {
  try {
    const result = await ensureLocalPlayersLegacyForRivieraJugador(
      organizadorId,
      rj.id,
      rj
    );
    return result.player;
  } catch (e) {
    if (e instanceof LegacyLinkUnverifiableError) {
      console.warn(
        "ensureLegacyPlayerForRivieraJugador fail-closed:",
        e.code,
        rj.id
      );
      throw e;
    }
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
    debugLog(
      "[riviera-jugadores] syncLegacyPlayersFromRivieraRegistry skipped: session not ready"
    );
    return;
  }

  const registry = await listRivieraJugadores(organizadorId, {
    skipCareerEnrich: true,
  });
  for (const rj of registry) {
    if (shouldSkipBulkLegacyEnsure(rj)) continue;
    try {
      await ensureLegacyPlayerForRivieraJugador(organizadorId, rj);
    } catch (e) {
      console.warn(
        "[riviera-jugadores] syncLegacyPlayers skip:",
        rj.id,
        e instanceof LegacyLinkUnverifiableError ? e.code : e
      );
    }
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

/**
 * Solo por `legacy_liga_jugador_id` explícito.
 * Prohibido matching por nombre/email (Fase 3).
 */
async function findLigaJugadorForRiviera(
  organizadorId: string,
  rj: RivieraJugador,
  _activePool?: LigaJugador[]
): Promise<LigaJugador | null> {
  const legacyLigaId = sanitizeUuid(rj.legacy_liga_jugador_id);
  if (!legacyLigaId) return null;

  const linked = await fetchLigaJugadorById(legacyLigaId, organizadorId);
  if (linked && linked.estado === "activo") return linked;
  if (rj.legacy_liga_jugador_id?.trim()) {
    throw new LegacyLinkUnverifiableError(
      "No pudimos verificar el vínculo local de liga de este jugador. No se realizó ningún cambio.",
      "RIVIERA_LEGACY_NOT_VERIFIABLE"
    );
  }
  return null;
}

/** Crea o enlaza `liga_jugadores` para el perfil LOCAL. Sin matching por nombre. */
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

    assertResolvedLocalProfileSafe(effectiveRj, effectiveId, organizadorId);

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
            telefono:
              effectiveRj.telefono?.trim() ||
              effectiveRj.whatsapp?.trim() ||
              null,
            ...(isRealEmail(effectiveRj.email)
              ? { email: effectiveRj.email!.trim() }
              : {}),
          })
          .eq("id", existing.id)
          .eq("organizador_id", organizadorId)
          .select()
          .single();
        if (!upErr && synced) return synced as LigaJugador;
      }
      return existing;
    }

    const { data: row, error } = await supabase
      .from("liga_jugadores")
      .insert({
        nombre: effectiveRj.nombre.trim(),
        email: isRealEmail(effectiveRj.email)
          ? effectiveRj.email!.trim()
          : null,
        telefono:
          effectiveRj.telefono?.trim() ||
          effectiveRj.whatsapp?.trim() ||
          null,
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
    if (e instanceof LegacyLinkUnverifiableError) throw e;
    console.warn("ensureLigaJugadorForRivieraJugador:", rj.nombre, e);
    return null;
  }
}

/** No-op: consolidación por nombre de liga_jugadores está prohibida (homónimos = personas distintas). */
export async function consolidateDuplicateLigaJugadores(
  _organizadorId: string
): Promise<void> {
  // Intencionalmente vacío.
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
