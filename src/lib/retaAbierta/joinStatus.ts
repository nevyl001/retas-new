import type { OpenRegistrationEntryStatus } from "./types";

/** Lógica de asignación de cupo (espejo del RPC; para tests unitarios). */
export function resolveOpenRegistrationJoinStatus(opts: {
  approvalRequired: boolean;
  confirmedCount: number;
  capacity: number;
  waitlistEnabled: boolean;
}): { status: OpenRegistrationEntryStatus } | { error: "full" } {
  if (opts.approvalRequired) {
    return { status: "pending_approval" };
  }
  if (opts.confirmedCount < opts.capacity) {
    return { status: "confirmed" };
  }
  if (opts.waitlistEnabled) {
    return { status: "waitlist" };
  }
  return { error: "full" };
}
