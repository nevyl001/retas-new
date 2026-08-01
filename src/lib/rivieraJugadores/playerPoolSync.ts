import { waitForSupabaseSession } from "../waitForSupabaseSession";
import { debugLog } from "../debug/debugLog";
import type { Player } from "../db/types";
import { isValidUuid, sanitizeUuid } from "../db/schemaHelpers";
import { supabase } from "../supabaseClient";
import type { LigaJugador } from "../liga/types";
import {
  getRivieraJugadorByLegacyPlayerId,
  getRivieraJugadorPrivateById,
  linkLegacyLigaJugadorId,
  listRivieraJugadoresPrivate,
} from "./rivieraJugadoresService";
import type { RivieraJugador, RivieraJugadorCategoria } from "./types";
import { normalizePlayerNameKey } from "./playerNameKey";
import {
  isGrantedJugadorRow,
  listActiveGrantedAccessForOrganizer,
  resolveJugadorIdForOrganizer,
  type OrganizerPlayerAccessRow,
} from "./organizerPlayerAccess";
import {
  LegacyLinkUnverifiableError,
  assertResolvedLocalProfileSafe,
  ensureLocalPlayersLegacyForRivieraJugador,
} from "./localLegacyIdentity";

const SYNC_TTL_MS = 45_000;
const lastLegacySyncAt: Record<string, number> = {};

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

