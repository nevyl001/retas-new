import { computeJornadaPublicStats } from "../../liga/jornadaStats";
import { isEquiposModalidad } from "../../liga/ligaModalidad";
import { latestIsoTimestamp } from "../../matchDate";
import { getLigaById } from "../../../services/ligaService";
import { supabase } from "../../supabaseClient";
import { formatLugarOrdinal } from "../historialDisplay";
import { buildLigaJornadaPartidosDetalleByJugadorId } from "../buildLigaJornadaPartidosDetalle";
import {
  resolveJugadorForEventSync,
  runParallelPlayerParticipacionSync,
  toExcludedJugadorIdSet,
  type PlayerParticipacionSyncResult,
} from "../careerEventPipeline/careerEventPlayerSync";
import type { CareerEventAssertionFailure } from "../careerEventPipeline/types";
import {
  enrichMetadataWithPartidosDetalle,
  summarizePartidosDetalle,
} from "../../shared/buildPartidosDetalle";
import type { JugadorResultado } from "../types";
import {
  type CareerEventSyncOutcome,
  type CareerEventSyncOptions,
  type PlayerAgg,
  hostClubMetadata,
  playerSyncFromPersist,
  registrarPuntosRanking,
  refreshJugadorStatsBatch,
} from "./core";

// ---------------------------------------------------------------------------
// Liga
// ---------------------------------------------------------------------------

