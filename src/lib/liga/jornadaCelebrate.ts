import type { PublicEliminatoriaPodiumStats } from "../torneoExpress/publicEliminatoriaPodiumStats";
import type { ParejaJornadaStat } from "./jornadaStats";
import { formatPartidoCanchaHorarioLabel } from "./programacion";
import { formatPartidoPublicScore, partidoMatchWinnerSide } from "./publicDisplay";
import type { LigaJornada, LigaPartido } from "./types";

export function findPartidoGanadoPareja(
  parejaId: string,
  jornada: LigaJornada | undefined
): LigaPartido | null {
  for (const partido of jornada?.partidos ?? []) {
    if (partido.estado !== "completed") continue;
    const winner = partidoMatchWinnerSide(partido, true);
    if (winner === 1 && partido.pareja1_id === parejaId) return partido;
    if (winner === 2 && partido.pareja2_id === parejaId) return partido;
  }
  return null;
}

export function buildVictoriaRankLabel(
  partido: LigaPartido | null,
  fechaJornada: string | null | undefined
): string | undefined {
  if (!partido) return undefined;
  const cancha = formatPartidoCanchaHorarioLabel(
    partido.cancha,
    partido.hora_inicio,
    fechaJornada
  );
  const score = formatPartidoPublicScore(partido, true);
  if (cancha && score) return `${cancha} · ${score}`;
  return score ?? cancha ?? undefined;
}

export function statsParejaJornadaVictoria(
  parejaId: string,
  jornada: LigaJornada | undefined,
  row: ParejaJornadaStat
): PublicEliminatoriaPodiumStats {
  let juegosFavor = 0;
  let juegosContra = 0;

  for (const partido of jornada?.partidos ?? []) {
    if (partido.estado !== "completed") continue;
    const isP1 = partido.pareja1_id === parejaId;
    const isP2 = partido.pareja2_id === parejaId;
    if (!isP1 && !isP2) continue;

    juegosFavor += isP1
      ? Number(partido.score_pareja1 ?? 0)
      : Number(partido.score_pareja2 ?? 0);
    juegosContra += isP1
      ? Number(partido.score_pareja2 ?? 0)
      : Number(partido.score_pareja1 ?? 0);
  }

  const partidos = row.victorias + row.derrotas + row.empates;

  return {
    victorias: row.victorias,
    derrotas: row.derrotas,
    partidos,
    juegosFavor,
    juegosContra,
    dif: juegosFavor - juegosContra,
  };
}
