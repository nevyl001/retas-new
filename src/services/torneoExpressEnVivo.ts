import { supabasePublicRead } from "../lib/supabaseClient";
import {
  eliminatoriaBracketSize,
  labelRondaEliminatoria,
  totalRondasEliminatoria,
} from "../lib/torneoExpress/bracketRounds";
import type {
  EnVivoPairSide,
  EnVivoPartido,
} from "../lib/torneoExpress/eventoEnVivo";
import { formatTorneoExpressCategoria } from "../lib/torneoExpress/formatCategoria";
import { parseProgramadoEnMs } from "../lib/torneoExpress/partidoEnVivo";
import type {
  TorneoExpress,
  TorneoExpressEvento,
} from "../lib/torneoExpress/types";
import {
  fetchEventoPublicoPorSlug,
  fetchPairRostersByIds,
  formatSupabaseError,
  type PairRoster,
} from "./torneoExpressService";

/**
 * Lectura pública de solo-lectura para la pantalla de canchas de un Evento.
 *
 * - La estructura (categorías, grupos) se pide UNA vez al abrir la pantalla.
 * - Cada refresco solo pide los partidos programados dentro de una ventana
 *   de tiempo alrededor de «ahora» (2 consultas) + nombres de parejas
 *   (cacheados unos minutos).
 */

const WINDOW_BEFORE_MS = 3 * 60 * 60 * 1000;
const WINDOW_AFTER_MS = 36 * 60 * 60 * 1000;
const ROSTER_TTL_MS = 2 * 60 * 1000;
const PLAZA_POR_DEFINIR = "Por definir";

export type EnVivoEstructura = {
  evento: TorneoExpressEvento;
  categoriaByTorneoId: Map<string, TorneoExpress>;
  grupoById: Map<string, { torneoId: string; nombre: string }>;
};

export type EnVivoRosterCache = Map<
  string,
  { roster: PairRoster; fetchedAt: number }
>;

type GrupoPartidoRow = {
  id: string;
  grupo_id: string;
  pareja_local_id: string | null;
  pareja_visitante_id: string | null;
  estado: string | null;
  cancha: string | null;
  programado_en: string | null;
  ronda: number | null;
  orden: number | null;
};

type ElimPartidoRow = {
  id: string;
  torneo_id: string;
  ronda: number;
  orden: number;
  pareja_local_id: string | null;
  pareja_visitante_id: string | null;
  estado: string | null;
  es_bye: boolean | null;
  cancha: string | null;
  programado_en: string | null;
};

export async function fetchEnVivoEstructura(
  slug: string
): Promise<EnVivoEstructura | null> {
  const data = await fetchEventoPublicoPorSlug(slug);
  if (!data) return null;

  const categoriaByTorneoId = new Map<string, TorneoExpress>();
  for (const cat of data.categorias) categoriaByTorneoId.set(cat.id, cat);

  const grupoById = new Map<string, { torneoId: string; nombre: string }>();
  for (const [torneoId, grupos] of Object.entries(data.gruposByTorneoId)) {
    for (const g of grupos) {
      grupoById.set(g.id, { torneoId, nombre: g.nombre });
    }
  }

  return { evento: data.evento, categoriaByTorneoId, grupoById };
}

function categoriaLabel(cat: TorneoExpress | undefined): string {
  if (!cat) return "Categoría";
  return (
    formatTorneoExpressCategoria(cat.categoria) ||
    cat.nombre?.trim() ||
    "Categoría"
  );
}

function pairSide(
  pairId: string | null,
  rosters: Map<string, PairRoster>
): EnVivoPairSide {
  if (!pairId) {
    return {
      pairId: null,
      display: PLAZA_POR_DEFINIR,
      player1Id: null,
      player2Id: null,
      isVirtual: true,
    };
  }
  const roster = rosters.get(pairId);
  if (!roster) {
    return {
      pairId,
      display: PLAZA_POR_DEFINIR,
      player1Id: null,
      player2Id: null,
      isVirtual: true,
    };
  }
  return {
    pairId,
    display: roster.display,
    player1Id: roster.player1Id,
    player2Id: roster.player2Id,
    isVirtual: roster.isVirtual,
  };
}

async function resolveRosters(
  pairIds: string[],
  cache: EnVivoRosterCache,
  nowMs: number
): Promise<Map<string, PairRoster>> {
  const result = new Map<string, PairRoster>();
  const stale: string[] = [];

  for (const id of Array.from(new Set(pairIds))) {
    const hit = cache.get(id);
    if (hit && nowMs - hit.fetchedAt < ROSTER_TTL_MS) {
      result.set(id, hit.roster);
    } else {
      stale.push(id);
    }
  }

  if (stale.length > 0) {
    const fresh = await fetchPairRostersByIds(stale, supabasePublicRead);
    for (const [id, roster] of Array.from(fresh.entries())) {
      cache.set(id, { roster, fetchedAt: nowMs });
      result.set(id, roster);
    }
    // Si una pareja no regresó, conserva el último valor conocido en vez de borrarlo.
    for (const id of stale) {
      if (!result.has(id)) {
        const previous = cache.get(id);
        if (previous) result.set(id, previous.roster);
      }
    }
  }

  return result;
}

