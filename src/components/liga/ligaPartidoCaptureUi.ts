import { formatSetScoresDisplay } from "../../lib/liga/parejasFijasMatchScore";
import { playoffsMatchDisplay, parsePlayoffsSetScoresJson } from "../../lib/liga/parejasFijasPlayoffsMatchScore";
import type { LigaJornada, LigaPartido } from "../../lib/liga/types";

export function parejaShortLabel(
  parejaId: string,
  jornada: LigaJornada | undefined
): string {
  const p = jornada?.parejas?.find((x) => x.id === parejaId);
  if (!p) return "Pareja";
  const n1 = p.jugador1?.nombre?.trim() || "?";
  const n2 = p.jugador2?.nombre?.trim() || "?";
  return `${n1}/${n2}`;
}

export function parejaPlayerNames(
  parejaId: string,
  jornada: LigaJornada | undefined
): { name1: string; name2: string } {
  const p = jornada?.parejas?.find((x) => x.id === parejaId);
  if (!p) return { name1: "Jugador 1", name2: "Jugador 2" };
  return {
    name1: p.jugador1?.nombre?.trim() || "?",
    name2: p.jugador2?.nombre?.trim() || "?",
  };
}

export function partidoListSummary(
  partido: LigaPartido,
  index: number,
  total: number,
  jornada: LigaJornada | undefined
): string {
  const cancha =
    partido.cancha != null ? ` — Cancha ${partido.cancha}` : "";
  const left = parejaShortLabel(partido.pareja1_id, jornada);
  const right = parejaShortLabel(partido.pareja2_id, jornada);
  return `Partido ${index + 1} de ${total}${cancha}: ${left} vs ${right}`;
}

export function partidoCapturedSummary(
  partido: LigaPartido,
  jornada: LigaJornada | undefined,
  esPlayoffs: boolean
): string | null {
  if (partido.estado !== "completed") return null;
  const left = parejaShortLabel(partido.pareja1_id, jornada);
  const right = parejaShortLabel(partido.pareja2_id, jornada);

  if (esPlayoffs && partido.score_pareja1 != null && partido.score_pareja2 != null) {
    const display = playoffsMatchDisplay(
      partido.score_pareja1,
      partido.score_pareja2,
      parsePlayoffsSetScoresJson(partido.set_scores)
    );
    return `${left} ${display} ${right}`;
  }

  const legacyScores =
    partido.set_scores &&
    typeof partido.set_scores === "object" &&
    "sets" in partido.set_scores
      ? (partido.set_scores as import("../../lib/liga/parejasFijasMatchScore").LigaPartidoSetScores)
      : null;

  if (legacyScores?.sets?.length) {
    const setsDisplay = formatSetScoresDisplay(legacyScores.sets);
    if (partido.score_pareja1 != null && partido.score_pareja2 != null) {
      return `${left} ${partido.score_pareja1} - ${partido.score_pareja2} (${setsDisplay}) ${right}`;
    }
    return `${left} ${setsDisplay} ${right}`;
  }

  if (partido.score_pareja1 != null && partido.score_pareja2 != null) {
    return `${left} ${partido.score_pareja1} - ${partido.score_pareja2} ${right}`;
  }

  return `${left} vs ${right}`;
}

export function findNextPendingPartidoId(
  list: LigaPartido[],
  afterId?: string
): string | null {
  if (list.length === 0) return null;
  const startIdx =
    afterId != null ? list.findIndex((p) => p.id === afterId) : -1;
  for (let i = startIdx + 1; i < list.length; i++) {
    if (list[i].estado !== "completed") return list[i].id;
  }
  for (const p of list) {
    if (p.estado !== "completed" && p.id !== afterId) return p.id;
  }
  return null;
}

export function uniqueCanchas(partidos: LigaPartido[]): number[] {
  const set = new Set<number>();
  for (const p of partidos) {
    if (p.cancha != null) set.add(p.cancha);
  }
  return Array.from(set).sort((a, b) => a - b);
}
