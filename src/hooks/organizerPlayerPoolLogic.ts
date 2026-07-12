import type { Player } from "../lib/database";

/** Spinner solo en primera carga sin datos (nunca por length===0 solo). */
export function shouldShowPlayerPoolLoading(
  loading: boolean,
  playerCount: number
): boolean {
  return loading && playerCount === 0;
}

export function derivePlayerPoolViews(
  players: readonly Player[],
  pairedIds: readonly string[]
): { available: Player[]; paired: Player[] } {
  const pairedSet = new Set(pairedIds);
  const available: Player[] = [];
  const paired: Player[] = [];
  for (const player of players) {
    if (pairedSet.has(player.id)) paired.push(player);
    else available.push(player);
  }
  return { available, paired };
}

/**
 * Secuencia anti-race: solo la request vigente puede mutar estado.
 * tournamentId no forma parte del contexto (getPlayers lo ignora).
 */
export class PoolRequestGate {
  private currentId = 0;

  begin(): number {
    this.currentId += 1;
    return this.currentId;
  }

  /** Invalida in-flight (cambio de organizer / unmount / nuevo fetch). */
  invalidate(): void {
    this.currentId += 1;
  }

  isCurrent(requestId: number): boolean {
    return requestId === this.currentId;
  }

  get current(): number {
    return this.currentId;
  }
}

export type PoolFetchCommit =
  | { kind: "ignore" }
  | { kind: "success"; players: Player[] }
  | { kind: "error"; message: string }
  | { kind: "done" };

/** Decide si una respuesta puede aplicarse (anti-race). */
export function commitPoolFetchResult(
  gate: PoolRequestGate,
  requestId: number,
  outcome:
    | { ok: true; players: Player[] }
    | { ok: false; message: string }
): PoolFetchCommit {
  if (!gate.isCurrent(requestId)) return { kind: "ignore" };
  if (outcome.ok) return { kind: "success", players: outcome.players };
  return { kind: "error", message: outcome.message };
}

export function shouldFetchOrganizerPool(
  organizerId: string | null | undefined
): organizerId is string {
  return typeof organizerId === "string" && organizerId.trim().length > 0;
}

/** Warnings huérfanos no deben vaciar ni bloquear el pool. */
export function applyOrphanWarningsSideEffect(
  players: Player[],
  _warnings: readonly string[]
): Player[] {
  return players;
}
