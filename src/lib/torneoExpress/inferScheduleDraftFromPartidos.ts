import { defaultCourtNames } from "./assignRoundRobinSchedule";
import {
  partidoScheduleIso,
  programadoDraftFromPartido,
} from "./partidoSchedule";
import { todayMexicoDateInput } from "./teScheduleTime";
import type { TorneoExpressPartido } from "./types";

export type TeScheduleDraft = {
  playDate: string;
  startTime: string;
  durationMinutes: number;
  courtCount: number;
  courtNames: string[];
};

const DEFAULT_SCHEDULE: TeScheduleDraft = {
  playDate: todayMexicoDateInput(),
  startTime: "09:00",
  durationMinutes: 45,
  courtCount: 2,
  courtNames: defaultCourtNames(2),
};

function normalizeScheduleDraft(
  raw: Partial<TeScheduleDraft> | undefined
): TeScheduleDraft {
  const courtCountRaw = raw?.courtCount;
  const courtCount =
    typeof courtCountRaw === "number" && Number.isFinite(courtCountRaw)
      ? Math.max(1, Math.min(8, Math.floor(courtCountRaw)))
      : DEFAULT_SCHEDULE.courtCount;

  const durationRaw = raw?.durationMinutes;
  const durationMinutes =
    typeof durationRaw === "number" &&
    Number.isFinite(durationRaw) &&
    durationRaw > 0
      ? Math.floor(durationRaw)
      : DEFAULT_SCHEDULE.durationMinutes;

  const existingNames = Array.isArray(raw?.courtNames)
    ? raw!.courtNames.map((n) => (typeof n === "string" ? n : ""))
    : [];

  const courtNames = defaultCourtNames(courtCount).map((fallback, i) => {
    const stored = existingNames[i]?.trim();
    return stored || fallback;
  });

  return {
    playDate:
      typeof raw?.playDate === "string" && raw.playDate.trim()
        ? raw.playDate.trim()
        : DEFAULT_SCHEDULE.playDate,
    startTime:
      typeof raw?.startTime === "string" && raw.startTime.trim()
        ? raw.startTime.trim()
        : DEFAULT_SCHEDULE.startTime,
    durationMinutes,
    courtCount,
    courtNames,
  };
}

function inferDurationMinutes(partidos: TorneoExpressPartido[]): number {
  const times = partidos
    .map((p) => new Date(partidoScheduleIso(p)).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  for (let i = 1; i < times.length; i += 1) {
    const gapMinutes = Math.round((times[i] - times[i - 1]) / 60_000);
    if (gapMinutes >= 15 && gapMinutes <= 180) {
      return gapMinutes;
    }
  }

  return DEFAULT_SCHEDULE.durationMinutes;
}

/** Valores iniciales del editor de programación a partir de partidos existentes. */
export function inferScheduleDraftFromPartidos(
  partidos: TorneoExpressPartido[]
): TeScheduleDraft {
  if (partidos.length === 0) {
    return normalizeScheduleDraft(undefined);
  }

  const pending = partidos.filter((p) => p.estado !== "jugado");
  const source = pending.length > 0 ? pending : partidos;
  const sorted = [...source].sort(
    (a, b) =>
      new Date(partidoScheduleIso(a)).getTime() -
      new Date(partidoScheduleIso(b)).getTime()
  );
  const first = sorted[0]!;
  const draft = programadoDraftFromPartido(first);

  const courtSet = new Set<string>();
  for (const partido of partidos) {
    const raw = partido.cancha?.trim();
    if (raw) courtSet.add(raw);
  }

  const courtNames =
    courtSet.size > 0
      ? Array.from(courtSet)
      : defaultCourtNames(DEFAULT_SCHEDULE.courtCount);

  return normalizeScheduleDraft({
    playDate: draft.date,
    startTime: draft.time,
    durationMinutes: inferDurationMinutes(sorted),
    courtCount: courtNames.length,
    courtNames,
  });
}

export function resolveActiveCourtNamesFromDraft(
  schedule: TeScheduleDraft
): string[] {
  return schedule.courtNames.slice(0, schedule.courtCount).map((n) => n.trim());
}
