/**
 * Reparación idempotente de carrera tras cierre durable.
 * NO reabre el evento: solo re-ejecuta finalizeCareerEvent.
 * Seguro ante retry: ON CONFLICT / ledger participacion_id / rating partido_ref.
 */
import { getMatches, getPairs, type Tournament } from "../database";
import { finalizeCareerEvent } from "./careerEventPipeline";
import type { CareerEventPipelineResult } from "./careerEventPipeline";

export type CareerRepairOutcome = {
  careerSyncOk: boolean;
  careerSyncMessage?: string;
  pipeline: CareerEventPipelineResult;
};

function toOutcome(pipeline: CareerEventPipelineResult): CareerRepairOutcome {
  if (pipeline.ok) {
    return { careerSyncOk: true, pipeline };
  }
  return {
    careerSyncOk: false,
    careerSyncMessage:
      pipeline.criticalFailures.map((f) => f.message).join("; ") ||
      "No se pudo completar el historial Riviera.",
    pipeline,
  };
}

/** Reta ya cerrada (o en reparación): completa participaciones/ROMC/rating faltantes. */
export async function repairRetaCareerSync(params: {
  organizadorId: string;
  tournament: Tournament;
}): Promise<CareerRepairOutcome> {
  const [pairs, matches] = await Promise.all([
    getPairs(params.tournament.id),
    getMatches(params.tournament.id),
  ]);
  const pipeline = await finalizeCareerEvent({
    kind: "reta",
    organizadorId: params.organizadorId,
    tournament: { ...params.tournament, is_finished: true },
    pairs,
    matches,
    options: { telemetry: true, identityCache: true },
  });
  return toOutcome(pipeline);
}

/** Torneo Express ya cerrado: re-sync carrera sin reabrir. */
export async function repairTorneoExpressCareerSync(params: {
  organizadorId: string;
  torneoId: string;
}): Promise<CareerRepairOutcome> {
  const pipeline = await finalizeCareerEvent({
    kind: "torneo_express",
    organizadorId: params.organizadorId,
    torneoId: params.torneoId,
    options: { telemetry: true, identityCache: true },
  });
  return toOutcome(pipeline);
}

/** Jornada de liga ya completed: re-sync historial. */
export async function repairLigaJornadaCareerSync(params: {
  organizadorId: string;
  ligaId: string;
  jornadaNumero: number;
}): Promise<CareerRepairOutcome> {
  const pipeline = await finalizeCareerEvent({
    kind: "liga_jornada",
    organizadorId: params.organizadorId,
    ligaId: params.ligaId,
    jornadaNumero: params.jornadaNumero,
    options: { telemetry: true, identityCache: true },
  });
  return toOutcome(pipeline);
}

/** Podio final de liga ya completed: re-sync. */
export async function repairLigaPodioCareerSync(params: {
  organizadorId: string;
  ligaId: string;
}): Promise<CareerRepairOutcome> {
  const pipeline = await finalizeCareerEvent({
    kind: "liga_podio",
    organizadorId: params.organizadorId,
    ligaId: params.ligaId,
    options: { telemetry: true, identityCache: true },
  });
  return toOutcome(pipeline);
}
