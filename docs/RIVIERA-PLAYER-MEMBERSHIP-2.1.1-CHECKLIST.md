# RIVIERA 2.1.1 — Player Membership Engine — Fase 1 — Checklist

**Script:** `supabase/riviera-player-membership-2.1.1-schema.sql`  
**Validate:** `supabase/riviera-player-membership-2.1.1-validate.sql`  
**Prerrequisito:** `organizer-player-access.sql`  
**Alcance:** Solo evolución schema — sin RPCs, sin TS, sin UI

---

## Qué hace 2.1.1

Evoluciona `organizer_player_access` → **Player Membership** (misma tabla):

| Columna | Tipo | Propósito |
|---------|------|-----------|
| `joined_at` | timestamptz NOT NULL | Inicio membresía |
| `left_at` | timestamptz NULL | Salida del organizador |
| `joined_via` | text NULL | `admin_legacy` \| `riviera_id` \| `registration` \| `qr` |

**Constraints nuevos:**

- `opa_joined_via_chk` — valores permitidos
- `opa_active_left_at_chk` — activa ⇒ `left_at IS NULL`
- `opa_left_after_joined_chk` — `left_at >= joined_at`

**Índice:** `opa_grantee_jugador_active_idx` (parcial `is_active = true`)

**Sin cambios:** FK, RLS, UNIQUE legacy `(grantee_organizer_id, jugador_id)`, RPCs Fase 1.

---

## Backfill legacy

| Condición | Valor |
|-----------|-------|
| `joined_at` NULL | → `created_at` |
| `joined_via` NULL + `access_type=owner` | → `registration` |
| `joined_via` NULL + otro | → `admin_legacy` |
| `is_active=false` + `left_at` NULL | → `updated_at` |

---

## Semántica congelada

| Columna legacy | Significado producto |
|----------------|---------------------|
| `owner_organizador_id` | **Organizador de Registro** (no propiedad) |
| `grantee_organizer_id` | Organizador de la membresía |
| `jugador_id` | Perfil de registro / referencia Carrera |
| `is_active` | Membresía activa |

---

## Pre-vuelo

- [ ] `organizer_player_access` existe
- [ ] Backup staging/prod
- [ ] ROMC / ensure desplegados (opcional para V8–V9)

---

## Ejecución

1. SQL Editor → `riviera-player-membership-2.1.1-schema.sql`
2. NOTICE: `Sprint 2.1.1 OK`
3. `riviera-player-membership-2.1.1-validate.sql`

---

## Pruebas de integridad

### P1 — Columnas (V1)
- [ ] `joined_at`, `left_at`, `joined_via` presentes
- [ ] `joined_at` NOT NULL

### P2 — Constraints (V2)
- [ ] 5 constraints listados (3 nuevos + 2 legacy)

### P3 — Una membresía activa por org+jugador (V4)
- [ ] **0 filas** con duplicados activos

### P4 — Activas sin left_at (V5)
- [ ] `active_with_left_at = 0`

### P5 — Legacy UNIQUE (V7)
- [ ] PASS

### P6 — ROMC Riviera ID único (V9, si identity existe)
- [ ] **0 duplicados** `riviera_id`

### P7 — Compatibilidad Fase 1
- [ ] `admin_grant_organizer_player_access` sigue funcionando (smoke manual)
- [ ] `ensure_granted_player_local` sin error en grant activo existente
- [ ] RLS grantee SELECT sin cambios

### P8 — Idempotencia
- [ ] Re-ejecutar schema.sql sin error

### P9 — Rollback (solo staging)
- [ ] Ejecutar bloque ROLLBACK en entorno de prueba
- [ ] Columnas eliminadas; tabla operativa con Fase 1

---

## Fuera de alcance (Fase 2.1.2+)

- RPC `add_organizer_membership_by_riviera_id`
- RPC `leave_organizer_membership`
- Búsqueda / QR / UI
- TypeScript services
- Actualizar `admin_revoke` para setear `left_at` automáticamente

---

## Criterios de aceptación

- [ ] Schema 2.1.1 en staging
- [ ] P1–P8 PASS
- [ ] Prod sin cambio de comportamiento (solo columnas + backfill)
- [ ] Modelo listo para Fase 2.1.2
