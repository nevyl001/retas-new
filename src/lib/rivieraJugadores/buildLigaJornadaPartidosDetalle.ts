import { parsePlayoffsSetScoresJson } from "../liga/parejasFijasPlayoffsMatchScore";
import { partidoMatchWinnerSide } from "../liga/publicDisplay";
import type { LigaJornada, LigaJornadaPareja, LigaPartido } from "../liga/types";
import {
  formatRivalPair,
  resultadoFromScores,
  type PartidoDetalle,
  type PartidoDetalleResultado,
} from "../shared/buildPartidosDetalle";

function parejaLabel(p: LigaJornadaPareja | undefined): string {
  if (!p) return "Rival";
  return formatRivalPair(p.jugador1?.nombre ?? "?", p.jugador2?.nombre ?? "?");
}

function tieneMarcadorPorSets(partido: LigaPartido): boolean {
  const raw = partido.set_scores;
  return Boolean(raw && typeof raw === "object");
}

function marcadorEstructurado(partido: LigaPartido): boolean {
  const raw = partido.set_scores;
  if (!raw || typeof raw !== "object") return false;
  if (parsePlayoffsSetScoresJson(raw)) return true;
  return "sets" in raw && Array.isArray(raw.sets);
}

/**
 * Playoffs y sets oficiales deciden el partido. Si ese marcador existe pero
 * no tiene ganador válido, no se inventa uno sumando juegos.
 */
function resultadoOficialLiga(
  partido: LigaPartido,
  jugadorEnPareja1: boolean,
  favor: number,
  contra: number
): PartidoDetalleResultado | null {
  if (tieneMarcadorPorSets(partido)) {
    const side = partidoMatchWinnerSide(partido, true);
    if (side == null) {
      return marcadorEstructurado(partido)
        ? null
        : resultadoFromScores(favor, contra);
    }
    const gana = jugadorEnPareja1 ? side === 1 : side === 2;
    return gana ? "win" : "loss";
  }
  return resultadoFromScores(favor, contra);
}

function partidosForJugador(
  jugadorId: string,
  partidos: LigaPartido[],
  parejaMap: Map<string, LigaJornadaPareja>,
  jornadaNumero: number
): PartidoDetalle[] {
  const entries: PartidoDetalle[] = [];

  const sorted = [...partidos]
    .filter((m) => m.estado === "completed")
    .sort((a, b) => {
      const ra = a.ronda ?? 0;
      const rb = b.ronda ?? 0;
      if (ra !== rb) return ra - rb;
      return (a.created_at ?? "").localeCompare(b.created_at ?? "");
    });

  for (const m of sorted) {
    const par1 = parejaMap.get(m.pareja1_id);
    const par2 = parejaMap.get(m.pareja2_id);
    if (!par1 || !par2) continue;

    const in1 =
      par1.jugador1_id === jugadorId || par1.jugador2_id === jugadorId;
    const in2 =
      par2.jugador1_id === jugadorId || par2.jugador2_id === jugadorId;
    if (!in1 && !in2) continue;

    const s1 = Number(m.score_pareja1 ?? 0);
    const s2 = Number(m.score_pareja2 ?? 0);
    if (s1 === 0 && s2 === 0) continue;

    const favor = in1 ? s1 : s2;
    const contra = in1 ? s2 : s1;
    const resultado = resultadoOficialLiga(m, in1, favor, contra);
    if (resultado == null) continue;
    const rival = in1 ? parejaLabel(par2) : parejaLabel(par1);

    entries.push({
      id: m.id,
      ronda: m.ronda ?? 1,
      fase: `Jornada ${jornadaNumero}`,
      rival,
      games_favor: favor,
      games_contra: contra,
      resultado,
      fecha: m.created_at ?? "",
    });
  }

  return entries;
}

export function buildLigaJornadaPartidosDetalleByJugadorId(
  jornada: LigaJornada
): Map<string, PartidoDetalle[]> {
  const parejas = jornada.parejas ?? [];
  const partidos = jornada.partidos ?? [];
  const parejaMap = new Map(parejas.map((p) => [p.id, p]));
  const byJugador = new Map<string, PartidoDetalle[]>();

  const jugadorIds = new Set<string>();
  for (const p of parejas) {
    if (p.jugador1_id) jugadorIds.add(p.jugador1_id);
    if (p.jugador2_id) jugadorIds.add(p.jugador2_id);
  }

  for (const jugadorId of Array.from(jugadorIds)) {
    byJugador.set(
      jugadorId,
      partidosForJugador(
        jugadorId,
        partidos,
        parejaMap,
        jornada.numero
      )
    );
  }

  return byJugador;
}
