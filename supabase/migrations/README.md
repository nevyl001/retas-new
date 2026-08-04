# Migraciones — Riviera App

## Estado actual (2026-08-03, BLK-05)

Este repo **no tiene** (todavía) un historial de migraciones numeradas y
reproducibles para el esquema completo. El historial real vive como ~160
archivos `.sql` sueltos en `supabase/` (raíz) y `supabase/sql/`, con
convención de nombre pero sin orden canónico explícito:

- `*-fase1-*.sql`, `patch-*.sql`, `hotfix-*.sql`, `fix-*.sql` — cambios reales aplicados (o a aplicar) contra producción.
- `verify-*.sql` — verificación de solo lectura tras aplicar un fix.
- `rollback-*.sql` — reversión de un fix, si hiciera falta.
- `audit-*.sql`, `diagnose-*.sql` — solo lectura, para investigar un problema puntual.
- `backup-*.sql` — snapshot de datos/policies antes de una limpieza destructiva.
- `cleanup-*.sql`, `delete-*.sql` — limpieza real, normalmente de un caso puntual ya diagnosticado.

**Esta carpeta (`supabase/migrations/`) es nueva** (BLK-05/BLK-07) y contiene
únicamente los cambios de la auditoría de preproducción 2026-08-03 en
adelante. No es (todavía) un reemplazo completo del historial de arriba.

## Por qué no se reescribieron los ~160 archivos en migraciones numeradas

Hacerlo bien requiere poder ejecutar y comparar contra una base de datos real
en cada paso — sin eso, el riesgo de introducir un error de orden/dependencia
en una reescritura a ciegas es más alto que el problema que se busca resolver
(alcance explícitamente fuera de Fase 0; ver `CLAUDE.md`/reglas de la
auditoría: "no ejecutes SQL inseguro", "toda validación con datos reales
dentro de una transacción con ROLLBACK"). Queda como tarea de una fase
posterior, con acceso a un proyecto Supabase de staging real.

## Recomendación para construir un ambiente nuevo HOY

La forma más segura de levantar un ambiente nuevo **no** es re-ejecutar los
~160 archivos sueltos en orden — es:

1. Capturar el esquema real vigente en producción:
   `supabase db dump --linked --schema public > schema_actual.sql`
2. Aplicar ese dump a un proyecto nuevo.
3. Aplicar, en orden, únicamente los archivos de `supabase/migrations/`
   (esta carpeta) que sean posteriores a la fecha del dump.

## Si de verdad necesitas replayar desde los archivos sueltos

Los siguientes 3 archivos en la raíz de `supabase/` **contienen policies o
grants ya superados** y llevan un banner `⚠️ HISTÓRICO — NO EJECUTAR SOLO`
explicando exactamente qué fix debe ir inmediatamente después. No se movieron
de su ubicación original porque también contienen DDL de bootstrap (CREATE
TABLE / ADD COLUMN) todavía necesario para construir desde cero:

| Archivo bootstrap (aún en `supabase/`) | Debe ir seguido, en la misma ventana, de |
|---|---|
| `rls-enable-public-schema.sql` | `rls-multiclub-pr1-public-read-helpers.sql` → `fix-rls-open-policies-liga-torneo-express-20260729.sql` → `rls-fase1-players-aislamiento.sql` |
| `duelos-2v2.sql` | `fix-rls-open-policies-liga-torneo-express-20260729.sql` |
| `rating-sistema.sql` | `rls-fase1-rating-rpc-hardening.sql` → `fix-rank001-rating-ledger-reconciliation-20260729.sql` |

Los siguientes 4 archivos se movieron a `supabase/_archive/unsafe-historical/`
porque no aportan ningún DDL de bootstrap propio (solo duplicaban, respaldaban
o revertían deliberadamente políticas ya superadas) — **nunca deben
ejecutarse** salvo una decisión operativa real y documentada de rollback:

- `backup-rls-open-policies-liga-torneo-express-20260729.sql` (snapshot, sin uso)
- `verify-and-enable-torneo-express-anon-select.sql` (duplicaba SEC-001)
- `rollback-rls-open-policies-liga-torneo-express-20260729.sql` (reabre SEC-001 a propósito, uso de emergencia únicamente)
- `rollback-profiles-boxes-cleanup-20260728.sql` (restaura esquema de una app ajena ya limpiada, sin relación con el modelo multi-tenant de Riviera)

## Verificación automática

`npm run lint:sql` (`scripts/scan-unsafe-sql.mjs`) escanea todo `supabase/**/*.sql`
**excepto** `supabase/_archive/**` en busca de `USING (true)`, `WITH CHECK (true)`,
`OR true` como cláusula de policy, `GRANT ... TO anon` sobre operaciones
sensibles, y `SECURITY DEFINER` sin `SET search_path`. Los 3 archivos
bootstrap de la tabla de arriba están en la lista de excepciones explícita de
`scripts/unsafe-sql-allowlist.json` (con la razón documentada ahí mismo), no
ignorados por carpeta.

## Migraciones de esta carpeta

| Archivo | Qué hace |
|---|---|
| `0001_te_select_master_admin.sql` | BLK-07: policy SELECT para Admin Maestro en `torneo_express` (faltaba, sus tablas hermanas ya la tenían) |
| `0001_verify_te_select_master_admin.sql` | Verificación manual de la migración anterior (solo lectura + ROLLBACK, requiere IDs reales de staging) |
| `0002_update_liga_partido_score_parejas_fijas.sql` | BLK-03: guardado atómico de marcador en Liga de parejas fijas (lock + idempotencia + conflicto explícito) |
| `0003_apply_torneo_express_grupo_resultado.sql` | BLK-06: guardado atómico de resultado de grupo + transición de fase en Torneo Express |
| `0004_apply_americano_live_match_score.sql` | BLK-02: guardado atómico de marcador de un partido del Americano en vivo |
| `0005_participacion_con_ledger.sql` | BLK-04: registro/actualización de participación + ledger oficial en una sola transacción |
| `0006_edge_rate_limit.sql` | Fase B: tabla y función de rate limiting persistente para Edge Functions |
| `0007_apply_americano_new_round.sql` | FC-01 (Fase C1): empuja la estructura de una ronda nueva del Americano al servidor (idempotente por key), cierra el hueco que dejaba `rounds` vacío tras BLK-02 |
| `0008_reverse_ledger_on_participacion_delete.sql` | FC-02 (Fase C1): revierte el ledger oficial al borrar una participación individual, reutilizando `_reverse_ledger_for_participacion_safe()` |
| `0009_apply_reta_match_update.sql` | FC-04+FC-05 (Fase C1): RPC único para toda actualización de un partido de Reta (cancha/ronda/resultado), bloqueo tras cierre y scaffolding de corrección administrativa auditada (`reta_match_admin_corrections`) |
| `0010_dynamic_team_lineup_blocks.sql` | Equipos con alineación dinámica (opt-in, Fase 2): tabla `reta_dynamic_blocks` (candado `UNIQUE (tournament_id, block_number)`) + RPCs `begin_/commit_/retry_dynamic_team_block` para generar cada bloque de rondas de forma idempotente (lock de fila + conflicto explícito, mismo patrón que 0009) |
