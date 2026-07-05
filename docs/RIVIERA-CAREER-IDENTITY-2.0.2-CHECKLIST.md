# Sprint 2.0.2 — Riviera ID Engine — Checklist

**Estado:** Listo para ejecutar en Supabase (staging primero)  
**Script:** `supabase/riviera-career-identity-2.0.2-engine.sql`  
**Prerrequisitos:** ROMC-1 + Sprint 2.0.1  
**Alcance:** Secuencia + helpers + RPC `ensure_riviera_identity` — sin hooks app

---

## Qué hace Sprint 2.0.2

| Componente | Descripción |
|------------|-------------|
| `riviera_id_serial_seq` | Secuencia global PostgreSQL |
| `_format_riviera_id` | `RIV-00000001` (8 dígitos) |
| `_allocate_riviera_id_serial` | nextval atómico |
| `_assign_riviera_id_to_identity` | Asigna par riviera_id + serial si falta |
| `_ensure_debut_riviera_if_missing` | Debut Riviera (solo si debut_at IS NULL) |
| `ensure_riviera_identity(uuid)` | RPC idempotente, grant-aware, con advisory lock |

**La app React no invoca esta RPC.** Comportamiento operativo idéntico hasta sprint de hooks.

---

## Orden de ejecución

1. Prerrequisitos ROMC + 2.0.1
2. **`riviera-career-identity-2.0.2-engine.sql`**
3. `riviera-career-identity-2.0.2-validate.sql`
4. Escenarios staging: `riviera-career-identity-2.0.2-test-scenarios.sql`

---

## Pre-vuelo

- [ ] Sprint 2.0.1 ejecutado en staging
- [ ] `riviera_official_player_identity` con columnas `riviera_id`, `debut_*`
- [ ] Backup/snapshot disponible (prod)

---

## Ejecución

1. SQL Editor → pegar `riviera-career-identity-2.0.2-engine.sql`
2. Verificar NOTICE: `Sprint 2.0.2 OK — secuencia=..., formato_ejemplo=RIV-00001852`
3. Ejecutar validate.sql — V1–V5 PASS

---

## Pruebas

### Automáticas (validate.sql)

- [ ] V1 secuencia existe
- [ ] V2 cinco funciones desplegadas
- [ ] V3 GRANT authenticated / sin anon
- [ ] V4 formato `RIV-00000001`, `RIV-00001852`, `RIV-00015234`
- [ ] V5 secuencia >= max serial asignado

### Staging (test-scenarios.sql)

- [ ] T1 idempotencia (doble ensure → mismo ID)
- [ ] T2 formato en fila identity
- [ ] T3 debut inmutable
- [ ] T4 cedido → mismo riviera_id que origen
- [ ] T5 ROMC legacy → riviera_id_assigned sin identity_created
- [ ] T6 permiso cross-tenant falla
- [ ] T7 smoke app sin regresión
- [ ] T8 DO block formato PASS

### Smoke app (obligatorio)

- [ ] Login organizador
- [ ] Crear jugador (sin ensure automático)
- [ ] Reta / torneo / rating / ranking — sin errores

---

## Contrato RPC `ensure_riviera_identity`

**Auth:** organizador dueño del `riviera_jugador_id` o Admin Maestro.

**Retorno JSON:**

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `official_player_key` | uuid | Llave técnica interna |
| `riviera_id` | text | `RIV-00000001` |
| `riviera_id_serial` | bigint | Componente numérico |
| `riviera_jugador_id` | uuid | Perfil solicitado |
| `registration_jugador_id` | uuid | Perfil de registro (canonical) |
| `debut_organizer_id` | uuid | Organizador de Registro |
| `debut_at` | timestamptz | Fecha de Registro |
| `link_source` | text | owner / granted_local |
| `identity_created` | boolean | Nueva fila identity |
| `link_created` | boolean | Nuevo profile_link |
| `riviera_id_assigned` | boolean | Serial asignado en esta llamada |
| `debut_assigned` | boolean | Debut escrito en esta llamada |

---

## Rollback

Ejecutar bloque ROLLBACK al final de `riviera-career-identity-2.0.2-engine.sql`.

**Efecto:** elimina RPC, helpers y secuencia.  
**No elimina:** Riviera IDs ya asignados en `riviera_official_player_identity` (datos válidos).

Para revertir datos de prueba en staging, borrar filas identity/link creadas manualmente en pruebas.

---

## Fuera de alcance

- Hook en `createRivieraJugador` → sprint posterior
- Backfill batch → sprint posterior
- resolve/get RPC → sprint 2.0.3
- Frontend, QR, perfil público

---

## Criterios de aceptación

- [ ] Engine SQL ejecutado sin error
- [ ] Validate V1–V5 PASS
- [ ] T1, T3, T8 PASS en staging
- [ ] Smoke app OK
- [ ] App prod sin deploy requerido
