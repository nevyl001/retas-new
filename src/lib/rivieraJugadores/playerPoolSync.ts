import type { Player } from "../db/types";
import { fetchLegacyPlayersPool, insertLegacyPlayer } from "../database";
import { supabase } from "../supabaseClient";
import type { LigaJugador } from "../liga/types";
import {
  getRivieraJugadorByLegacyPlayerId,
  linkLegacyLigaJugadorId,
  linkLegacyPlayerId,
  listRivieraJugadores,
} from "./rivieraJugadoresService";
import type { RivieraJugador } from "./types";

const SYNC_TTL_MS = 45_000;
const lastLegacySyncAt: Record<string, number> = {};
const lastLigaSyncAt: Record<string, number> = {};

function normalizeName(n: string): string {
  return n.trim().toLowerCase();
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

async function findLegacyPlayerForRiviera(
  organizadorId: string,
  rj: RivieraJugador
): Promise<Player | null> {
  if (rj.legacy_player_id) {
    const linked = await fetchPlayerById(rj.legacy_player_id);
    if (linked) return linked;
  }

  const fromPool = await fetchLegacyPlayersPool(organizadorId);
  const fromPoolMatch = pickBestLegacyMatch(fromPool, organizadorId, rj);
  if (fromPoolMatch) return fromPoolMatch;

  const globalByName = await searchLegacyPlayersByName(rj.nombre);
  const globalMatch = pickBestLegacyMatch(globalByName, organizadorId, rj);
  if (globalMatch) return globalMatch;

  return null;
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
      return existing;
    }

    const created = await insertLegacyPlayer(rj.nombre, organizadorId, {
      email: isRealEmail(rj.email) ? rj.email : null,
    });
    await linkLegacyPlayerId(rj.id, created.id);
    return created;
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
      return existing;
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
  lastLigaSyncAt[organizadorId] = now;
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
