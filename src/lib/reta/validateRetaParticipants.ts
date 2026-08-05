import type { Pair, Tournament } from "../database";
import { collectProspectiveJugadorRefs, validateCareerEventPreClose } from "../rivieraJugadores/careerEventPipeline/preCloseGuards";
import type { FinalizeCareerEventInput } from "../rivieraJugadores/careerEventPipeline/types";
import { resolveJugadorIdForParticipacion } from "../rivieraJugadores/jugadorIdResolver";

/**
 * Identidad de un jugador ya validado, lista para iniciar la reta.
 * playerId = players.id (legacy, el mismo que usan pairs.player1_id/player2_id).
 * jugadorId = riviera_jugadores.id resuelto para ese playerId.
 */
export type RetaPlayerIdentity = {
  playerId: string;
  jugadorId: string;
  displayName: string;
};

export type RetaInvalidPlayer = {
  playerId: string;
  displayName: string;
  reason: string;
  suggestedAction: string;
  /** Código de la falla del pre-close (ver CareerEventAssertionFailure). */
  code: string;
  /**
   * true solo si es un problema real de identidad del jugador. false para
   * fallos técnicos (red, RLS, RPC): esos NO deben acusar al jugador.
   */
  isIdentityProblem: boolean;
};

export type RetaParticipantValidation = {
  ok: boolean;
  validPlayers: RetaPlayerIdentity[];
  invalidPlayers: RetaInvalidPlayer[];
  /**
   * true si TODAS las fallas son técnicas (ninguna de identidad). El llamador
   * debe ofrecer "reintentar" en vez de pedir revincular jugadores.
   */
  onlyTechnicalFailures: boolean;
};

const DEFAULT_SUGGESTED_ACTION =
  "Vuelve a seleccionar al jugador o vincula su Riviera ID";

/**
 * Gate único antes de iniciar una reta (bloquea inicio; también se ejecuta
 * defensivamente al cerrar, dentro de finalize_reta_atomic). Reusa el mismo
 * validador que ya corre al CERRAR una reta (`validateCareerEventPreClose`,
 * preCloseGuards.ts) para que "puede jugar" y "puede cerrar" sean
 * exactamente la misma regla — el incidente de "Said C" (2026-08-05) fue
 * justamente que un jugador pasó el inicio pero no el cierre porque esas dos
 * comprobaciones vivían separadas. No reimplementa resolución de identidad:
 * consume las mismas piezas ya exportadas que usa el pipeline de cierre
 * (pipeline.ts).
 *
 * Recibe tournament/pairs ya en memoria del llamador (no vuelve a
 * consultarlos) porque en el flujo real de inicio (useTournamentActions.
 * startTournament) ya están cargados — evita una vuelta de red extra que en
 * móvil solo suma otra oportunidad de quedarse colgado.
 */
export async function validateRetaParticipants(params: {
  tournament: Tournament;
  pairs: Pair[];
  organizadorId: string;
}): Promise<RetaParticipantValidation> {
  const { tournament, pairs, organizadorId } = params;

  const input: FinalizeCareerEventInput = {
    kind: "reta",
    organizadorId,
    tournament,
    pairs,
    // Aún no hay partidos antes de iniciar; el validador de reta solo lee
    // `pairs` para esta modalidad (ver collectProspectiveJugadorRefs).
    matches: [],
  };

  // legacyPlayerId -> jugadorId resuelto, para reconstruir validPlayers y
  // para poder mostrar el playerId (no solo el jugadorId interno) en los
  // fallos de identidad que no traen legacyPlayerId en sus `details`.
  const resolvedByLegacyId = new Map<string, string>();
  const legacyIdByJugadorId = new Map<string, string>();

  const preClose = await validateCareerEventPreClose(input, async (ref, org) => {
    const resolved = await resolveJugadorIdForParticipacion({
      organizadorId: org,
      jugadorId: ref.jugadorId,
      nombre: ref.nombre,
      legacyPlayerId: ref.legacyPlayerId,
      legacyLigaJugadorId: ref.legacyLigaJugadorId,
      tipoEvento: input.kind,
    });
    if (resolved && ref.legacyPlayerId) {
      resolvedByLegacyId.set(ref.legacyPlayerId, resolved);
      legacyIdByJugadorId.set(resolved, ref.legacyPlayerId);
    }
    return resolved;
  });

  const invalidPlayers: RetaInvalidPlayer[] = preClose.failures.map((f) => {
    const detailLegacyId =
      typeof f.details?.legacyPlayerId === "string"
        ? f.details.legacyPlayerId
        : undefined;
    const playerId =
      detailLegacyId ??
      (f.jugadorId ? legacyIdByJugadorId.get(f.jugadorId) : undefined) ??
      f.jugadorId ??
      "";
    const displayName =
      typeof f.details?.nombre === "string" && f.details.nombre.trim()
        ? f.details.nombre
        : "Jugador";
    const suggestedAction =
      typeof f.details?.actionSugerida === "string"
        ? f.details.actionSugerida
        : DEFAULT_SUGGESTED_ACTION;

    return {
      playerId,
      displayName,
      reason: f.message,
      suggestedAction,
      code: f.code,
      // `sync_failed` / `missing_parent_event` son fallos técnicos (red, RLS,
      // RPC ausente): el jugador puede tener su identidad perfectamente bien.
      isIdentityProblem:
        f.code !== "sync_failed" && f.code !== "missing_parent_event",
    };
  });

  const invalidPlayerIds = new Set(
    invalidPlayers.map((p) => p.playerId).filter(Boolean)
  );

  const refs = collectProspectiveJugadorRefs(input);
  const validPlayers: RetaPlayerIdentity[] = refs
    .filter(
      (ref) =>
        ref.legacyPlayerId &&
        resolvedByLegacyId.has(ref.legacyPlayerId) &&
        !invalidPlayerIds.has(ref.legacyPlayerId)
    )
    .map((ref) => ({
      playerId: ref.legacyPlayerId as string,
      jugadorId: resolvedByLegacyId.get(ref.legacyPlayerId as string) as string,
      displayName: ref.nombre?.trim() || "Jugador",
    }));

  return {
    ok: preClose.ok,
    validPlayers,
    invalidPlayers,
    onlyTechnicalFailures:
      invalidPlayers.length > 0 &&
      invalidPlayers.every((p) => !p.isIdentityProblem),
  };
}
