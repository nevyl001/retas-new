import type { AmericanoPlayer, AmericanoRound } from "../../db/types";
import { isValidUuid } from "../../db/schemaHelpers";
import { getTournaments, fetchAmericanoLivePublic, type FetchAmericanoLivePublicResult } from "../../database";
import { rebuildAmericanoFromSnapshot } from "../../americanoSnapshotRoster";
import {
  buildAmericanoPlayerStandingStats,
  getAmericanoRanking,
} from "../../americanoStandings";
import { isAmericanoTournament } from "../../gameModeMapping";
import { loadAmericanoDinamicoSnapshot } from "../../americanoDinamicoStorage";
import { supabase } from "../../supabaseClient";
import { formatLugarOrdinal } from "../historialDisplay";
import { buildAmericanoPartidosDetalleForPlayer } from "../buildAmericanoPartidosDetalle";
import {
  calcularPuntosEventoDesglose,
  type CalcularPuntosEventoParams,
} from "../rivieraRankingPoints";
import { adjustRankingPuntosManual } from "../rivieraJugadoresService";
import {
  resolveJugadorForEventSync,
  runParallelPlayerParticipacionSync,
  toExcludedJugadorIdSet,
  type PlayerParticipacionSyncResult,
} from "../careerEventPipeline/careerEventPlayerSync";
import {
  enrichMetadataWithPartidosDetalle,
  summarizePartidosDetalle,
} from "../../shared/buildPartidosDetalle";
import type { JugadorResultado } from "../types";
import {
  type CareerEventSyncOutcome,
  type CareerEventSyncOptions,
  hostClubMetadata,
  playerSyncFromPersist,
  registrarPuntosRanking,
  rankingMetadata,
  refreshJugadorStatsBatch,
} from "./core";

async function getParticipacionAmericanoCierre(
  jugadorId: string,
  eventoId: string
): Promise<{
  id: string;
  puntos_obtenidos: number | null;
  metadata: Record<string, unknown> | null;
} | null> {
  try {
    const { data, error } = await supabase
      .from("jugador_participaciones")
      .select("id, puntos_obtenidos, metadata")
      .eq("jugador_id", jugadorId)
      .eq("tipo_evento", "americano")
      .eq("evento_id", eventoId)
      .filter("metadata->>subtipo", "eq", "americano_cierre")
      .maybeSingle();
    if (error || !data) return null;
    return data as {
      id: string;
      puntos_obtenidos: number | null;
      metadata: Record<string, unknown> | null;
    };
  } catch {
    return null;
  }
}

