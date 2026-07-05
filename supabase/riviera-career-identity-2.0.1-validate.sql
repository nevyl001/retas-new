-- Sprint 2.0.1 — Validación read-only (no modifica datos)
-- Ejecutar después de riviera-career-identity-2.0.1-ddl.sql

-- V1: Tabla existe
SELECT
  CASE
    WHEN to_regclass('public.riviera_official_player_identity') IS NOT NULL
    THEN 'PASS: tabla existe'
    ELSE 'FAIL: tabla no existe — ejecutar ROMC-1 primero'
  END AS v1_tabla;

-- V2: Columnas Sprint 2.0.1
SELECT
  column_name,
  is_nullable,
  CASE
    WHEN column_name IN (
      'riviera_id', 'riviera_id_serial', 'debut_organizer_id', 'debut_at'
    ) THEN 'expected'
    ELSE 'other'
  END AS sprint_2_0_1_column
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'riviera_official_player_identity'
  AND column_name IN (
    'riviera_id',
    'riviera_id_serial',
    'debut_organizer_id',
    'debut_at',
    'official_player_key',
    'canonical_riviera_jugador_id'
  )
ORDER BY column_name;

-- V3: Conteos (esperado con_riviera_id=0 inmediatamente post-2.0.1)
SELECT
  count(*) AS total_identities,
  count(riviera_id) AS with_riviera_id,
  count(debut_organizer_id) AS with_debut,
  CASE
    WHEN count(riviera_id) = 0 THEN 'PASS: sin Riviera ID asignados aún'
    ELSE 'INFO: hay Riviera IDs — normal solo después de Sprint 2.0.4+ / backfill'
  END AS v3_riviera_id_status
FROM public.riviera_official_player_identity;

-- V4: Constraints Sprint 2.0.1
SELECT conname AS constraint_name
FROM pg_constraint
WHERE conrelid = 'public.riviera_official_player_identity'::regclass
  AND conname LIKE 'ropi_%'
ORDER BY conname;

-- V5: Índices Sprint 2.0.1
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'riviera_official_player_identity'
  AND indexname LIKE 'ropi_%'
ORDER BY indexname;
