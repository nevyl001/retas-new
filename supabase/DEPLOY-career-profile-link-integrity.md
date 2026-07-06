# Deploy seguro — career profile link integrity

Orden estricto en Supabase SQL Editor (staging → prod).

## 1. Pre-check (solo lectura)

```sql
-- ¿Ya existe la función canónica?
SELECT to_regprocedure('public._riviera_profile_link_resolution(uuid)') IS NOT NULL AS has_resolution;
SELECT to_regprocedure('public._riviera_orphan_profile_audit()') IS NOT NULL AS has_audit;
```

Si `has_resolution = false`, continuar con paso 2.

## 2. Desplegar fuente canónica

Ejecutar **completo**:

```
supabase/career-profile-link-integrity.sql
```

Verifica:

```sql
SELECT confidence, COUNT(*)
FROM public._riviera_orphan_profile_audit()
GROUP BY confidence;
```

Daniel N y Sebastian deben aparecer como **REVIEW** (no HIGH).

## 3. Diagnóstico

```
supabase/diagnose-orphan-career-profiles.sql
```

Revisar:
- HIGH pendientes → candidatos a repair batch
- REVIEW pendientes → manual-link-review-cases.sql

## 4. Repair batch (solo HIGH con evidencia fuerte)

```
supabase/repair-orphan-career-profile-links.sql
```

Idempotente. No enlaza REVIEW.

## 5. Casos REVIEW históricos (manual)

```
supabase/manual-link-review-cases.sql
```

1. Ejecutar PREVIEW
2. Confirmar visualmente en app
3. Descomentar INSERT
4. Ejecutar verificación

## 6. Auditoría app (local con .env)

```bash
npm run audit:event-parent-integrity
npm run audit:career-integrity
```

## 6. Deuda histórica — evento padre eliminado

```
1. supabase/diagnose-historical-orphan-parent-participaciones.sql
2. supabase/career-event-host-manual-overrides.sql          (tabla)
3. supabase/seed-career-event-host-manual-overrides.sql     (INSERT manual)
4. Re-ejecutar diagnose → READY_MANUAL_OVERRIDE
5. (futuro) repair solo desde career_event_host_manual_overrides
```

Opción A (host en tabla manual): `career_event_host_manual_overrides`  
Opción B (sin fuente): `integrity_status = orphan_parent_review` (REVIEW_HISTORICO)


Este deploy solo agrega/reemplaza funciones RPC y puede crear filas en `riviera_official_player_profile_link`.

- Funciones: re-ejecutar versión anterior o `DROP FUNCTION` si fuera necesario
- Links creados: borrar filas específicas de `riviera_official_player_profile_link` (no toca participaciones)

```sql
-- Ejemplo rollback de un link erróneo (reemplazar UUID)
-- DELETE FROM riviera_official_player_profile_link
-- WHERE riviera_jugador_id = '...' AND link_source = 'manual_admin';
```

## Qué NO hace este deploy

- No mueve participaciones
- No cambia rating
- No modifica metadata de eventos
- No auto-linkea por cross_club_profile solo
