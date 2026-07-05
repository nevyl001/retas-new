# Sprint 2.0.2A — Integración Riviera ID Engine — Checklist

**Script SQL:** `supabase/riviera-career-identity-2.0.2a-integration.sql`  
**Servicio TS:** `src/lib/rivieraJugadores/careerIdentity.ts`  
**Prerrequisitos:** Sprint 2.0.1 + 2.0.2

---

## Mapa de creación de identidades (auditoría repo)

| # | Ubicación | Antes | Después |
|---|-----------|-------|---------|
| 1 | `supabase/riviera-official-multi-club-romc1.sql` → `admin_create_official_player_identity_from_jugador` | INSERT directo identity + link + totals | **Reemplazado** por 2.0.2A → delega `ensure_riviera_identity` |
| 2 | `supabase/riviera-career-identity-2.0.2-engine.sql` → `ensure_riviera_identity` | Motor canónico | **Sin cambio** — único writer de identidad nueva |
| 3 | `src/lib/rivieraJugadores/rivieraJugadoresService.ts` → `createRivieraJugador` | Sin identidad | Hook opt-in → `ensureRivieraIdentity` si `REACT_APP_RIVIERA_CAREER_IDENTITY=true` |
| 4 | `src/**` resto | — | **Sin creación de identidad** (confirmado grep) |
| 5 | `admin_link_official_player_profile` | Solo link a key existente | **Sin cambio** — no crea identidad |
| 6 | `riviera-official-multi-club-romc2.sql` ledger | `_resolve_official_player_key` read-only | **Sin cambio** |
| 7 | `organizer-player-access.sql` | Grants | **Sin cambio** — ensure grant-aware en path C/B |
| 8 | `delete-riviera-jugador.sql` | DELETE identity edge cases | **Sin cambio** |

---

## Punto de entrada único

| Capa | Entrada |
|------|---------|
| **App TypeScript** | `ensureRivieraIdentity(rivieraJugadorId)` |
| **SQL / Admin** | `ensure_riviera_identity(uuid)` |
| **Admin legacy** | `admin_create_official_player_identity_from_jugador` → wrapper de ensure |

---

## Despliegue

1. Ejecutar `riviera-career-identity-2.0.2a-integration.sql` en staging
2. NOTICE: `Sprint 2.0.2A OK`
3. Tests SQL staging (abajo)
4. `npm test -- careerIdentity`
5. Smoke app con flag **OFF** (default)

---

## Pruebas SQL (staging)

### I1 — admin_create delega en ensure

```sql
SELECT public.admin_create_official_player_identity_from_jugador(
  '<jugador_prueba>'::uuid
);
```

Esperado: JSON con `riviera_id`, `ensure`, `identity_created`.

### I2 — Idempotencia admin_create

Ejecutar I1 dos veces. Segunda: `identity_created: false`, mismo `riviera_id`.

### I3 — ensure directo

```sql
SELECT public.ensure_riviera_identity('<jugador_prueba>'::uuid);
```

### I4 — Cedido mismo official_player_key

ensure origen + ensure local grant → mismo `official_player_key` y `riviera_id`.

---

## Pruebas app

- [ ] `npm test -- careerIdentity` green
- [ ] Flag OFF: crear jugador → sin llamada RPC (network tab)
- [ ] Flag ON staging: crear jugador → ensure en background
- [ ] Retas / rating / torneos sin regresión

---

## Feature flag

```bash
# Opt-in — default OFF en prod
REACT_APP_RIVIERA_CAREER_IDENTITY=true
```

---

## Rollback

1. SQL: restaurar `admin_create` desde ROMC-1 (bloque comentado en 2.0.2a-integration.sql)
2. App: revert hook en `rivieraJugadoresService.ts` + flag OFF

---

## Criterios de aceptación

- [ ] Ningún INSERT directo a identity fuera de ensure (post 2.0.2A deploy)
- [ ] admin_create idempotente
- [ ] TS tests green
- [ ] Multiclub: mismo riviera_id vía grant (I4)
- [ ] App prod sin flag = comportamiento idéntico
