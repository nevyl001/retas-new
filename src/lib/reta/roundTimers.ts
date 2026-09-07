/**
 * Timers por ronda (organizer → público).
 * Persistidos en tournament_public_config.round_timers.
 */

export type RoundTimerEntry = {
  durationMinutes: number;
  startedAt: string;
  endsAt: string;
};

export type RoundTimersState = {
  version: 1;
  rounds: Record<string, RoundTimerEntry>;
};

export const ROUND_TIMER_PRESETS = [10, 15, 20, 25, 30, 45, 60] as const;

export const EMPTY_ROUND_TIMERS: RoundTimersState = {
  version: 1,
  rounds: {},
};

export function roundTimerKey(round: number | string): string {
  const n = typeof round === "string" ? Number(round) : round;
  if (!Number.isFinite(n) || n <= 0) return String(round);
  return String(Math.floor(n));
}

export function parseRoundTimers(raw: unknown): RoundTimersState {
  if (!raw || typeof raw !== "object") return { ...EMPTY_ROUND_TIMERS, rounds: {} };
  const obj = raw as Record<string, unknown>;
  const roundsRaw =
    obj.rounds && typeof obj.rounds === "object"
      ? (obj.rounds as Record<string, unknown>)
      : obj;
  const rounds: Record<string, RoundTimerEntry> = {};
  for (const [key, value] of Object.entries(roundsRaw)) {
    if (key === "version") continue;
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const endsAt = typeof row.endsAt === "string" ? row.endsAt : null;
    const startedAt = typeof row.startedAt === "string" ? row.startedAt : null;
    const durationMinutes = Number(row.durationMinutes);
    if (!endsAt || !startedAt || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      continue;
    }
    rounds[roundTimerKey(key)] = {
      durationMinutes: Math.min(180, Math.max(1, Math.round(durationMinutes))),
      startedAt,
      endsAt,
    };
  }
  return { version: 1, rounds };
}

export function buildRoundTimerEntry(
  durationMinutes: number,
  nowMs = Date.now()
): RoundTimerEntry {
  const mins = Math.min(180, Math.max(1, Math.round(durationMinutes)));
  const startedAt = new Date(nowMs).toISOString();
  const endsAt = new Date(nowMs + mins * 60_000).toISOString();
  return { durationMinutes: mins, startedAt, endsAt };
}

export function remainingMs(endsAt: string, nowMs = Date.now()): number {
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, end - nowMs);
}

/** MM:SS; "0:00" si ya venció; null si no hay timer. */
export function formatRemainingClock(
  entry: RoundTimerEntry | null | undefined,
  nowMs = Date.now()
): string | null {
  if (!entry?.endsAt) return null;
  const ms = remainingMs(entry.endsAt, nowMs);
  if (ms <= 0) return "0:00";
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function isRoundTimerActive(
  entry: RoundTimerEntry | null | undefined,
  nowMs = Date.now()
): boolean {
  return Boolean(entry?.endsAt && remainingMs(entry.endsAt, nowMs) > 0);
}

/** Hay timer definido (activo o ya en 0:00). */
export function hasRoundTimer(
  entry: RoundTimerEntry | null | undefined
): boolean {
  return Boolean(entry?.endsAt);
}

const LOCAL_KEY = "riviera:round-timers:";

export function loadRoundTimersLocal(tournamentId: string): RoundTimersState {
  try {
    const raw = localStorage.getItem(`${LOCAL_KEY}${tournamentId.trim()}`);
    if (!raw) return { ...EMPTY_ROUND_TIMERS, rounds: {} };
    return parseRoundTimers(JSON.parse(raw));
  } catch {
    return { ...EMPTY_ROUND_TIMERS, rounds: {} };
  }
}

export function saveRoundTimersLocal(
  tournamentId: string,
  state: RoundTimersState
): void {
  try {
    localStorage.setItem(
      `${LOCAL_KEY}${tournamentId.trim()}`,
      JSON.stringify(state)
    );
  } catch {
    /* ignore quota */
  }
}