export async function syncLigaJornada(
  ligaId: string,
  jornadaNumero: number,
  userId: string,
  options?: CareerEventSyncOptions
): Promise<CareerEventSyncOutcome> {
  try {
    const detalle = await getLigaById(ligaId);
    const jornada = detalle.jornadas.find((j) => j.numero === jornadaNumero);
    if (!jornada) {
      console.error(
        "[riviera-jugadores] syncLigaJornada: jornada no encontrada",
        jornadaNumero
      );
      return { touchedJugadorIds: [] };
    }

    const parejas = jornada.parejas ?? [];
    const partidos = (jornada.partidos ?? []).filter(
      (p) => p.estado === "completed"
    );
    const parejaMap = new Map(parejas.map((p) => [p.id, p]));
    const agg = new Map<string, PlayerAgg>();

    const bumpLigaPlayer = (
      jugadorId: string,
      nombre: string,
      won: boolean,
      drew: boolean,
      sf: number,
      sc: number,
      pts: number,
      parejaCon?: string
    ) => {
      if (!agg.has(jugadorId)) {
        agg.set(jugadorId, {
          wins: 0,
          losses: 0,
          draws: 0,
          setsFavor: 0,
          setsContra: 0,
          puntosObtenidos: 0,
          nombre,
          legacyLigaJugadorId: jugadorId,
        });
      }
      const st = agg.get(jugadorId)!;
      if (drew) st.draws += 1;
      else if (won) st.wins += 1;
      else st.losses += 1;
      st.setsFavor += sf;
      st.setsContra += sc;
      st.puntosObtenidos += pts;
      if (parejaCon) {
        (st as PlayerAgg & { lastPareja?: string }).lastPareja = parejaCon;
      }
    };

    for (const m of partidos) {
      const s1 = Number(m.score_pareja1 ?? 0);
      const s2 = Number(m.score_pareja2 ?? 0);
      const par1 = parejaMap.get(m.pareja1_id);
      const par2 = parejaMap.get(m.pareja2_id);
      if (!par1 || !par2) continue;

      const j1 = par1.jugador1;
      const j2 = par1.jugador2;
      const j3 = par2.jugador1;
      const j4 = par2.jugador2;
      if (!j1 || !j2 || !j3 || !j4) continue;

      const localWins = s1 > s2;
      const visitWins = s2 > s1;
      const draw = s1 === s2;

      const pareja2Label = `${j3.nombre} / ${j4.nombre}`;
      const pareja1Label = `${j1.nombre} / ${j2.nombre}`;

      if (draw) {
        for (const j of [j1, j2]) {
          bumpLigaPlayer(j.id, j.nombre, false, true, s1, s2, s1, pareja2Label);
        }
        for (const j of [j3, j4]) {
          bumpLigaPlayer(j.id, j.nombre, false, true, s2, s1, s2, pareja1Label);
        }
      } else if (localWins) {
        for (const j of [j1, j2]) {
          bumpLigaPlayer(j.id, j.nombre, true, false, s1, s2, s1, pareja2Label);
        }
        for (const j of [j3, j4]) {
          bumpLigaPlayer(j.id, j.nombre, false, false, s2, s1, s2, pareja1Label);
        }
      } else if (visitWins) {
        for (const j of [j1, j2]) {
          bumpLigaPlayer(j.id, j.nombre, false, false, s1, s2, s1, pareja2Label);
        }
        for (const j of [j3, j4]) {
          bumpLigaPlayer(j.id, j.nombre, true, false, s2, s1, s2, pareja1Label);
        }
      }
    }

    const eventoNombre = `Liga ${detalle.nombre} - Jornada ${jornada.numero}`;
    const eventoEn = latestIsoTimestamp(
      jornada.created_at,
      jornada.fecha,
      ...(jornada.partidos ?? []).map((partido) => partido.created_at)
    );
    const jornadaStats = computeJornadaPublicStats(jornada, {
      parejasFijas: isEquiposModalidad(detalle.modalidad),
    });
    const partidosDetalleByJugador =
      buildLigaJornadaPartidosDetalleByJugadorId(jornada);
    const posByJugador = new Map(
      jornadaStats.rankingJugadores.map((j) => [j.jugadorId, j.posicion])
    );
    const totalJugadores = jornadaStats.rankingJugadores.length;

    const ganadorPareja = jornadaStats.ganadorPareja;
    const jornadaWinnerIds = new Set<string>();
    if (ganadorPareja) {
      const gp = parejaMap.get(ganadorPareja.parejaId);
      if (gp?.jugador1_id) jornadaWinnerIds.add(gp.jugador1_id);
      if (gp?.jugador2_id) jornadaWinnerIds.add(gp.jugador2_id);
    }

    const excluded = toExcludedJugadorIdSet(options?.excludeJugadorIds);

    const parallelOutcome = await runParallelPlayerParticipacionSync(
      Array.from(agg.values()).map((st) => ({
        ctx: { nombre: st.nombre, legacyPlayerId: st.legacyLigaJugadorId },
        fn: async (): Promise<PlayerParticipacionSyncResult> => {
          const { jugadorId, failure } = await resolveJugadorForEventSync(
            {
              nombre: st.nombre,
              organizadorId: userId,
              legacyLigaJugadorId: st.legacyLigaJugadorId,
              tipoEvento: "liga",
              eventoId: jornada.id,
            },
            excluded,
            options?.identityCache
          );
          if (failure) {
            return { failure };
          }
          if (!jugadorId) {
            return {};
          }

          const posicion = st.legacyLigaJugadorId
            ? posByJugador.get(st.legacyLigaJugadorId)
            : undefined;

          const ganoJornada =
            !!st.legacyLigaJugadorId &&
            jornadaWinnerIds.has(st.legacyLigaJugadorId);

          const partidosDetalle = st.legacyLigaJugadorId
            ? (partidosDetalleByJugador.get(st.legacyLigaJugadorId) ?? [])
            : [];
          const detSummary = summarizePartidosDetalle(partidosDetalle);
          const partidosJugados =
            detSummary.jugados > 0
              ? detSummary.jugados
              : st.wins + st.losses + st.draws;
          const setsFavorLiga =
            detSummary.jugados > 0 ? detSummary.setsFavor : st.setsFavor;
          const setsContraLiga =
            detSummary.jugados > 0 ? detSummary.setsContra : st.setsContra;

          const metadata = enrichMetadataWithPartidosDetalle(
            {
              subtipo: "liga_jornada",
              ...hostClubMetadata(userId),
              liga_id: ligaId,
              liga_nombre: detalle.nombre,
              jornada_numero: jornada.numero,
              jornada_ganada: ganoJornada,
              ...(partidosDetalle.length === 0
                ? {
                    partidos_ganados: st.wins,
                    partidos_perdidos: st.losses,
                    partidos_jugados: partidosJugados,
                    partidos_empatados: st.draws,
                  }
                : {}),
              modalidad: "liga",
              modalidad_label: "Liga",
              posicion_jornada: posicion,
              total_participantes: totalJugadores,
              lugar:
                ganoJornada
                  ? `Ganador jornada ${jornada.numero}`
                  : posicion != null && posicion > 0
                    ? formatLugarOrdinal(posicion, totalJugadores)
                    : "Participación en jornada",
            },
            partidosDetalle
          );

          const persisted = await registrarPuntosRanking({
            jugadorId,
            tipoEvento: "liga",
            eventoId: jornada.id,
            eventoNombre,
            resultado: "participación",
            formato: "liga",
            calcParams: { jornadas_ganadas: ganoJornada ? 1 : 0 },
            setsFavor: setsFavorLiga,
            setsContra: setsContraLiga,
            parejaCon: (st as PlayerAgg & { lastPareja?: string }).lastPareja,
            upsertSubtipo: "liga_jornada",
            metadata,
            eventoEn,
          });

          return playerSyncFromPersist(persisted);
        },
      }))
    );

    return {
      touchedJugadorIds: parallelOutcome.touchedJugadorIds,
      participacionEventoId: jornada.id,
      syncFailures:
        parallelOutcome.syncFailures.length > 0
          ? parallelOutcome.syncFailures
          : undefined,
    };
  } catch (e) {
    console.error("[riviera-jugadores] syncLigaJornada:", e);
    return { touchedJugadorIds: [] };
  }
}