export async function fetchEnVivoPartidos(
  estructura: EnVivoEstructura,
  rosterCache: EnVivoRosterCache,
  now: Date = new Date()
): Promise<EnVivoPartido[]> {
  const fromIso = new Date(now.getTime() - WINDOW_BEFORE_MS).toISOString();
  const toIso = new Date(now.getTime() + WINDOW_AFTER_MS).toISOString();

  const grupoIds = Array.from(estructura.grupoById.keys());
  const torneoIds = Array.from(estructura.categoriaByTorneoId.keys());

  const [grupoResult, elimResult] = await Promise.all([
    grupoIds.length > 0
      ? supabasePublicRead
          .from("torneo_express_partidos")
          .select(
            "id, grupo_id, pareja_local_id, pareja_visitante_id, estado, cancha, programado_en, ronda, orden"
          )
          .in("grupo_id", grupoIds)
          .gte("programado_en", fromIso)
          .lte("programado_en", toIso)
      : Promise.resolve({ data: [] as GrupoPartidoRow[], error: null }),
    torneoIds.length > 0
      ? supabasePublicRead
          .from("torneo_express_eliminatoria_partidos")
          .select(
            "id, torneo_id, ronda, orden, pareja_local_id, pareja_visitante_id, estado, es_bye, cancha, programado_en"
          )
          .in("torneo_id", torneoIds)
          .gte("programado_en", fromIso)
          .lte("programado_en", toIso)
      : Promise.resolve({ data: [] as ElimPartidoRow[], error: null }),
  ]);

  if (grupoResult.error) {
    throw new Error(formatSupabaseError(grupoResult.error));
  }
  // La eliminatoria puede no existir todavía en el esquema o no tener cuadro:
  // la pantalla sigue mostrando los partidos de grupos.
  const grupoRows = (grupoResult.data ?? []) as GrupoPartidoRow[];
  const elimRows = (
    elimResult.error ? [] : (elimResult.data ?? [])
  ) as ElimPartidoRow[];

  const pairIds: string[] = [];
  for (const r of grupoRows) {
    if (r.pareja_local_id) pairIds.push(r.pareja_local_id);
    if (r.pareja_visitante_id) pairIds.push(r.pareja_visitante_id);
  }
  for (const r of elimRows) {
    if (r.es_bye) continue;
    if (r.pareja_local_id) pairIds.push(r.pareja_local_id);
    if (r.pareja_visitante_id) pairIds.push(r.pareja_visitante_id);
  }
  const rosters = await resolveRosters(pairIds, rosterCache, now.getTime());

  const partidos: EnVivoPartido[] = [];

  for (const r of grupoRows) {
    const startMs = parseProgramadoEnMs(r.programado_en);
    const grupo = estructura.grupoById.get(r.grupo_id);
    if (startMs == null || !r.programado_en || !grupo) continue;
    const cat = estructura.categoriaByTorneoId.get(grupo.torneoId);
    const etapa = [grupo.nombre?.trim(), r.ronda ? `Ronda ${r.ronda}` : null]
      .filter(Boolean)
      .join(" · ");
    partidos.push({
      id: r.id,
      origen: "grupo",
      torneoId: grupo.torneoId,
      categoria: categoriaLabel(cat),
      etapa: etapa || "Fase de grupos",
      cancha: r.cancha,
      programadoEn: r.programado_en,
      startMs,
      estado: r.estado === "jugado" ? "jugado" : "pendiente",
      local: pairSide(r.pareja_local_id, rosters),
      visitante: pairSide(r.pareja_visitante_id, rosters),
    });
  }

  const elimMetaByTorneo = new Map<
    string,
    { fase: TorneoExpress["fase_eliminacion"]; slots: number; total: number }
  >();

  for (const r of elimRows) {
    if (r.es_bye) continue;
    const startMs = parseProgramadoEnMs(r.programado_en);
    const cat = estructura.categoriaByTorneoId.get(r.torneo_id);
    if (startMs == null || !r.programado_en || !cat) continue;

    let meta = elimMetaByTorneo.get(r.torneo_id);
    if (!meta && cat.fase_eliminacion) {
      const slots = eliminatoriaBracketSize(
        cat.fase_eliminacion,
        cat.bracket_slots
      );
      meta = {
        fase: cat.fase_eliminacion,
        slots,
        total: totalRondasEliminatoria(cat.fase_eliminacion, slots),
      };
      elimMetaByTorneo.set(r.torneo_id, meta);
    }
    const etapa = meta?.fase
      ? labelRondaEliminatoria(meta.fase, r.ronda, meta.total, meta.slots)
      : "Fase final";

    partidos.push({
      id: r.id,
      origen: "eliminatoria",
      torneoId: r.torneo_id,
      categoria: categoriaLabel(cat),
      etapa,
      cancha: r.cancha,
      programadoEn: r.programado_en,
      startMs,
      estado: r.estado === "jugado" ? "jugado" : "pendiente",
      local: pairSide(r.pareja_local_id, rosters),
      visitante: pairSide(r.pareja_visitante_id, rosters),
    });
  }

  return partidos;
}
