import { supabase, supabasePublicRead } from "../supabaseClient";
import { isMissingColumnError } from "../db/schemaHelpers";
import {
  buildRoundTimerEntry,
  EMPTY_ROUND_TIMERS,
  loadRoundTimersLocal,
  parseRoundTimers,
  roundTimerKey,
  saveRoundTimersLocal,
  type RoundTimersState,
} from "./roundTimers";

let warnedMissingRoundTimersColumn = false;

function warnMissingColumnOnce() {
  if (warnedMissingRoundTimersColumn) return;
  warnedMissingRoundTimersColumn = true;
  console.warn(
    "[round-timers] Columna round_timers ausente en tournament_public_config. Ejecuta supabase/sql/patch-round-timers.sql (o migrations/0041)."
  );
}

/** Lectura pública (anon) + caché local. */
export async function fetchRoundTimers(
  tournamentId: string
): Promise<RoundTimersState> {
  const tid = tournamentId.trim();
  if (!tid) return { ...EMPTY_ROUND_TIMERS, rounds: {} };
  const local = loadRoundTimersLocal(tid);
  try {
    const { data, error } = await supabasePublicRead
      .from("tournament_public_config")
      .select("*")
      .eq("tournament_id", tid)
      .maybeSingle();
    if (error) {
      if (isMissingColumnError(error, "tournament_public_config", "round_timers")) {
        warnMissingColumnOnce();
      }
      return local;
    }
    if (!data) return local;
    const row = data as Record<string, unknown>;
    if (!("round_timers" in row)) {
      warnMissingColumnOnce();
      return local;
    }
    const parsed = parseRoundTimers(row.round_timers);
    saveRoundTimersLocal(tid, parsed);
    return parsed;
  } catch {
    return local;
  }
}

async function writeRoundTimers(
  tournamentId: string,
  state: RoundTimersState
): Promise<boolean> {
  const tid = tournamentId.trim();
  saveRoundTimersLocal(tid, state);
  try {
    const { data: existing, error: selErr } = await supabase
      .from("tournament_public_config")
      .select("*")
      .eq("tournament_id", tid)
      .maybeSingle();
    if (
      selErr &&
      !isMissingColumnError(selErr, "tournament_public_config", "round_timers")
    ) {
      console.warn("[round-timers] select:", selErr.message);
    }

    const basePayload = {
      tournament_id: tid,
      format: (existing?.format as string) || "round_robin",
      team_config: existing?.team_config ?? null,
    };

    const { error: baseError } = await supabase
      .from("tournament_public_config")
      .upsert(basePayload, { onConflict: "tournament_id" });
    if (baseError) {
      console.warn("[round-timers] upsert base:", baseError.message);
      return false;
    }

    const { data: row, error: readError } = await supabase
      .from("tournament_public_config")
      .select("*")
      .eq("tournament_id", tid)
      .maybeSingle();

    if (readError || !row || !("round_timers" in (row as object))) {
      warnMissingColumnOnce();
      return false;
    }

    const { error: updError } = await supabase
      .from("tournament_public_config")
      .update({ round_timers: state })
      .eq("tournament_id", tid);

    if (updError) {
      if (
        isMissingColumnError(updError, "tournament_public_config", "round_timers")
      ) {
        warnMissingColumnOnce();
        return false;
      }
      console.warn("[round-timers] update:", updError.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[round-timers] write:", e);
    return false;
  }
}

/** Inicia / reinicia el contador de una ronda (minutos de juego). */
export async function startRoundTimer(
  tournamentId: string,
  round: number,
  durationMinutes: number,
  current?: RoundTimersState
): Promise<RoundTimersState> {
  const tid = tournamentId.trim();
  const base = current ?? (await fetchRoundTimers(tid));
  const next: RoundTimersState = {
    version: 1,
    rounds: {
      ...base.rounds,
      [roundTimerKey(round)]: buildRoundTimerEntry(durationMinutes),
    },
  };
  await writeRoundTimers(tid, next);
  return next;
}

/** Detiene / limpia el timer de una ronda. */
export async function clearRoundTimer(
  tournamentId: string,
  round: number,
  current?: RoundTimersState
): Promise<RoundTimersState> {
  const tid = tournamentId.trim();
  const base = current ?? (await fetchRoundTimers(tid));
  const rounds = { ...base.rounds };
  delete rounds[roundTimerKey(round)];
  const next: RoundTimersState = { version: 1, rounds };
  await writeRoundTimers(tid, next);
  return next;
}