/** +100 al inscribirse (una vez por temporada de liga). */
export async function syncLigaInscripcionRanking(
  ligaId: string,
  legacyLigaJugadorId: string,
  organizadorId: string,
  options?: CareerEventSyncOptions
): Promise<CareerEventSyncOutcome> {
  const syncFailures: CareerEventAssertionFailure[] = [];
  try {
    const detalle = await getLigaById(ligaId);
    const jugadorLiga = detalle.jugadores.find((j) => j.id === legacyLigaJugadorId);
    const nombre = jugadorLiga?.nombre ?? "Jugador";

    const { jugadorId, failure } = await resolveJugadorForEventSync(
      {
        nombre,
        organizadorId,
        legacyLigaJugadorId,
        tipoEvento: "liga",
        eventoId: ligaId,
      },
      toExcludedJugadorIdSet(options?.excludeJugadorIds),
      options?.identityCache
    );
    if (failure) {
      syncFailures.push(failure);
      return { touchedJugadorIds: [], syncFailures };
    }
    if (!jugadorId) return { touchedJugadorIds: [] };

    const persisted = await registrarPuntosRanking({
      jugadorId,
      tipoEvento: "liga",
      eventoId: ligaId,
      eventoNombre: `Liga ${detalle.nombre} — Inscripción`,
      resultado: "participación",
      formato: "liga",
      calcParams: { esNuevoEnLiga: true },
      metadata: {
        subtipo: "liga_inscripcion",
        ...hostClubMetadata(organizadorId),
        liga_id: ligaId,
        liga_nombre: detalle.nombre,
        modalidad: "liga",
        modalidad_label: "Liga",
        lugar: "Inscripción a la liga",
      },
      skipIfSubtipoExists: "liga_inscripcion",
    });
    if (!persisted) {
      return { touchedJugadorIds: [], participacionEventoId: ligaId };
    }
    return {
      touchedJugadorIds: [persisted.jugadorId],
      participacionEventoId: ligaId,
    };
  } catch (e) {
    console.error("[riviera-jugadores] syncLigaInscripcionRanking:", e);
    return { touchedJugadorIds: [] };
  }
}

