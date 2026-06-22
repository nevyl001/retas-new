import type { LigaJornada, LigaJornadaPareja, LigaPartido } from "../liga/types";
import {
  formatRivalPair,
  resultadoFromScores,
  type PartidoDetalle,
} from "../shared/buildPartidosDetalle";

function parejaLabel(p: LigaJornadaPareja | undefined): string {
  if (!p) return "Rival";
  return formatRivalPair(p.jugador1?.nombre ?? "?", p.jugador2?.nombre ?? "?");
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
    const rival = in1 ? parejaLabel(par2) : parejaLabel(par1);

    entries.push({
      id: m.id,
      ronda: m.ronda ?? 1,
      fase: `Jornada ${jornadaNumero}`,
      rival,
      games_favor: favor,
      games_contra: contra,
      resultado: resultadoFromScores(favor, contra),
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
