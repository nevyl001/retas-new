import type { ScheduleAssignment, ScheduleMatch } from "./schedulePendingGroup";
import { formatPartidoFecha, formatPartidoHora } from "./partidoSchedule";

export const NO_MISSING_COPY =
  "Todos los partidos pendientes ya tienen horario y cancha.";

export const REORGANIZE_NOTE =
  "Los partidos jugados conservarán su horario. Solo se reorganizarán los pendientes.";

export const FAIRNESS_COPY =
  "La programación intenta evitar partidos consecutivos y distribuir mejor los descansos.";

export const INSUFFICIENT_SLOTS_COPY =
  "No hay suficientes horarios disponibles para acomodar todos los partidos pendientes.";

export type GroupScheduleChange = {
  matchId: string;
  localLabel: string;
  visitLabel: string;
  before: string;
  after: string;
  afterTime: string;
  afterCourt: string;
};

export function hasScheduleSlot(match: Pick<ScheduleMatch, "cancha" | "programadoEn">): boolean {
  return Boolean(match.programadoEn?.trim() && match.cancha?.trim());
}

export function pendingWithoutSlot(matches: ScheduleMatch[]): ScheduleMatch[] {
  return matches.filter((match) => !match.played && !hasScheduleSlot(match));
}

export function formatSlotLabel(
  programadoEn: string | null | undefined,
  cancha: string | null | undefined
): string {
  const iso = programadoEn?.trim();
  const court = cancha?.trim();
  if (!iso || !court) return "Sin horario";
  return `${formatPartidoFecha(iso)} · ${formatPartidoHora(iso)} · ${court}`;
}

export function changesFromAssignments(
  matches: ScheduleMatch[],
  assignments: ScheduleAssignment[],
  labelOf: (pairId: string) => string
): GroupScheduleChange[] {
  const byId = new Map(matches.map((match) => [match.id, match]));
  return assignments.map((assignment) => {
    const match = byId.get(assignment.matchId);
    return {
      matchId: assignment.matchId,
      localLabel: match ? labelOf(match.localId) : "Pareja",
      visitLabel: match ? labelOf(match.visitanteId) : "Pareja",
      before: formatSlotLabel(match?.programadoEn, match?.cancha),
      after: formatSlotLabel(assignment.programadoEn, assignment.cancha),
      afterTime: formatPartidoHora(assignment.programadoEn),
      afterCourt: assignment.cancha.trim(),
    };
  });
}

export function groupScheduleApplyNotice(
  code: string
): { message: string; reload: boolean } | null {
  if (code === "STALE_GROUP_VERSION") {
    return {
      message:
        "El grupo cambió mientras estabas editando. Actualizamos la información; vuelve a intentar.",
      reload: true,
    };
  }
  if (code === "PLAYED_MATCH_LOCKED") {
    return {
      message:
        "Uno de estos partidos ya fue jugado y su programación ya no puede modificarse.",
      reload: true,
    };
  }
  if (code === "PENDING_ALREADY_SCHEDULED") {
    return {
      message:
        "La programación cambió mientras estabas trabajando. Actualizamos el grupo.",
      reload: true,
    };
  }
  return null;
}
