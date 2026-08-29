import { latestIsoTimestamp } from "../../matchDate";
import { getOrganizerDisplayNameSync } from "../../organizer/organizerDisplayName";
import { supabase } from "../../supabaseClient";
import type { Duelo2v2 } from "../../duelo2v2/types";
import { buildDuelo2vs2PartidosDetalle } from "../buildDuelo2vs2PartidosDetalle";
import {
  resolveJugadorForEventSync,
  runParallelPlayerParticipacionSync,
  toExcludedJugadorIdSet,
  type PlayerParticipacionSyncResult,
} from "../careerEventPipeline/careerEventPlayerSync";
import type { CloseIdentityCache } from "../careerEventPipeline/closeIdentityCache";
import {
  enrichMetadataWithPartidosDetalle,
  summarizePartidosDetalle,
} from "../../shared/buildPartidosDetalle";
import type { JugadorResultado } from "../types";
import {
  aplicarRatingDuelo2v2,
  resolveDuelo2v2RatingPlayerIds,
} from "../aplicarRatingPartido";
import {
  type CareerEventSyncOutcome,
  playerSyncFromPersist,
  registrarPuntosRanking,
  refreshJugadorStatsBatch,
} from "./core";

// ---------------------------------------------------------------------------
// Duelo 2 vs 2
// ---------------------------------------------------------------------------

export async function syncDuelo2v2Participaciones(params: {
  organizadorId: string;
  duelo: Duelo2v2;
  excludeJugadorIds?: string[];
  identityCache?: CloseIdentityCache;
}): Promise<CareerEventSyncOutcome> {
  const { organizadorId, duelo } = params;
  if (duelo.estado !== "finalizado" || !duelo.ganador) {
    return { touchedJugadorIds: [] };
  }

  const eventoNombre = duelo.nombre.trim() || "Duelo 2 vs 2";
  const eventoEn = latestIsoTimestamp(
    duelo.programado_en,
    duelo.finalizado_at,
    duelo.updated_at
  );

  const slots: Array<{
    jugadorId: string | null;
    nombre: string;
    parejaCon: string;
    esGanador: boolean;
    esParejaA: boolean;
    setsFavor: number;
    setsContra: number;
  }> = [
    {
      jugadorId: duelo.pareja_a_j1_id,
      nombre: duelo.pareja_a_j1_nombre,
      parejaCon: duelo.pareja_a_j2_nombre,
      esGanador: duelo.ganador === "a",
      esParejaA: true,
      setsFavor: duelo.sets_pareja_a,
      setsContra: duelo.sets_pareja_b,
    },
    {
      jugadorId: duelo.pareja_a_j2_id,
      nombre: duelo.pareja_a_j2_nombre,
      parejaCon: duelo.pareja_a_j1_nombre,
      esGanador: duelo.ganador === "a",
      esParejaA: true,
      setsFavor: duelo.sets_pareja_a,
      setsContra: duelo.sets_pareja_b,
    },
    {
      jugadorId: duelo.pareja_b_j1_id,
      nombre: duelo.pareja_b_j1_nombre,
      parejaCon: duelo.pareja_b_j2_nombre,
      esGanador: duelo.ganador === "b",
      esParejaA: false,
      setsFavor: duelo.sets_pareja_b,
      setsContra: duelo.sets_pareja_a,
    },
    {
      jugadorId: duelo.pareja_b_j2_id,
      nombre: duelo.pareja_b_j2_nombre,
      parejaCon: duelo.pareja_b_j1_nombre,
      esGanador: duelo.ganador === "b",
      esParejaA: false,
      setsFavor: duelo.sets_pareja_b,
      setsContra: duelo.sets_pareja_a,
    },
  ];

  const excluded = toExcludedJugadorIdSet(params.excludeJugadorIds);

  const parallelOutcome = await runParallelPlayerParticipacionSync(
    slots.map((slot) => ({
      ctx: { jugadorId: slot.jugadorId ?? undefined, nombre: slot.nombre },
      fn: async (): Promise<PlayerParticipacionSyncResult> => {
        const { jugadorId, failure } = await resolveJugadorForEventSync(
          {
            organizadorId,
            jugadorId: slot.jugadorId,
            nombre: slot.nombre,
            tipoEvento: "duelo_2v2",
            eventoId: duelo.id,
          },
          excluded,
          params.identityCache
        );
        if (failure) {
          return { failure };
        }
        if (!jugadorId) {
          return {};
        }

        const posicion = slot.esGanador ? 1 : 2;
        const resultado: JugadorResultado = slot.esGanador ? "victoria" : "derrota";

        const partidosDetalle = buildDuelo2vs2PartidosDetalle({
          duelo,
          esParejaA: slot.esParejaA,
        });
        const detSummary = summarizePartidosDetalle(partidosDetalle);
        const setsFavor =
          detSummary.jugados > 0 ? detSummary.setsFavor : slot.setsFavor;
        const setsContra =
          detSummary.jugados > 0 ? detSummary.setsContra : slot.setsContra;

        const metadata = enrichMetadataWithPartidosDetalle(
          {
            subtipo: "duelo_2v2_cierre",
            modalidad: "duelo_2v2",
            modalidad_label: "Duelo 2 vs 2",
            organizador_id: organizadorId,
            club_name: getOrganizerDisplayNameSync(organizadorId),
            posicion: posicion,
            posicion_final: posicion,
            total_participantes: 4,
            lugar: slot.esGanador ? "Campeón" : "2do lugar",
            placement: slot.esGanador ? "campeon" : "subcampeon",
            campeon_torneo: slot.esGanador,
            ...(partidosDetalle.length === 0
              ? {
                  partidos_ganados: slot.esGanador ? 1 : 0,
                  partidos_perdidos: slot.esGanador ? 0 : 1,
                  partidos_jugados: 1,
                }
              : {}),
          },
          partidosDetalle
        );

        const persisted = await registrarPuntosRanking({
          jugadorId,
          tipoEvento: "duelo_2v2",
          eventoId: duelo.id,
          eventoNombre,
          resultado,
          formato: "duelo_2v2",
          calcParams: { ganador_duelo: slot.esGanador },
          setsFavor,
          setsContra,
          parejaCon: slot.parejaCon,
          upsertSubtipo: "duelo_2v2_cierre",
          metadata,
          eventoEn,
        });

        return playerSyncFromPersist(persisted);
      },
    }))
  );

  const persistenceBatchOk =
    parallelOutcome.syncFailures.length === 0 &&
    parallelOutcome.touchedJugadorIds.length > 0;

  if (persistenceBatchOk) {
    try {
      const resolvedIds = await resolveDuelo2v2RatingPlayerIds(organizadorId, duelo);
      if (resolvedIds) {
        const ratingApplied = await aplicarRatingDuelo2v2({
          id: duelo.id,
          nombre: duelo.nombre,
          ganador: duelo.ganador,
          ...resolvedIds,
        });
        if (ratingApplied) {
          console.warn(`[rating] duelo 2v2 ${duelo.id}: rating actualizado`);
        }
      }
    } catch (e) {
      console.warn("[rating] duelo 2v2 sync:", e);
    }
  } else if (parallelOutcome.syncFailures.length > 0) {
    console.warn(
      `[rating] duelo 2v2 ${duelo.id}: omitido — historial incompleto (${parallelOutcome.syncFailures.length} syncFailure(s))`
    );
  }

  return {
    touchedJugadorIds: parallelOutcome.touchedJugadorIds,
    participacionEventoId: duelo.id,
    syncFailures:
      parallelOutcome.syncFailures.length > 0
        ? parallelOutcome.syncFailures
        : undefined,
  };
}