export async function syncAmericanoParticipaciones(
  sesionId: string,
  nombre: string,
  jugadores: AmericanoPlayer[],
  rounds: AmericanoRound[],
  userId: string,
  options?: CareerEventSyncOptions
): Promise<CareerEventSyncOutcome> {
  try {
    const statsMap = buildAmericanoPlayerStandingStats(jugadores, rounds);
    const eventoNombre = `Americano Dinámico - ${nombre.trim() || "Sesión"}`;
    const ranked = getAmericanoRanking(jugadores, rounds);
    const fechaFallback = new Date().toISOString();
    const excluded = toExcludedJugadorIdSet(options?.excludeJugadorIds);

    const parallelOutcome = await runParallelPlayerParticipacionSync(
      ranked.map((jugador, index) => {
        const currentPosicion = index + 1;
        const st = statsMap.get(jugador.id);
        return {
          ctx: { nombre: jugador.name, legacyPlayerId: jugador.id },
          fn: async (): Promise<PlayerParticipacionSyncResult> => {
            const { jugadorId, failure } = await resolveJugadorForEventSync(
              {
                nombre: jugador.name,
                organizadorId: userId,
                // DEUDA_FASE_4: sin players.riviera_jugador_id; solo UUID válido
                // cuenta como legacy_player_id. ID no clasificable → fail-closed
                // (resolve sin clave fuerte → null; no cae a nombre).
                legacyPlayerId: isValidUuid(jugador.id) ? jugador.id : undefined,
                tipoEvento: "americano",
                eventoId: sesionId,
              },
              excluded,
              options?.identityCache
            );
            if (failure) {
              return { failure };
            }
            if (!jugadorId) {
              console.warn(
                "[riviera-jugadores] americano sin perfil Riviera:",
                jugador.name
              );
              return {};
            }

            const partidosDetalle = buildAmericanoPartidosDetalleForPlayer(
              jugador.id,
              rounds,
              fechaFallback
            );
            const detSummary = summarizePartidosDetalle(partidosDetalle);

            const podioPos = currentPosicion <= 3 ? currentPosicion : null;
            const calcParams: Omit<CalcularPuntosEventoParams, "formato"> = {
              victorias_americano: st?.pg ?? 0,
              posicion_final: podioPos,
            };
            const { total, desglose } = calcularPuntosEventoDesglose({
              formato: "americano",
              ...calcParams,
            });
            const metadata = enrichMetadataWithPartidosDetalle(
              rankingMetadata(desglose, {
                subtipo: "americano_cierre",
                ...hostClubMetadata(userId),
                partidos:
                  detSummary.jugados > 0
                    ? detSummary.jugados
                    : (st?.pj ?? jugador.stats.gamesPlayed),
                ...(partidosDetalle.length === 0
                  ? {
                      partidos_jugados: st?.pj ?? jugador.stats.gamesPlayed,
                      partidos_ganados: st?.pg ?? 0,
                      partidos_perdidos: st?.pp ?? 0,
                      partidos_empatados: st?.pe ?? 0,
                    }
                  : {}),
                banquillo: jugador.stats.roundsOnBench,
                victorias_ranking: st?.pg ?? 0,
                posicion_final: currentPosicion,
                posicion: currentPosicion,
                total_participantes: ranked.length,
                lugar: formatLugarOrdinal(currentPosicion, ranked.length),
                modalidad: "americano",
                modalidad_label: "Pádel Americano",
                puntos_a_favor: jugador.stats.pointsFor,
                puntos_en_contra: jugador.stats.pointsAgainst,
              }),
              partidosDetalle
            );
            const resultado: JugadorResultado =
              podioPos === 1
                ? "victoria"
                : podioPos === 2
                  ? "derrota"
                  : podioPos === 3
                    ? "empate"
                    : "participación";

            const setsFavor =
              detSummary.jugados > 0 ? detSummary.setsFavor : jugador.stats.pointsFor;
            const setsContra =
              detSummary.jugados > 0
                ? detSummary.setsContra
                : jugador.stats.pointsAgainst;

            const existing = await getParticipacionAmericanoCierre(
              jugadorId,
              sesionId
            );
            if (existing) {
              const aplicados = existing.puntos_obtenidos ?? 0;
              const delta = total - aplicados;
              if (delta !== 0) {
                await adjustRankingPuntosManual(
                  userId,
                  jugadorId,
                  delta,
                  `Corrección ${eventoNombre}`,
                  { bypassPermisoCheck: true }
                );
              }
            }

            const persisted = await registrarPuntosRanking({
              jugadorId,
              tipoEvento: "americano",
              eventoId: sesionId,
              eventoNombre,
              resultado,
              formato: "americano",
              calcParams,
              setsFavor,
              setsContra,
              metadata: metadata as Record<string, unknown>,
              upsertSubtipo: "americano_cierre",
              eventoEn: fechaFallback,
            });

            return playerSyncFromPersist(persisted);
          },
        };
      })
    );

    return {
      touchedJugadorIds: parallelOutcome.touchedJugadorIds,
      participacionEventoId: sesionId,
      syncFailures:
        parallelOutcome.syncFailures.length > 0
          ? parallelOutcome.syncFailures
          : undefined,
    };
  } catch (e) {
    console.error("[riviera-jugadores] syncAmericanoParticipaciones:", e);
    return { touchedJugadorIds: [] };
  }
}

/** Importa puntos e historial de americanos finalizados (local o público en Supabase). */
export async function backfillAmericanoHistorial(
  organizadorId: string
): Promise<number> {
  let count = 0;
  try {
    const tournaments = await getTournaments(organizadorId, {
      includeArchived: true,
    });
    for (const t of tournaments) {
      if (!t.is_finished || !isAmericanoTournament(t)) continue;

      let snap = loadAmericanoDinamicoSnapshot(t.id);
      if (!snap || snap.tournamentPhase !== "finished" || !snap.rounds.length) {
        let remote: FetchAmericanoLivePublicResult | null = null;
        try {
          remote = await fetchAmericanoLivePublic(t.id);
        } catch {
          remote = null;
        }
        if (
          remote?.status === "ok" &&
          remote.snapshot.tournamentPhase === "finished" &&
          remote.snapshot.rounds.length > 0
        ) {
          snap = remote.snapshot;
        }
      }

      if (!snap || snap.tournamentPhase !== "finished" || !snap.rounds.length) {
        continue;
      }

      const rebuilt = rebuildAmericanoFromSnapshot(snap);
      if (!rebuilt) continue;

      const outcome = await syncAmericanoParticipaciones(
        t.id,
        t.name,
        rebuilt.players,
        rebuilt.rounds,
        organizadorId
      );
      await refreshJugadorStatsBatch(outcome.touchedJugadorIds);
      count += 1;
    }
  } catch (e) {
    console.error("[riviera-jugadores] backfillAmericanoHistorial:", e);
  }
  return count;
}