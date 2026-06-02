/**
 * Determina qué parejas clasificaron a eliminatoria.
 * Orden: partidos eliminatoria → bracket_slots → tabla de grupos (top N por grupo).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLASIFICAN_POR_GRUPO = 2;

interface MatchResult {
  pairAId: string;
  pairBId: string;
  gamesA: number;
  gamesB: number;
  winnerId?: string | null;
}

interface PairStanding {
  pairId: string;
  PG: number;
  diferencia: number;
  seed: number;
}

function resolveMatchWinner(match: MatchResult): string | null {
  if (match.winnerId) return match.winnerId;
  if (match.gamesA > match.gamesB) return match.pairAId;
  if (match.gamesB > match.gamesA) return match.pairBId;
  return null;
}

function getHeadToHead(
  idA: string,
  idB: string,
  matches: MatchResult[],
): number {
  const partido = matches.find(
    (p) =>
      (p.pairAId === idA && p.pairBId === idB) ||
      (p.pairAId === idB && p.pairBId === idA),
  );
  if (!partido) return 0;
  const ganador = resolveMatchWinner(partido);
  if (ganador === idA) return -1;
  if (ganador === idB) return 1;
  return 0;
}

function calculateExpressStandings(
  pairs: Array<{ id: string; seed?: number }>,
  matches: MatchResult[],
): PairStanding[] {
  const stats = new Map<string, PairStanding>();
  pairs.forEach((p, i) => {
    stats.set(p.id, {
      pairId: p.id,
      PG: 0,
      diferencia: 0,
      seed: p.seed ?? i,
    });
  });

  for (const m of matches) {
    const a = stats.get(m.pairAId);
    const b = stats.get(m.pairBId);
    if (!a || !b) continue;
    a.diferencia += m.gamesA - m.gamesB;
    b.diferencia += m.gamesB - m.gamesA;
    const winner = resolveMatchWinner(m);
    if (winner === m.pairAId) a.PG += 1;
    else if (winner === m.pairBId) b.PG += 1;
  }

  const cmp = (x: PairStanding, y: PairStanding) => {
    if (y.PG !== x.PG) return y.PG - x.PG;
    if (y.diferencia !== x.diferencia) return y.diferencia - x.diferencia;
    return getHeadToHead(x.pairId, y.pairId, matches) || x.seed - y.seed;
  };

  return [...stats.values()].sort(cmp);
}

function pairIdsFromBracketSlots(json: unknown): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(json)) return ids;
  for (const item of json) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.type !== "team" || !row.qualifier || typeof row.qualifier !== "object") {
      continue;
    }
    const q = row.qualifier as Record<string, unknown>;
    const pid = String(q.parejaId ?? "").trim();
    if (pid) ids.add(pid);
  }
  return ids;
}

async function pairIdsFromEliminatoriaPartidos(
  supabase: SupabaseClient,
  torneoId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("torneo_express_eliminatoria_partidos")
    .select("pareja_local_id, pareja_visitante_id")
    .eq("torneo_id", torneoId);
  if (error) throw error;

  const ids = new Set<string>();
  for (const row of data ?? []) {
    if (row.pareja_local_id) ids.add(row.pareja_local_id as string);
    if (row.pareja_visitante_id) ids.add(row.pareja_visitante_id as string);
  }
  return ids;
}

async function pairIdsFromGroupStandings(
  supabase: SupabaseClient,
  torneoId: string,
): Promise<Set<string>> {
  const { data: grupos, error: gErr } = await supabase
    .from("torneo_express_grupos")
    .select("id, orden")
    .eq("torneo_id", torneoId)
    .order("orden", { ascending: true });
  if (gErr) throw gErr;
  if (!grupos?.length) return new Set();

  const qualified = new Set<string>();

  for (const grupo of grupos) {
    const grupoId = grupo.id as string;

    const { data: gp, error: gpErr } = await supabase
      .from("torneo_express_grupo_parejas")
      .select("pareja_id")
      .eq("grupo_id", grupoId);
    if (gpErr) throw gpErr;

    const pairIds = (gp ?? []).map((r) => r.pareja_id as string).filter(Boolean);
    if (pairIds.length === 0) continue;

    const { data: partidos, error: pErr } = await supabase
      .from("torneo_express_partidos")
      .select(
        "pareja_local_id, pareja_visitante_id, puntos_local, puntos_visitante, ganador_id, estado",
      )
      .eq("grupo_id", grupoId);
    if (pErr) throw pErr;

    const matches: MatchResult[] = (partidos ?? [])
      .filter((p) => p.estado === "jugado")
      .map((p) => ({
        pairAId: p.pareja_local_id as string,
        pairBId: p.pareja_visitante_id as string,
        gamesA: Number(p.puntos_local) || 0,
        gamesB: Number(p.puntos_visitante) || 0,
        winnerId: p.ganador_id as string | null,
      }));

    const pairInputs = pairIds.map((id, i) => ({ id, seed: i }));
    const tabla = calculateExpressStandings(pairInputs, matches);
    tabla.slice(0, CLASIFICAN_POR_GRUPO).forEach((row) => qualified.add(row.pairId));
  }

  return qualified;
}

/** Parejas que clasificaron (misma lógica que la UI de grupos). */
export async function resolveClasificadosPairIds(
  supabase: SupabaseClient,
  torneoId: string,
): Promise<Set<string>> {
  const fromPartidos = await pairIdsFromEliminatoriaPartidos(supabase, torneoId);
  if (fromPartidos.size > 0) return fromPartidos;

  const { data: torneo, error: tErr } = await supabase
    .from("torneo_express")
    .select("bracket_slots")
    .eq("id", torneoId)
    .maybeSingle();
  if (tErr) throw tErr;

  const fromSlots = pairIdsFromBracketSlots(torneo?.bracket_slots);
  if (fromSlots.size > 0) return fromSlots;

  return pairIdsFromGroupStandings(supabase, torneoId);
}
