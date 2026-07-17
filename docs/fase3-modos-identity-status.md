# Fase 3 — Identidad local en Americano / Duelo / Liga / Torneo Express

**Estado:** implementada en código (pool sync + ensure local fail-closed). Sin esquema/RLS/commit/deploy.

## 3A — Inventario (resumen)

| Modo | Ruta crítica | Antes | Después |
|------|--------------|-------|---------|
| Americano | `getPlayers` → `buildLegacyPlayersFromRivieraRegistry` → `ensureLegacy…` | Name match + overwrite legacy | `ensureLocalPlayersLegacy…` fail-closed, solo local |
| TE | mismo pool | igual | igual |
| Liga | `ensureLigaJugadorForRivieraJugador` | Match nombre/email + merge homónimos | Solo `legacy_liga_jugador_id`; create si null |
| Duelo | join por Riviera ID + slots SQL | Sin `players` create en UI | Sin cambio de join; cierre aún con fallback nombre (pendiente) |
| Reta | Bloque 1 `linkLegacyOnSelectForReta` | OK | Reutiliza `localLegacyIdentity` |

## Utilidad compartida

`src/lib/rivieraJugadores/localLegacyIdentity.ts`

- `ensureLocalPlayersLegacyForRivieraJugador`
- `assertResolvedLocalProfileSafe`
- `LegacyLinkUnverifiableError` + códigos

## Carrera global (3E) — estado

| Modo | Participaciones | Rating | Ledger | Pendiente |
|------|-----------------|--------|--------|-----------|
| Americano | `resolveJugadorIdForParticipacion` → local | `resolveJugadorIdForRating` → source | ROMC best-effort | Fallback `ilike nombre` en `getOrCreateJugadorId` |
| Duelo | idem | idem | idem | idem + preClose soft |
| Liga | via `legacy_liga` | rating → source | idem | preClose incompleto jornada/podio |
| TE | pairs → legacy players | rating → source | fire-and-forget close | preClose sin refs TE |

**Caso 9 (cross-club):** operación local = proyección B; rating/carrera canónica = source A vía `resolveJugadorIdForRating`. No se cambió el modelo de carrera (requiere Fase 4+).

## Pendiente Fases 4–7 / residual

| Fase | Qué |
|------|-----|
| 4 | `players.riviera_jugador_id` / esquema |
| 5 | RPC atómica (doble-clic) |
| 6 | Constraints |
| 7 | RLS |
| Residual cierre | Quitar `ilike nombre` / `resolveLocalJugadorIdByGrantedName` de `jugadorIdResolver` |
| Residual UI TE | `resolvePlayerInPool` / `dedupePlayersForSelect` por nombre (display) |
| Residual Liga | `dedupeLigaJugadoresByName` / `consolidateDuplicateLigaJugadores` (display/admin) |

## Atomicidad

Concurrencia real (dos ensures con legacy null) → Fase 5.
