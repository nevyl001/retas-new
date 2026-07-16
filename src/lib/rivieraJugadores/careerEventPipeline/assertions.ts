import { supabase } from "../../supabaseClient";
import { ensureRivieraIdentity } from "../careerIdentity";
import { resolveJugadorIdForRating } from "../organizerPlayerAccess";
import { isValidRivieraId } from "../rivieraIdDisplay";
import {
  ensureOfficialProfileLinkForParticipacion,
} from "../orphanProfileLink";
import type {
  CareerEventAssertionFailure,
  CareerEventAssertionSeverity,
  CareerEventContext,
} from "./types";
import { getAssertionSeverity } from "./types";

const LOG_PREFIX = "[career-event-pipeline:assert]";

export type AssertCareerEventParams = {
  context: CareerEventContext;
  touchedJugadorIds: string[];
  requireRating?: boolean;
  ratingPartidoRefs?: string[];
};

type ParticipacionRow = {
  id: string;
  jugador_id: string;
  puntos_obtenidos: number | null;
  metadata: Record<string, unknown> | null;
};

async function loadParticipacionesForEvent(
  tipoEvento: string,
  eventoId: string
): Promise<ParticipacionRow[]> {
  const { data, error } = await supabase
    .from("jugador_participaciones")
    .select("id, jugador_id, puntos_obtenidos, metadata")
    .eq("tipo_evento", tipoEvento)
    .eq("evento_id", eventoId);

  if (error) {
    console.error(LOG_PREFIX, "loadParticipacionesForEvent:", error);
    return [];
  }
  return (data ?? []) as ParticipacionRow[];
}

/**
 * Rating de cedidos se escribe en el perfil origen (vía grant estable);
 * la participación vive en el clon local.
 *
 * Solo acepta movimiento en el ID que resuelve resolveJugadorIdForRating
 * (local nativo o source del grant) + partido_ref exacto del evento.
 * No busca por nombre ni acepta “cualquier” ID con el mismo Riviera ID.
 */
async function hasRatingForJugador(
  jugadorId: string,
  organizadorId: string,
  partidoRefs: string[]
): Promise<boolean> {
  if (partidoRefs.length === 0) return true;

  let ratingJugadorId = jugadorId.trim();
  try {
    ratingJugadorId = (
      await resolveJugadorIdForRating(organizadorId, jugadorId)
    ).trim();
  } catch (e) {
    console.warn(LOG_PREFIX, "resolveJugadorIdForRating:", e);
    return false;
  }
  if (!ratingJugadorId) return false;

  for (const ref of partidoRefs) {
    const partidoRef = String(ref ?? "").trim();
    if (!partidoRef) continue;

    const { data, error } = await supabase
      .from("rating_historial")
      .select("id, rating_antes, rating_despues, delta, partido_ref")
      .eq("jugador_id", ratingJugadorId)
      .eq("partido_ref", partidoRef)
      .limit(2);

    if (error || !data || data.length === 0) continue;
    // Índice único (jugador_id, partido_ref): >1 sería inconsistencia.
    if (data.length !== 1) continue;

    const row = data[0] as {
      rating_antes?: number | null;
      rating_despues?: number | null;
      delta?: number | null;
      partido_ref?: string | null;
    };
    if (String(row.partido_ref ?? "") !== partidoRef) continue;
    if (
      row.rating_antes == null ||
      row.rating_despues == null ||
      row.delta == null ||
      !Number.isFinite(Number(row.rating_antes)) ||
      !Number.isFinite(Number(row.rating_despues)) ||
      !Number.isFinite(Number(row.delta))
    ) {
      continue;
    }
    return true;
  }
  return false;
}