/** Podio final al cerrar la liga (+500 / +250 / +100). */
export async function syncLigaFinalPodio(
  ligaId: string,
  organizadorId: string,
  options?: CareerEventSyncOptions
): Promise<CareerEventSyncOutcome> {
  const excluded = toExcludedJugadorIdSet(options?.excludeJugadorIds);
  try {
    const detalle = await getLigaById(ligaId);
    const ranking = [...detalle.inscripciones].sort(
      (a, b) => b.puntos - a.puntos
    );

    const podioEntries = ranking.slice(0, 3).map((ins, index) => ({
      ins,
      posicion: index + 1,
      nombre: ins.jugador?.nombre ?? "Jugador",
    }));

    const parallelOutcome = await runParallelPlayerParticipacionSync(
      podioEntries.map(({ ins, posicion, nombre }) => ({
        ctx: { nombre, legacyPlayerId: ins.jugador_id },
        fn: async (): Promise<PlayerParticipacionSyncResult> => {
          const { jugadorId, failure } = await resolveJugadorForEventSync(
            {
              nombre,
              organizadorId,
              legacyLigaJugadorId: ins.jugador_id,
              tipoEvento: "liga",
              eventoId: ligaId,
            },
            excluded,
            options?.identityCache
          );
          if (failure) {
            return { failure };
          }
          if (!jugadorId) {
            return {};
          }

          const resultado: JugadorResultado =
            posicion === 1 ? "victoria" : posicion === 2 ? "derrota" : "empate";

          const persisted = await registrarPuntosRanking({
            jugadorId,
            tipoEvento: "liga",
            eventoId: ligaId,
            eventoNombre: `Liga ${detalle.nombre} — Podio final`,
            resultado,
            formato: "liga",
            calcParams: { posicion_final: posicion },
            metadata: {
              subtipo: "liga_podio_final",
              ...hostClubMetadata(organizadorId),
              liga_id: ligaId,
              liga_nombre: detalle.nombre,
              posicion_final: posicion,
              modalidad: "liga",
              modalidad_label: "Liga",
              lugar: formatLugarOrdinal(posicion, ranking.length),
            },
          });

          return playerSyncFromPersist(persisted);
        },
      }))
    );

    return {
      touchedJugadorIds: parallelOutcome.touchedJugadorIds,
      participacionEventoId: ligaId,
      syncFailures:
        parallelOutcome.syncFailures.length > 0
          ? parallelOutcome.syncFailures
          : undefined,
    };
  } catch (e) {
    console.error("[riviera-jugadores] syncLigaFinalPodio:", e);
    return { touchedJugadorIds: [] };
  }
}

// ---------------------------------------------------------------------------
// Americano Dinámico
// ---------------------------------------------------------------------------

/** Re-sincroniza jornadas de liga completadas (metadata de partidos W/L + stats). */
export async function backfillLigaJornadaHistorial(
  organizadorId: string
): Promise<number> {
  let count = 0;
  try {
    const { data: ligas, error } = await supabase
      .from("ligas")
      .select("id")
      .eq("organizador_id", organizadorId);

    if (error || !ligas?.length) return 0;

    for (const liga of ligas) {
      const detalle = await getLigaById(String(liga.id));
      for (const jornada of detalle.jornadas) {
        if (jornada.estado !== "completed") continue;
        const outcome = await syncLigaJornada(
          String(liga.id),
          jornada.numero,
          organizadorId
        );
        await refreshJugadorStatsBatch(outcome.touchedJugadorIds);
        count += 1;
      }
    }
  } catch (e) {
    console.error("[riviera-jugadores] backfillLigaJornadaHistorial:", e);
  }
  return count;
}