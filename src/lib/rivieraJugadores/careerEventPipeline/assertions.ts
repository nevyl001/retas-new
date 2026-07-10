import { supabase } from "../../supabaseClient";
import { ensureRivieraIdentity } from "../careerIdentity";
import { isValidRivieraId } from "../rivieraIdDisplay";
import { requireOfficialProfileLinkForParticipacion } from "../orphanProfileLink";
import type {
  CareerEventAssertionFailure,
  CareerEventContext,
} from "./types";

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

async function hasRatingForJugador(
  jugadorId: string,
  partidoRefs: string[]
): Promise<boolean> {
  if (partidoRefs.length === 0) return true;
  for (const ref of partidoRefs) {
    const { data, error } = await supabase
      .from("rating_historial")
      .select("id")
      .eq("jugador_id", jugadorId)
      .eq("partido_ref", ref)
      .limit(1)
      .maybeSingle();
    if (!error && data) return true;
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
  const linkResult = await requireOfficialProfileLinkForParticipacion(
    jugadorId,
    organizadorId
  );

  return {
    rivieraId:
      (typeof identity?.rivieraId === "string" ? identity.rivieraId : null) ??
      linkResult.rivieraId ??
      null,
    hasProfileLink: Boolean(linkResult.officialPlayerKey),
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
        details: { existingId: prev, duplicateId: row.id, subtipo },
      });
    } else {
      seen.set(key, row.id);
    }
  }

  return failures;
}

/**
 * Validaciones post-finalización del pipeline canónico.
 * Si alguna falla, el evento NO se considera completamente procesado.
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
    failures.push({
      code: "missing_historial",
      message: `Sin participaciones registradas para ${context.kind} ${context.eventoId}`,
      details: { tipoEvento: context.tipoEvento, eventoId: context.eventoId },
    });
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
      failures.push({
        code: "missing_historial",
        message: `Jugador ${jugadorId} sin historial para el evento`,
        jugadorId,
      });
      continue;
    }

    for (const row of rowsForJugador) {
      const meta = row.metadata ?? {};
      const orgId = meta.organizador_id;
      if (typeof orgId !== "string" || !orgId.trim()) {
        failures.push({
          code: "missing_organizador_id",
          message: `metadata.organizador_id ausente en participación ${row.id}`,
          jugadorId,
          details: { participacionId: row.id },
        });
      }

      const clubName = meta.club_name;
      if (typeof clubName !== "string" || !clubName.trim()) {
        failures.push({
          code: "missing_club_name",
          message: `metadata.club_name ausente en participación ${row.id}`,
          jugadorId,
          details: { participacionId: row.id },
        });
      }

      const puntos = row.puntos_obtenidos ?? 0;
      if (puntos <= 0 && meta.puntos_aplicados === true) {
        failures.push({
          code: "missing_local_points",
          message: `Puntos locales en 0 con puntos_aplicados=true (${row.id})`,
          jugadorId,
          details: { participacionId: row.id },
        });
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
        failures.push({
          code: "missing_global_points",
          message: `Sin puntos globales/locales para jugador ${jugadorId}`,
          jugadorId,
        });
      }
    }

    if (requireRating && ratingPartidoRefs?.length) {
      const hasRating = await hasRatingForJugador(
        jugadorId,
        ratingPartidoRefs
      );
      if (!hasRating) {
        failures.push({
          code: "missing_rating",
          message: `Sin movimiento de rating para jugador ${jugadorId}`,
          jugadorId,
          details: { partidoRefs: ratingPartidoRefs },
        });
      }
    }

    const identity = await loadRivieraIdentity(
      jugadorId,
      context.organizadorId
    );
    if (!identity.rivieraId || !isValidRivieraId(identity.rivieraId)) {
      failures.push({
        code: "missing_riviera_id",
        message: `Riviera ID ausente o inválido para jugador ${jugadorId}`,
        jugadorId,
      });
    }
    if (!identity.hasProfileLink) {
      failures.push({
        code: "missing_player_identity",
        message: `Sin enlace player_identity para jugador ${jugadorId}`,
        jugadorId,
      });
    }

    const hasStats = await hasJugadorStats(jugadorId);
    if (!hasStats) {
      failures.push({
        code: "missing_stats",
        message: `jugador_stats ausente para ${jugadorId}`,
        jugadorId,
      });
    }
  }

  if (failures.length > 0) {
    console.error(LOG_PREFIX, "integrity failures", {
      kind: context.kind,
      eventoId: context.eventoId,
      failures,
    });
  }

  return failures;
}