async function hasJugadorStats(jugadorId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("jugador_stats")
    .select("jugador_id")
    .eq("jugador_id", jugadorId)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

async function loadRivieraIdentity(
  jugadorId: string,
  organizadorId: string
): Promise<{
  rivieraId: string | null;
  hasProfileLink: boolean;
}> {
  const identity = await ensureRivieraIdentity(jugadorId);
  // Soft check: no usar require* (lanza). El enlace ya se exigió en pre-close/sync.
  const linkResult = await ensureOfficialProfileLinkForParticipacion(
    jugadorId,
    organizadorId
  );

  return {
    rivieraId:
      (typeof identity?.rivieraId === "string" ? identity.rivieraId : null) ??
      (typeof linkResult?.rivieraId === "string" ? linkResult.rivieraId : null) ??
      null,
    hasProfileLink: Boolean(
      linkResult?.officialPlayerKey ||
        linkResult?.linked ||
        identity?.officialPlayerKey
    ),
  };
}

function detectDuplicateParticipaciones(
  rows: ParticipacionRow[]
): CareerEventAssertionFailure[] {
  const seen = new Map<string, string>();
  const failures: CareerEventAssertionFailure[] = [];

  for (const row of rows) {
    const subtipo =
      typeof row.metadata?.subtipo === "string"
        ? row.metadata.subtipo
        : "__default__";
    const key = `${row.jugador_id}|${subtipo}`;
    const prev = seen.get(key);
    if (prev && prev !== row.id) {
      failures.push({
        code: "duplicate_participacion",
        message: `Participación duplicada para jugador ${row.jugador_id} subtipo ${subtipo}`,
        jugadorId: row.jugador_id,
        severity: "critical",
        details: { existingId: prev, duplicateId: row.id, subtipo },
      });
    } else {
      seen.set(key, row.id);
    }
  }

  return failures;
}

function withSeverity(
  failure: Omit<CareerEventAssertionFailure, "severity"> & {
    severity?: CareerEventAssertionSeverity;
  }
): CareerEventAssertionFailure {
  return {
    ...failure,
    severity: failure.severity ?? getAssertionSeverity(failure.code),
  };
}

/**
 * Validaciones post-finalización del pipeline canónico.
 * Clasifica fallas críticas vs diagnósticas (warnings).
 */
export async function assertCareerEventIntegrity(
  params: AssertCareerEventParams
): Promise<CareerEventAssertionFailure[]> {
  const { context, touchedJugadorIds, requireRating, ratingPartidoRefs } =
    params;
  const failures: CareerEventAssertionFailure[] = [];

  const participaciones = await loadParticipacionesForEvent(
    context.tipoEvento,
    context.eventoId
  );

  if (participaciones.length === 0 && touchedJugadorIds.length > 0) {
    failures.push(
      withSeverity({
        code: "missing_historial",
        message: `Sin participaciones registradas para ${context.kind} ${context.eventoId}`,
        details: { tipoEvento: context.tipoEvento, eventoId: context.eventoId },
      })
    );
  }

  failures.push(...detectDuplicateParticipaciones(participaciones));

  const jugadorIdsToCheck = Array.from(
    new Set([
      ...touchedJugadorIds,
      ...participaciones.map((p) => p.jugador_id),
    ])
  );

  for (const jugadorId of jugadorIdsToCheck) {
    const rowsForJugador = participaciones.filter(
      (p) => p.jugador_id === jugadorId
    );

    if (rowsForJugador.length === 0) {
      failures.push(
        withSeverity({
          code: "missing_historial",
          message: `Jugador ${jugadorId} sin historial para el evento`,
          jugadorId,
        })
      );
      continue;
    }

    for (const row of rowsForJugador) {
      const meta = row.metadata ?? {};
      const orgId = meta.organizador_id;
      if (typeof orgId !== "string" || !orgId.trim()) {
        failures.push(
          withSeverity({
            code: "missing_organizador_id",
            message: `metadata.organizador_id ausente en participación ${row.id}`,
            jugadorId,
            details: { participacionId: row.id },
          })
        );
      }

      const clubName = meta.club_name;
      if (typeof clubName !== "string" || !clubName.trim()) {
        failures.push(
          withSeverity({
            code: "missing_club_name",
            message: `metadata.club_name ausente en participación ${row.id}`,
            jugadorId,
            details: { participacionId: row.id },
          })
        );
      }

      const puntos = row.puntos_obtenidos ?? 0;
      if (puntos <= 0 && meta.puntos_aplicados === true) {
        failures.push(
          withSeverity({
            code: "missing_local_points",
            message: `Puntos locales en 0 con puntos_aplicados=true (${row.id})`,
            jugadorId,
            details: { participacionId: row.id },
          })
        );
      }
    }

    const totalPuntos = rowsForJugador.reduce(
      (sum, r) => sum + Math.max(0, r.puntos_obtenidos ?? 0),
      0
    );
    if (totalPuntos <= 0 && context.kind !== "liga_inscripcion") {
      const anyApplied = rowsForJugador.some(
        (r) => r.metadata?.puntos_aplicados === true
      );
      if (!anyApplied) {
        failures.push(
          withSeverity({
            code: "missing_global_points",
            message: `Sin puntos globales/locales para jugador ${jugadorId}`,
            jugadorId,
          })
        );
      }
    }

    if (requireRating && ratingPartidoRefs?.length) {
      const hasRating = await hasRatingForJugador(
        jugadorId,
        context.organizadorId,
        ratingPartidoRefs
      );
      if (!hasRating) {
        failures.push(
          withSeverity({
            code: "missing_rating",
            message: `Sin movimiento de rating para jugador ${jugadorId}`,
            jugadorId,
            details: { partidoRefs: ratingPartidoRefs },
          })
        );
      }
    }

    const identity = await loadRivieraIdentity(
      jugadorId,
      context.organizadorId
    );
    if (!identity.rivieraId || !isValidRivieraId(identity.rivieraId)) {
      failures.push(
        withSeverity({
          code: "missing_riviera_id",
          message: `Riviera ID ausente o inválido para jugador ${jugadorId}`,
          jugadorId,
        })
      );
    }
    if (!identity.hasProfileLink) {
      failures.push(
        withSeverity({
          code: "missing_player_identity",
          message: `Sin enlace player_identity para jugador ${jugadorId}`,
          jugadorId,
        })
      );
    }

    const hasStats = await hasJugadorStats(jugadorId);
    if (!hasStats) {
      failures.push(
        withSeverity({
          code: "missing_stats",
          message: `jugador_stats ausente para ${jugadorId}`,
          jugadorId,
        })
      );
    }
  }

  if (failures.length > 0) {
    const critical = failures.filter((f) => f.severity === "critical");
    const warnings = failures.filter((f) => f.severity !== "critical");
    console.error(LOG_PREFIX, "integrity failures", {
      kind: context.kind,
      eventoId: context.eventoId,
      criticalCount: critical.length,
      warningCount: warnings.length,
      failures,
    });
  }

  return failures;
}

export function partitionAssertionFailures(
  failures: CareerEventAssertionFailure[]
): {
  criticalFailures: CareerEventAssertionFailure[];
  warnings: CareerEventAssertionFailure[];
} {
  const criticalFailures: CareerEventAssertionFailure[] = [];
  const warnings: CareerEventAssertionFailure[] = [];
  for (const f of failures) {
    const severity = f.severity ?? getAssertionSeverity(f.code);
    if (severity === "critical") criticalFailures.push({ ...f, severity });
    else warnings.push({ ...f, severity: "diagnostic" });
  }
  return { criticalFailures, warnings };
}