export type LegacyPlayerContact = Player & {
  email_verified?: boolean | null;
  notif_opt_in_email?: boolean | null;
  /** Solo para presentación (selección de jugadores en Reta) — no altera matching/permisos. */
  categoria?: RivieraJugadorCategoria | null;
  /** Solo presentación en cards del pool — no altera matching/permisos. */
  foto_url?: string | null;
  /** Solo presentación/copia en cards del pool — no altera matching/permisos. */
  riviera_id?: string | null;
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
  const rivieraFoto =
    typeof rj.foto_url === "string" && rj.foto_url.trim()
      ? rj.foto_url.trim()
      : null;
  const rivieraId =
    typeof rj.riviera_id === "string" && rj.riviera_id.trim()
      ? rj.riviera_id.trim()
      : null;

  return {
    ...legacy,
    name: rj.nombre.trim() || legacy.name,
    email,
    email_verified,
    categoria: rj.categoria ?? legacyRow.categoria ?? null,
    foto_url: rivieraFoto ?? legacyRow.foto_url ?? null,
    riviera_id: rivieraId ?? legacyRow.riviera_id ?? null,
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
): Promise<LegacyPlayerContact[]> {
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

  // Solo hace falta id/nombre/categoría/vínculo legacy para armar el pool de
  // selección — se salta la resolución de carrera global multi-club (ya
  // innecesaria aquí: `syncLegacyPlayersFromRivieraRegistry` arriba ya la
  // saltó también, este segundo fetch del registro completo era redundante
  // y el único que pagaba el costo caro).
  const registry = await listRivieraJugadoresPrivate(organizadorId, {
    skipCareerEnrich: true,
  });

  const linkedIds = registry
    .map((row) => row.legacy_player_id?.trim())
    .filter((id): id is string => Boolean(id));
  const playersById = await fetchPlayersByIds(linkedIds);

  const seenLegacyIds = new Set<string>();
  const resolved = await Promise.all(
    registry.map(async (row) => {
      let canonical = row;
      let legacy: Player | null = null;

      if (canonical.legacy_player_id) {
        legacy = playersById.get(canonical.legacy_player_id) ?? null;
        if (!legacy) {
          // Legacy definido pero no visible: no crear duplicado (fail-closed por fila).
          return null;
        }
        const owner = (legacy as Player & { user_id?: string | null }).user_id;
        if (owner && owner !== organizadorId) return null;
      } else if (isGrantedJugadorRow(row)) {
        return null;
      } else {
        try {
          const ensured = await ensureLocalPlayersLegacyForRivieraJugador(
            organizadorId,
            canonical.id,
            canonical
          );
          legacy = ensured.player;
          canonical = { ...canonical, legacy_player_id: legacy.id };
        } catch (e) {
          console.warn(
            "[riviera-jugadores] buildLegacyPlayers ensure skip:",
            canonical.id,
            e
          );
          return null;
        }
      }

      if (!legacy) return null;
      return { canonical, legacy };
    })
  );

  const pending: Array<{ canonical: RivieraJugador; legacy: Player }> = [];
  for (const item of resolved) {
    if (!item) continue;
    if (seenLegacyIds.has(item.legacy.id)) continue;
    seenLegacyIds.add(item.legacy.id);
    pending.push(item);
  }

  const out = await Promise.all(
    pending.map(({ canonical, legacy }) =>
      applyRivieraContactToLegacyPlayer(canonical, legacy)
    )
  );

  // Dedupe solo por players.id — nunca por nombre (homónimos).
  const byId = new Map<string, LegacyPlayerContact>();
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

  const registry = await listRivieraJugadoresPrivate(organizadorId, {
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
      const data = await getRivieraJugadorPrivateById(effectiveId);
      if (data) {
        effectiveRj = data;
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

/**
 * Datos crudos para reconciliar `liga_jugadores` con el registro Riviera:
 * 3 lecturas en paralelo, sin N+1 — reemplazan el antiguo `for..await` por
 * jugador que hacía 2-6 round-trips secuenciales POR JUGADOR del registro.
 */
interface LigaSyncBulkData {
  registry: RivieraJugador[];
  activeLigaJugadores: LigaJugador[];
  grants: OrganizerPlayerAccessRow[];
}

async function fetchLigaSyncBulkData(
  organizadorId: string
): Promise<LigaSyncBulkData> {
  const [registry, activeLigaJugadores, grants] = await Promise.all([
    listRivieraJugadoresPrivate(organizadorId, { skipCareerEnrich: true }),
    loadActiveLigaJugadoresRows(organizadorId),
    listActiveGrantedAccessForOrganizer(organizadorId),
  ]);
  return { registry, activeLigaJugadores, grants };
}

interface LigaSyncPlan {
  /** Pool listo para pintar de inmediato (ya enlazados, sin esperar altas). */
  pool: LigaJugador[];
  toCreate: RivieraJugador[];
  toUpdateContact: Array<{ rj: RivieraJugador; existing: LigaJugador }>;
  toDeactivateIds: string[];
  /** Cedidos cross-club sin clon local todavía — caso raro, requiere RPC. */
  pendingGrantResolution: RivieraJugador[];
  hasWork: boolean;
}

/** Calcula el diff completo en memoria — cero llamadas de red. */
function planLigaSync(bulk: LigaSyncBulkData): LigaSyncPlan {
  const { registry, activeLigaJugadores, grants } = bulk;
  const activeById = new Map(activeLigaJugadores.map((j) => [j.id, j]));
  const grantsPendingLocal = new Set(
    grants.filter((g) => !g.local_jugador_id).map((g) => g.jugador_id)
  );

  const toCreate: RivieraJugador[] = [];
  const toUpdateContact: Array<{ rj: RivieraJugador; existing: LigaJugador }> =
    [];
  const pendingGrantResolution: RivieraJugador[] = [];
  const allowedLegacyIds = new Set<string>();
  const poolById = new Map<string, LigaJugador>();

  for (const rj of registry) {
    const legacyLigaId = sanitizeUuid(rj.legacy_liga_jugador_id);
    if (legacyLigaId) allowedLegacyIds.add(legacyLigaId);

    if (grantsPendingLocal.has(rj.id)) {
      pendingGrantResolution.push(rj);
      continue;
    }

    if (legacyLigaId) {
      const existing = activeById.get(legacyLigaId);
      if (!existing) {
        // Vínculo legacy roto/inactivo: mismo fail-closed que
        // LegacyLinkUnverifiableError en el flujo anterior — se omite esta
        // fila en silencio, no se crea ni se toca nada.
        continue;
      }
      poolById.set(existing.id, existing);
      const nombre = rj.nombre.trim();
      if (nombre && normalizeName(existing.nombre) !== normalizeName(nombre)) {
        toUpdateContact.push({ rj, existing });
      }
    } else {
      toCreate.push(rj);
    }
  }

  const toDeactivateIds = activeLigaJugadores
    .map((j) => j.id)
    .filter((id) => !allowedLegacyIds.has(id));

  const hasWork =
    toCreate.length > 0 ||
    toUpdateContact.length > 0 ||
    toDeactivateIds.length > 0 ||
    pendingGrantResolution.length > 0;

  const pool = Array.from(poolById.values()).sort((a, b) =>
    a.nombre.localeCompare(b.nombre, "es")
  );

  return { pool, toCreate, toUpdateContact, toDeactivateIds, pendingGrantResolution, hasWork };
}

/** Alta en bloque: 1 insert multi-fila + 1 update de vínculo por fila creada (en paralelo). */
async function bulkCreateLigaJugadores(
  organizadorId: string,
  rows: RivieraJugador[]
): Promise<void> {
  if (!rows.length) return;

  const payload = rows.map((rj) => ({
    nombre: rj.nombre.trim(),
    email: isRealEmail(rj.email) ? rj.email!.trim() : null,
    telefono: rj.telefono?.trim() || rj.whatsapp?.trim() || null,
    genero: rj.genero ?? null,
    nivel: null,
    organizador_id: organizadorId,
    estado: "activo",
  }));

  const { data, error } = await supabase
    .from("liga_jugadores")
    .insert(payload)
    .select();

  if (error) {
    console.warn("bulkCreateLigaJugadores:", error.message);
    return;
  }

  // Postgres/PostgREST preservan el orden de entrada en el RETURNING de un
  // INSERT multi-fila: se puede emparejar por índice con `rows`.
  const created = (data ?? []) as LigaJugador[];
  await Promise.all(
    created.map((row, i) => {
      const rj = rows[i];
      if (!rj) return Promise.resolve();
      return linkLegacyLigaJugadorId(rj.id, row.id).catch((e) =>
        console.warn("bulkCreateLigaJugadores link:", rj.id, e)
      );
    })
  );
}

async function applyContactUpdate(
  organizadorId: string,
  rj: RivieraJugador,
  existing: LigaJugador
): Promise<void> {
  const { error } = await supabase
    .from("liga_jugadores")
    .update({
      nombre: rj.nombre.trim(),
      telefono: rj.telefono?.trim() || rj.whatsapp?.trim() || null,
      ...(isRealEmail(rj.email) ? { email: rj.email!.trim() } : {}),
    })
    .eq("id", existing.id)
    .eq("organizador_id", organizadorId);

  if (error) {
    console.warn("applyContactUpdate:", existing.id, error.message);
  }
}

async function deactivateLigaJugadores(
  organizadorId: string,
  ids: string[]
): Promise<void> {
  if (!ids.length) return;

  const { error } = await supabase
    .from("liga_jugadores")
    .update({ estado: "inactivo" })
    .eq("organizador_id", organizadorId)
    .in("id", ids);

  if (error) {
    console.warn("deactivateLigaJugadores:", error.message);
  }
}

/** Aplica el diff y devuelve el pool final recalculado tras los cambios. */
async function applyLigaSyncPlan(
  organizadorId: string,
  plan: LigaSyncPlan
): Promise<LigaJugador[]> {
  const activePool = [...plan.pool];

  await Promise.all([
    bulkCreateLigaJugadores(organizadorId, plan.toCreate),
    Promise.all(
      plan.toUpdateContact.map(({ rj, existing }) =>
        applyContactUpdate(organizadorId, rj, existing)
      )
    ),
    // Caso raro (cedidos cross-club sin clon local): se resuelve con la
    // misma ruta ya validada de siempre, jugador por jugador, pero en
    // paralelo — no bloquea ni afecta al resto del roster.
    Promise.all(
      plan.pendingGrantResolution.map((rj) =>
        ensureLigaJugadorForRivieraJugador(organizadorId, rj, activePool).catch(
          (e) => {
            if (!(e instanceof LegacyLinkUnverifiableError)) {
              console.warn(
                "[riviera-jugadores] syncLigaJugadores (cedido) skip:",
                rj.id,
                e
              );
            }
          }
        )
      )
    ),
    deactivateLigaJugadores(organizadorId, plan.toDeactivateIds),
  ]);

  // Releer el estado final en una sola tanda (3 lecturas en paralelo, sin
  // N+1) para devolver el pool exacto tras aplicar los cambios.
  const refreshed = await fetchLigaSyncBulkData(organizadorId);
  return planLigaSync(refreshed).pool;
}

const inFlightLigaSyncApply: Record<string, Promise<LigaJugador[]> | undefined> =
  {};

/** Comparte una única escritura en curso por organizador (evita duplicarla). */
function runLigaSyncApply(
  organizadorId: string,
  plan: LigaSyncPlan
): Promise<LigaJugador[]> {
  const existing = inFlightLigaSyncApply[organizadorId];
  if (existing) return existing;

  const applied = applyLigaSyncPlan(organizadorId, plan).finally(() => {
    delete inFlightLigaSyncApply[organizadorId];
  });
  inFlightLigaSyncApply[organizadorId] = applied;
  return applied;
}

/**
 * Reconcilia `liga_jugadores` con el registro Riviera activo. Ya no depende
 * de una ventana de tiempo (`SYNC_TTL_MS`): el propio diff en memoria decide
 * si hay algo que sincronizar, así que una liga sin cambios en el registro
 * no dispara ninguna escritura sin importar cuántas veces se recargue.
 */
export async function syncLigaJugadoresFromRivieraRegistry(
  organizadorId: string,
  _opts?: { force?: boolean }
): Promise<void> {
  const bulk = await fetchLigaSyncBulkData(organizadorId);
  const plan = planLigaSync(bulk);
  if (!plan.hasWork) return;
  await runLigaSyncApply(organizadorId, plan);
}

/** IDs de liga_jugadores enlazados al registro Riviera activo del organizador. */
export async function getLinkedLigaJugadorIds(
  organizadorId: string
): Promise<string[]> {
  const registry = await listRivieraJugadoresPrivate(organizadorId, {
    skipCareerEnrich: true,
  });
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
 *
 * Sin `forceSync`, el pool ya calculado (bulk, sin N+1) se devuelve de
 * inmediato y — si hace falta reconciliar algo — la escritura corre en
 * segundo plano sin bloquear el render; `onBackgroundSync` avisa cuando
 * termina para refrescar la UI. Con `forceSync: true` (validación de
 * membresía antes de inscribir/crear pareja) se espera la reconciliación
 * completa antes de responder.
 */
export async function loadOrganizadorLigaJugadoresPool(
  organizadorId: string,
  opts?: {
    forceSync?: boolean;
    onBackgroundSync?: (pool: LigaJugador[]) => void;
  }
): Promise<LigaJugador[]> {
  const bulk = await fetchLigaSyncBulkData(organizadorId);
  const plan = planLigaSync(bulk);

  if (!plan.hasWork) {
    return plan.pool;
  }

  if (opts?.forceSync) {
    return runLigaSyncApply(organizadorId, plan);
  }

  void runLigaSyncApply(organizadorId, plan)
    .then((updatedPool) => opts?.onBackgroundSync?.(updatedPool))
    .catch((e) =>
      console.warn("loadOrganizadorLigaJugadoresPool background sync:", e)
    );

  return plan.pool;
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
      const { error: ligaSyncError } = await supabase
        .from("liga_jugadores")
        .update({
          nombre,
          telefono: rj.telefono?.trim() || rj.whatsapp?.trim() || null,
          ...(isRealEmail(rj.email) ? { email: rj.email!.trim() } : {}),
        })
        .eq("id", legacyLigaId)
        .eq("organizador_id", organizadorId);
      if (ligaSyncError) {
        console.warn("syncRivieraJugadorToLinkedPools liga:", ligaSyncError);
      }
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
