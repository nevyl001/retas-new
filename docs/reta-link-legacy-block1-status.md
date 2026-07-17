# Bloque 1 — linkLegacy fail-closed (estado)

**Estado:** implementado en código (pendiente de revisión humana).  
**Alcance:** solo `linkLegacyOnSelectForReta` + tests. Sin esquema, sin RLS, sin datos, sin commit/deploy.

## Hecho (Bloque 1)

1. `resolveJugadorIdForOrganizer` siempre antes de tocar legacy.
2. `fetchPlayerById`: error → throw; `null` con `legacy_player_id` set → fail-closed (no “huérfano”).
3. Insert solo si el perfil **local** tiene `legacy_player_id` null.
4. `linkLegacyPlayerId` solo sobre el perfil local; rechazo si `organizador_id` ≠ anfitrión.
5. Sin matching por nombre/`findLegacyPlayerForRiviera` en este flujo.
6. Caso 10: si el origen (requested ≠ local) tiene legacy owned por el grantee → fail-closed.

Tests obligatorios: Caso 6, 9, 10, 11 en `linkLegacyOnSelectForReta.test.ts`.

## Pendiente — NO implementar en Bloque 1

| Fase | Qué | Por qué espera |
|------|-----|----------------|
| **3** | Americano / Duelo / Liga / TE (otros callers de legacy) | Mismo patrón fail-closed, scope aparte |
| **4** | Migrar esquema `players` / `players.riviera_jugador_id` | Cambio de modelo; requiere migración |
| **5** | RPC transaccional atómica (`ensure_local_legacy_player…`) | Doble-clic / carrera residual documentada en `reta-link-legacy-concurrency-residual.md` |
| **6** | Constraints / invariantes a nivel BD | Tras modelo estable |
| **7** | Cambios RLS endurecidos | Tras auditoría + repair; no en hotfix cliente |

## Casos de carrera global (fuera de Bloque 1)

| Caso | Qué valida | Fase |
|------|------------|------|
| **16** | Una identidad Riviera / una carrera / N participaciones multi-club | Pipeline carrera (no este hotfix) |
| **17** | Doble cierre idempotente (participación, rating, ledger) | Idempotencia de cierre de evento |

## Riesgo residual aceptado (hasta Fase 5)

Dos clics concurrentes con `legacy_player_id` null pueden crear dos `players` locales. Mitigación solo con RPC atómica (Fase 5).
