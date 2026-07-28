# Auditoría post-limpieza de esquema ajeno — 2026-07-28

Cierre de fase. Documenta el resultado de la auditoría completa realizada
después de limpiar de la base de datos de producción el bloque de tablas /
funciones / vistas ajenas (app de gimnasio "Parabellum Cross" ejecutada por
error contra este proyecto de Supabase). La limpieza en sí está documentada
en `supabase/backup-foreign-block-pre-cleanup-20260728.sql`,
`cleanup-foreign-block-20260728.sql`, `cleanup-profiles-boxes-20260728.sql`
y sus respectivos `rollback-*`/`verify-*`.

## Commit

`d9d425d195cc897e3f012ab9e70b8fbbcdf1fc0e`

## Cambios aplicados (código)

| Archivo | Cambio |
|---|---|
| `supabase/functions/share-reta-og/index.ts` | Nombres de tabla inexistentes corregidos: `torneos_express`→`torneo_express`, `eventos`→`torneo_express_evento`. Función no desplegada al momento del fix (confirmado vía `supabase functions list`); impacto en producción nulo. |
| `src/lib/rivieraJugadores/jugadorIdResolver.ts` | Las 2 escrituras de enlace legacy (`legacy_player_id`, `legacy_liga_jugador_id`) ahora capturan y loguean `error` en vez de descartarlo silenciosamente. |
| `src/lib/rivieraJugadores/playerPoolSync.ts` | El `update` a `liga_jugadores` ahora revisa `error` explícitamente (el `try/catch` que lo envolvía no podía atraparlo — supabase-js no lanza en errores de query). |

## Migración ejecutada en producción

`supabase/fix-search-path-functions-20260728.sql` — agrega
`SET search_path TO 'public'` a las 14 funciones flageadas por Security
Advisor como `function_search_path_mutable`. Ninguna es `SECURITY DEFINER`;
todas ya calificaban sus tablas con `public.`, por lo que el cambio es
funcionalmente neutro (cero cambio de comportamiento). Ejecutada en una sola
transacción con verificación interna, sin errores.

- Backup de las definiciones originales: `supabase/backup-search-path-functions-20260728.sql`
- Rollback (restaura sin el `SET`): `supabase/rollback-search-path-functions-20260728.sql`
- Verificación: `supabase/verify-search-path-functions-20260728.sql`
- Resultado: Security Advisor bajó de **267 → 253** alertas (exactamente esas 14 desaparecieron, cero alertas nuevas).

## Resultado de CI

`build-and-test` ✅ verde, 1m36s (checkout, setup, install, tests, build).
No hizo falta corrección alguna — pasó al primer intento.

Verificación local antes del push: `tsc --noEmit` limpio, **921/921 tests**
pasan (158 suites, mismo baseline previo), build limpio, conteos de fila
idénticos en las 15 tablas/vistas críticas antes y después del cambio.

## Pendientes — deuda técnica documentada, sin tocar (B1-B7)

| # | Hallazgo | Nota |
|---|---|---|
| B1 | `src/lib/rivieraJugadores/playerSharingRequests.ts` llama a 2 RPC inexistentes (`create_player_sharing_request`, `respond_player_sharing_request`); 0 importadores reales en `src/` | Existe `docs/RIVIERA-PLAYER-SHARING-REQUESTS-2.1.0-CHECKLIST.md` — revisar ese checklist antes de decidir si se completa la migración o se retira el módulo |
| B2 | Políticas RLS redundantes en `admin_users` (2) y `users` (3) — mismas condiciones, no inseguras, solo duplicadas |
| B3 | Advisor performance: 139 `multiple_permissive_policies` + 80 `auth_rls_initplan`, distribuidos en ~20 tablas |
| B4 | 13 tablas de backup manuales en `public` (fechadas 2026-07-11 a 2026-07-14), RLS sin políticas (deny-by-default, sin riesgo actual) |
| B5 | 9 índices sin uso desde que hay estadísticas de la base |
| B6 | Funciones duplicadas byte a byte: `_riviera_normalize_player_name` / `_riviera_normalize_evento_nombre` |
| B7 | 137 scripts `.sql` sueltos en `supabase/`, sin carpeta `migrations/` ni tracking del CLI — vigencia no auditada |

## Ajustes de plataforma pendientes (fuera de alcance de esta fase — no son fixes de SQL)

- Actualización de la versión de PostgreSQL (Advisor: `vulnerable_postgres_version`).
- Activar `leaked password protection` en la configuración de Auth (Advisor: `auth_leaked_password_protection`).
- Revisión de los 3 buckets públicos con listado habilitado: `avatars`, `evento-flyers`, `jugadores-avatars` (Advisor: `public_bucket_allows_listing`) — confirmar si es intencional.

## Próxima fase (separada, priorizada)

1. `playerSharingRequests.ts` y las 2 RPC inexistentes.
2. Revisión de las políticas RLS redundantes.
3. Análisis de las alertas de performance del Advisor.
4. Decisión sobre tablas de backup.
5. Revisión de configuración de Auth y versión de PostgreSQL.
