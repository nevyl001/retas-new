import type { Player } from "../db/types";
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

const SYNC_TTL_MS = 45_000;
const lastLegacySyncAt: Record<string, number> = {};
const lastLigaSyncAt: Record<string, number> = {};

function normalizeName(n: string): string {
  return normalizePlayerNameKey(n);
}

function pickCanonicalRivieraRow(rows: RivieraJugador[]): RivieraJugador {
  return [...rows].sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;
    if (a.legacy_player_id) scoreA += 20;
    if (b.legacy_player_id) scoreB += 20;
    if (isRealEmail(a.email)) scoreA += 10;
    if (isRealEmail(b.email)) scoreB += 10;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  })[0];
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

/** Busca en `players` por nombre (incluye filas sin user_id del esquema legacy). */
async function searchLegacyPlayersByName(
  nombre: string
): Promise<Player[]> {
  const trimmed = nombre.trim();
  if (!trimmed) return [];

  const { data, error } = await supabase
    .from("players")
    .select("*")
    .ilike("name", trimmed);

  if (error) {
    console.warn("searchLegacyPlayersByName:", error);
    return [];
  }

  const key = normalizeName(trimmed);
  return ((data ?? []) as Player[]).filter(
    (p) => normalizeName(p.name) === key
  );
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
    if (row.user_id === organizadorId) score += 10;
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.p ?? null;
}

function legacyMatchesRivieraName(legacy: Player, rj: RivieraJugador): boolean {
  return normalizeName(legacy.name) === normalizeName(rj.nombre);
}

