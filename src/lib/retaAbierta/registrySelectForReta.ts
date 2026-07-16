/**
 * Resolución de selección desde el registro Riviera hacia el pool de retas.
 * Detección por riviera_jugador_id / legacy_player_id — nunca por nombre.
 * No crea players ni legacy links.
 */

export type RegistrySelectHint = {
  /** Mensaje para el admin (sin “créalo” si ya está en el registro). */
  message: string;
  /** Conviene invalidar caché y refetch del pool. */
  suggestRefresh: boolean;
};

/**
 * El buscador ya filtró por organizador: si llega aquí, el jugador está en el
 * registro del club (nativo o concedido). El pool de armado es otra capa.
 */
export function hintWhenRegistryPlayerMissingFromRetaPool(input: {
  /** UUID riviera_jugadores (identidad de detección). */
  rivieraJugadorId: string | null | undefined;
  /** players.id enlazado, si existe. */
  legacyPlayerId: string | null | undefined;
  /** true si el row es concedido / membership (badge Concedido). */
  isGranted: boolean;
}): RegistrySelectHint {
  const hasRiviera = Boolean(input.rivieraJugadorId?.trim());
  const hasLegacy = Boolean(input.legacyPlayerId?.trim());

  if (!hasRiviera) {
    return {
      message:
        "No pudimos identificar al jugador en el registro. Usa el Riviera ID en «Registro de jugadores».",
      suggestRefresh: false,
    };
  }

  if (hasLegacy) {
    return {
      message:
        "Este jugador ya está en el registro del club, pero el pool de retas está desactualizado. Pulsa Actualizar e inténtalo de nuevo.",
      suggestRefresh: true,
    };
  }

  if (input.isGranted) {
    return {
      message:
        "Este jugador ya pertenece a tu club (concedido), pero aún no tiene vínculo legacy para armar retas. No hace falta crearlo de nuevo: completa el vínculo desde «Registro de jugadores» o pulsa Actualizar.",
      suggestRefresh: true,
    };
  }

  return {
    message:
      "Este jugador está en el registro del club, pero aún no está disponible en el pool de retas. Pulsa Actualizar; si sigue igual, revisa su ficha en «Registro de jugadores».",
    suggestRefresh: true,
  };
}

/** Busca en el pool por legacy_player_id (id fuerte), no por nombre. */
export function findPoolPlayerByLegacyId<T extends { id: string }>(
  pool: readonly T[],
  legacyPlayerId: string | null | undefined
): T | undefined {
  const id = legacyPlayerId?.trim();
  if (!id) return undefined;
  return pool.find((p) => p.id === id);
}
