import {
  extractPartidosFromParticipacion,
  isParticipacionAjusteManual,
  participacionCuentaComoDerrota,
  participacionCuentaComoVictoria,
} from "./historialDisplay";
import { filterParticipacionesForOrganizador } from "./participacionesOrganizadorScope";
import type { JugadorParticipacion, JugadorStats } from "./types";

function isLigaInscripcion(row: JugadorParticipacion): boolean {
  const meta = row.metadata ?? {};
  return meta.subtipo === "liga_inscripcion";
}

function eventStreakType(
  row: JugadorParticipacion
): "win" | "loss" | "draw" | "neutral" {
  const m = extractPartidosFromParticipacion(row);
  if (m.ganados > m.perdidos) return "win";
  if (m.perdidos > m.ganados) return "loss";
  if (m.empates > 0 && m.ganados === 0 && m.perdidos === 0) return "draw";
  if (participacionCuentaComoVictoria(row)) return "win";
  if (participacionCuentaComoDerrota(row)) return "loss";
  return "neutral";
}

function formatRacha(type: "win" | "loss" | "draw", count: number): string {
  if (type === "win") {
    return `${count} victoria${count === 1 ? "" : "s"} seguida${count === 1 ? "" : "s"}`;
  }
  if (type === "loss") {
    return `${count} derrota${count === 1 ? "" : "s"} seguida${count === 1 ? "" : "s"}`;
  }
  return `${count} empate${count === 1 ? "" : "s"} seguido${count === 1 ? "" : "s"}`;
}

function computeRachaActual(participaciones: JugadorParticipacion[]): string {
  const sorted = [...participaciones]
    .filter((p) => !isLigaInscripcion(p))
    .sort(
      (a, b) =>
        b.fecha.localeCompare(a.fecha) ||
        b.created_at.localeCompare(a.created_at)
    );

  let streakType: "win" | "loss" | "draw" | null = null;
  let count = 0;

  for (const row of sorted) {
    const type = eventStreakType(row);
    if (type === "neutral") break;
    if (streakType === null) {
      streakType = type;
      count = 1;
    } else if (type === streakType) {
      count += 1;
    } else {
      break;
    }
  }

  if (!streakType || count === 0) return "";
  return formatRacha(streakType, count);
}

/** Recalcula jugador_stats a partir de participaciones scoped al club del jugador. */
export function computeJugadorStatsFromParticipaciones(
  jugadorId: string,
  participaciones: JugadorParticipacion[],
  organizadorId?: string | null
): Omit<JugadorStats, "updated_at"> {
  let victorias = 0;
  let derrotas = 0;
  let empates = 0;
  let totalRetas = 0;
  let totalTorneosExpress = 0;
  let totalLigas = 0;
  let totalAmericanos = 0;
  let setsFavor = 0;
  let setsContra = 0;
  let puntosTotales = 0;

  const org = organizadorId?.trim();
  const scoped =
    org && org.length > 0
      ? filterParticipacionesForOrganizador(participaciones, org)
      : participaciones;

  const visible = scoped.filter((p) => !isParticipacionAjusteManual(p));

  for (const row of scoped) {
    puntosTotales += row.puntos_obtenidos ?? 0;
  }

  for (const row of visible) {
    setsFavor += row.sets_favor ?? 0;
    setsContra += row.sets_contra ?? 0;

    if (row.tipo_evento === "reta" || row.tipo_evento === "duelo_2v2") totalRetas += 1;
    else if (row.tipo_evento === "torneo_express") totalTorneosExpress += 1;
    else if (row.tipo_evento === "liga") totalLigas += 1;
    else if (row.tipo_evento === "americano") totalAmericanos += 1;

    if (isLigaInscripcion(row)) continue;

    const m = extractPartidosFromParticipacion(row);
    victorias += m.ganados;
    derrotas += m.perdidos;
    empates += m.empates;
  }

  const decididos = victorias + derrotas;
  const pctVictorias =
    decididos > 0 ? Math.round((victorias / decididos) * 10000) / 100 : 0;

  const ultima =
    visible.length > 0
      ? [...visible].sort((a, b) => b.fecha.localeCompare(a.fecha))[0].fecha
      : null;

  return {
    jugador_id: jugadorId,
    total_partidos: decididos,
    victorias,
    derrotas,
    empates,
    participaciones_solo: visible.length,
    pct_victorias: pctVictorias,
    total_retas: totalRetas,
    total_torneos_express: totalTorneosExpress,
    total_ligas: totalLigas,
    total_americanos: totalAmericanos,
    sets_favor_total: setsFavor,
    sets_contra_total: setsContra,
    racha_actual: computeRachaActual(visible),
    ultima_actividad: ultima,
    puntos_totales: puntosTotales,
  };
}
