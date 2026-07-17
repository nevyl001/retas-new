# Riesgo residual: concurrencia en linkLegacyOnSelectForReta

Ver también: [`reta-link-legacy-block1-status.md`](./reta-link-legacy-block1-status.md) (Bloque 1 hecho; fases 3–7 pendientes).

## Situación actual (post Bloque 1 — cliente)

El flujo ahora:

1. `resolveJugadorIdForOrganizer` → perfil local operativo
2. Si requested ≠ local y el legacy del origen es owned por el grantee → fail-closed (Caso 10)
3. Si el perfil operativo no pertenece al org anfitrión → fail-closed
4. Si `legacy_player_id` set → fail-closed si no verificable / otro org; reutilizar si visible y del org
5. Si null → insert `players` del org + `linkLegacyPlayerId(localId, …)` únicamente

## Carrera residual (Fase 5 — pendiente)

Dos clics / pestañas pueden observar ambos `legacy_player_id = null` y crear dos `players`
antes de que el primer `link` persista. No hay dedupe por nombre/email (prohibido).

Mitigación cliente insuficiente para atomicidad real. **No implementar RPC aquí.**

## RPC futura sugerida (Fase 5 — NO implementar en Bloque 1)

```text
ensure_local_legacy_player_for_riviera_jugador(
  p_local_riviera_jugador_id uuid,
  p_organizador_id uuid
) returns players
```

Contrato:

1. Validar sesión = organizador y que el perfil `riviera_jugadores` pertenece a ese org.
2. `SELECT … FOR UPDATE` sobre la fila Riviera local.
3. Si `legacy_player_id` set y players existe y `user_id = org` → devolver.
4. Si set pero no verificable → error no destructivo (no reparar a ciegas).
5. Si null → insert un `players` (`user_id = org`, email sintético por local id) + update link
   en la misma transacción.
6. Nunca tocar perfil origen (`organizer_player_access.jugador_id` distinto del local).
7. Nunca identidad por nombre/email.