function mapDueloRowForBackfill(row: Record<string, unknown>): Duelo2v2 {
  const parseDetalleSets = (raw: unknown): Duelo2v2["detalle_sets"] => {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const o = item as Record<string, unknown>;
        const a = Number(o.a);
        const b = Number(o.b);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
        return { a, b };
      })
      .filter((x): x is { a: number; b: number } => x !== null);
  };

  return {
    id: String(row.id),
    organizador_id: String(row.organizador_id),
    nombre: String(row.nombre),
    descripcion: row.descripcion ? String(row.descripcion) : null,
    cancha: row.cancha != null ? String(row.cancha) : null,
    programado_en: row.programado_en ? String(row.programado_en) : null,
    programado_hasta: row.programado_hasta ? String(row.programado_hasta) : null,
    estado: row.estado as Duelo2v2["estado"],
    pareja_a_j1_id: row.pareja_a_j1_id ? String(row.pareja_a_j1_id) : null,
    pareja_a_j2_id: row.pareja_a_j2_id ? String(row.pareja_a_j2_id) : null,
    pareja_a_j1_nombre: String(row.pareja_a_j1_nombre),
    pareja_a_j2_nombre: String(row.pareja_a_j2_nombre),
    pareja_b_j1_id: row.pareja_b_j1_id ? String(row.pareja_b_j1_id) : null,
    pareja_b_j2_id: row.pareja_b_j2_id ? String(row.pareja_b_j2_id) : null,
    pareja_b_j1_nombre: String(row.pareja_b_j1_nombre),
    pareja_b_j2_nombre: String(row.pareja_b_j2_nombre),
    sets_pareja_a: Number(row.sets_pareja_a ?? 0),
    sets_pareja_b: Number(row.sets_pareja_b ?? 0),
    detalle_sets: parseDetalleSets(row.detalle_sets),
    ganador: (row.ganador as Duelo2v2["ganador"]) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    finalizado_at: row.finalizado_at ? String(row.finalizado_at) : null,
  };
}

/** Re-sincroniza duelos 2v2 finalizados con partidos_detalle. */
export async function backfillDuelosHistorial(
  organizadorId: string
): Promise<number> {
  let count = 0;
  try {
    const { data, error } = await supabase
      .from("duelos_2v2")
      .select("*")
      .eq("organizador_id", organizadorId)
      .eq("estado", "finalizado");

    if (error || !data?.length) return 0;

    for (const row of data) {
      const duelo = mapDueloRowForBackfill(row as Record<string, unknown>);
      if (!duelo.ganador) continue;
      const outcome = await syncDuelo2v2Participaciones({ organizadorId, duelo });
      await refreshJugadorStatsBatch(outcome.touchedJugadorIds);
      count += 1;
    }
  } catch (e) {
    console.error("[riviera-jugadores] backfillDuelosHistorial:", e);
  }
  return count;
}