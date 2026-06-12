import { resolveMatchWinner, type MatchResult } from "../../utils/standings";
import { computeStandingDif } from "../../utils/standingsDisplay";
import type {
  TorneoExpressBundle,
  TorneoExpressEliminatoriaPartido,
  TorneoExpressPartido,
} from "./types";

export interface PublicEliminatoriaPodiumStats {
  partidos: number;
  victorias: number;
  derrotas: number;
  juegosFavor: number;
  juegosContra: number;
  dif: number;
}

function grupoPartidoToMatch(partido: TorneoExpressPartido): MatchResult {
  return {
    pairAId: partido.pareja_local_id,
    pairBId: partido.pareja_visitante_id,
    gamesA: partido.puntos_local ?? 0,
    gamesB: partido.puntos_visitante ?? 0,
    winnerId: partido.ganador_id,
  };
}

function eliminatoriaPartidoToMatch(
  partido: TorneoExpressEliminatoriaPartido
): MatchResult | null {
  if (partido.estado !== "jugado" || partido.es_bye) return null;
  if (!partido.pareja_local_id || !partido.pareja_visitante_id) return null;
  return {
    pairAId: partido.pareja_local_id,
    pairBId: partido.pareja_visitante_id,
    gamesA: partido.puntos_local ?? 0,
    gamesB: partido.puntos_visitante ?? 0,
    winnerId: partido.ganador_id,
  };
}

export function buildPublicPodiumStatsForPair(
  bundle: TorneoExpressBundle,
  parejaId: string | null | undefined
): PublicEliminatoriaPodiumStats | null {
  if (!parejaId) return null;

  const matches: MatchResult[] = [];

  for (const grupo of bundle.grupos) {
    for (const partido of bundle.partidosPorGrupo[grupo.id] ?? []) {
      if (partido.estado !== "jugado") continue;
      if (
        partido.pareja_local_id !== parejaId &&
        partido.pareja_visitante_id !== parejaId
      ) {
        continue;
      }
      matches.push(grupoPartidoToMatch(partido));
    }
  }

  for (const partido of bundle.eliminatoriaPartidos) {
    const match = eliminatoriaPartidoToMatch(partido);
    if (!match) continue;
    if (match.pairAId !== parejaId && match.pairBId !== parejaId) continue;
    matches.push(match);
  }

  if (matches.length === 0) return null;

  let partidos = 0;
  let victorias = 0;
  let derrotas = 0;
  let juegosFavor = 0;
  let juegosContra = 0;

  for (const match of matches) {
    const isLocal = match.pairAId === parejaId;
    const isVisit = match.pairBId === parejaId;
    if (!isLocal && !isVisit) continue;

    partidos += 1;
    juegosFavor += isLocal ? match.gamesA : match.gamesB;
    juegosContra += isLocal ? match.gamesB : match.gamesA;

    const winner = resolveMatchWinner(match);
    if (winner === parejaId) victorias += 1;
    else if (winner) derrotas += 1;
  }

  if (partidos === 0) return null;

  return {
    partidos,
    victorias,
    derrotas,
    juegosFavor,
    juegosContra,
    dif: computeStandingDif(juegosFavor, juegosContra),
  };
}

export function formatPublicPodiumDif(dif: number): string {
  if (dif > 0) return `+${dif}`;
  return String(dif);
}