async function findLegacyPlayerForRiviera(
  organizadorId: string,
  rj: RivieraJugador
): Promise<Player | null> {
  if (rj.legacy_player_id) {
    const linked = await fetchPlayerById(rj.legacy_player_id);
    if (linked) return linked;
  }

  const globalByName = await searchLegacyPlayersByName(rj.nombre);
  const globalMatch = pickBestLegacyMatch(globalByName, organizadorId, rj);
  if (globalMatch && legacyMatchesRivieraName(globalMatch, rj)) {
    return globalMatch;
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
 */
export async function buildLegacyPlayersFromRivieraRegistry(
  organizadorId: string
): Promise<Player[]> {
  const registry = await listRivieraJugadores(organizadorId);
  const byName = new Map<string, RivieraJugador[]>();

  for (const rj of registry) {
    const nameKey = normalizeName(rj.nombre);
    if (!nameKey) continue;
    const group = byName.get(nameKey) ?? [];
    group.push(rj);
    byName.set(nameKey, group);
  }

  const out: Player[] = [];
  const legacyIdToNameKey = new Map<string, string>();
  const seenLegacyIds = new Set<string>();

  for (const rows of Array.from(byName.values())) {
    const canonical = pickCanonicalRivieraRow(rows);
    if (!canonical.legacy_player_id) continue;

    const legacy = await fetchPlayerById(canonical.legacy_player_id);
    if (!legacy || !legacyMatchesRivieraName(legacy, canonical)) continue;

    const nameKey = normalizeName(canonical.nombre);
    const clashKey = legacyIdToNameKey.get(legacy.id);
    if (clashKey && clashKey !== nameKey) continue;

    legacyIdToNameKey.set(legacy.id, nameKey);
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
    const existing = await findLegacyPlayerForRiviera(organizadorId, rj);
    if (existing) {
      if (rj.legacy_player_id !== existing.id) {
        await linkLegacyPlayerId(rj.id, existing.id);
      }
      if (!legacyMatchesRivieraName(existing, rj)) {
        const nombre = rj.nombre.trim();
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
        return applyRivieraContactToLegacyPlayer(rj, refreshed);
      }
      return applyRivieraContactToLegacyPlayer(rj, existing);
    }

    const created = await insertLegacyPlayer(rj.nombre, organizadorId, {
      email: isRealEmail(rj.email) ? rj.email : null,
    });
    await linkLegacyPlayerId(rj.id, created.id);
    return applyRivieraContactToLegacyPlayer(rj, created);
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

  const registry = await listRivieraJugadores(organizadorId);
  const seenNames = new Set<string>();
  for (const rj of registry) {
    const nameKey = normalizeName(rj.nombre);
    if (!nameKey || seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);
    await ensureLegacyPlayerForRivieraJugador(organizadorId, rj);
  }
  lastLegacySyncAt[organizadorId] = now;
}

async function fetchLigaJugadorById(id: string): Promise<LigaJugador | null> {
  const { data, error } = await supabase
    .from("liga_jugadores")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as LigaJugador;
}

async function findLigaJugadorForRiviera(
  organizadorId: string,
  rj: RivieraJugador
): Promise<LigaJugador | null> {
  if (rj.legacy_liga_jugador_id) {
    const linked = await fetchLigaJugadorById(rj.legacy_liga_jugador_id);
    if (linked && linked.estado === "activo") return linked;
  }

  const { data, error } = await supabase
    .from("liga_jugadores")
    .select("*")
    .eq("organizador_id", organizadorId)
    .eq("estado", "activo")
    .order("nombre");

  if (error) return null;

  const pool = (data ?? []) as LigaJugador[];
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
  rj: RivieraJugador
): Promise<LigaJugador | null> {
  try {
    const existing = await findLigaJugadorForRiviera(organizadorId, rj);
    if (existing) {
      if (rj.legacy_liga_jugador_id !== existing.id) {
        await linkLegacyLigaJugadorId(rj.id, existing.id);
      }
      const nombre = rj.nombre.trim();
      if (nombre && normalizeName(existing.nombre) !== normalizeName(nombre)) {
        const { data: synced, error: upErr } = await supabase
          .from("liga_jugadores")
          .update({
            nombre,
            telefono: rj.telefono?.trim() || rj.whatsapp?.trim() || null,
            ...(isRealEmail(rj.email) ? { email: rj.email!.trim() } : {}),
          })
          .eq("id", existing.id)
          .eq("organizador_id", organizadorId)
          .select()
          .single();
        if (!upErr && synced) return synced as LigaJugador;
      }
      return existing;
    }

    const nameKey = normalizeName(rj.nombre);
    if (nameKey) {
      const { data: sameNameRows } = await supabase
        .from("liga_jugadores")
        .select("*")
        .eq("organizador_id", organizadorId)
        .eq("estado", "activo");
      const sameName = ((sameNameRows ?? []) as LigaJugador[]).filter(
        (j) => normalizeName(j.nombre) === nameKey
      );
      if (sameName.length > 0) {
        const canonicalId = await pickCanonicalLigaJugadorId(
          organizadorId,
          sameName
        );
        const linked = sameName.find((j) => j.id === canonicalId) ?? sameName[0]!;
        await linkLegacyLigaJugadorId(rj.id, linked.id);
        return linked;
      }
    }

    const { data: row, error } = await supabase
      .from("liga_jugadores")
      .insert({
        nombre: rj.nombre.trim(),
        email: isRealEmail(rj.email) ? rj.email!.trim() : null,
        telefono: rj.telefono?.trim() || rj.whatsapp?.trim() || null,
        genero: rj.genero ?? null,
        nivel: null,
        organizador_id: organizadorId,
        estado: "activo",
      })
      .select()
      .single();

    if (error) throw error;
    const created = row as LigaJugador;
    await linkLegacyLigaJugadorId(rj.id, created.id);
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
  const ids = group.map((g) => g.id);
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
  const { data: rows, error } = await supabase
    .from("liga_inscripciones")
    .select("id, liga_id, puntos")
    .eq("jugador_id", fromId);

  if (error) throw error;

  for (const row of rows ?? []) {
    const { data: existing } = await supabase
      .from("liga_inscripciones")
      .select("id, puntos")
      .eq("liga_id", row.liga_id)
      .eq("jugador_id", toId)
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
        .update({ jugador_id: toId })
        .eq("id", row.id);
    }
  }
}

async function migrateLigaJornadaParejas(
  fromId: string,
  toId: string
): Promise<void> {
  await supabase
    .from("liga_jornada_parejas")
    .update({ jugador1_id: toId })
    .eq("jugador1_id", fromId);
  await supabase
    .from("liga_jornada_parejas")
    .update({ jugador2_id: toId })
    .eq("jugador2_id", fromId);
}

async function relinkRivieraLegacyLigaId(
  fromId: string,
  toId: string
): Promise<void> {
  await supabase
    .from("riviera_jugadores")
    .update({ legacy_liga_jugador_id: toId })
    .eq("legacy_liga_jugador_id", fromId);
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
  const seenNames = new Set<string>();
  for (const rj of registry) {
    const nameKey = normalizeName(rj.nombre);
    if (!nameKey || seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);
    await ensureLigaJugadorForRivieraJugador(organizadorId, rj);
  }
  await consolidateDuplicateLigaJugadores(organizadorId);
  lastLigaSyncAt[organizadorId] = now;
}

/** Propaga nombre y contacto del registro Riviera a `players` y `liga_jugadores` enlazados. */
export async function syncRivieraJugadorToLinkedPools(
  organizadorId: string,
  rj: RivieraJugador
): Promise<void> {
  const nombre = rj.nombre.trim();
  if (!nombre) return;

  if (rj.legacy_player_id) {
    try {
      const legacy = await fetchPlayerById(rj.legacy_player_id);
      if (legacy) {
        if (!legacyMatchesRivieraName(legacy, rj)) {
          const { error: nameErr } = await supabase
            .from("players")
            .update({ name: nombre })
            .eq("id", legacy.id);
          if (nameErr) {
            console.warn("syncRivieraJugadorToLinkedPools rename:", nameErr);
          }
        }
        await applyRivieraContactToLegacyPlayer(rj, legacy);
      }
    } catch (e) {
      console.warn("syncRivieraJugadorToLinkedPools legacy:", e);
    }
  } else {
    await ensureLegacyPlayerForRivieraJugador(organizadorId, rj);
  }

  if (rj.legacy_liga_jugador_id) {
    try {
      await supabase
        .from("liga_jugadores")
        .update({
          nombre,
          telefono: rj.telefono?.trim() || rj.whatsapp?.trim() || null,
          ...(isRealEmail(rj.email) ? { email: rj.email!.trim() } : {}),
        })
        .eq("id", rj.legacy_liga_jugador_id)
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
