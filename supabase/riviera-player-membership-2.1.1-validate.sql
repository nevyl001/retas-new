-- RIVIERA 2.1.1 — Validación read-only Player Membership schema
-- Ejecutar después de riviera-player-membership-2.1.1-schema.sql

-- V1: Columnas membership
SELECT
  column_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'organizer_player_access'
  AND column_name IN ('joined_at', 'left_at', 'joined_via')
ORDER BY column_name;

-- V2: Constraints 2.1.1
SELECT conname AS constraint_name
FROM pg_constraint
WHERE conrelid = 'public.organizer_player_access'::regclass
  AND conname IN (
    'opa_joined_via_chk',
    'opa_active_left_at_chk',
    'opa_left_after_joined_chk',
    'organizer_player_access_unique_grant',
    'organizer_player_access_not_self'
  )
ORDER BY conname;

-- V3: Índice membresía activa
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'organizer_player_access'
  AND indexname = 'opa_grantee_jugador_active_idx';

-- V4: Integridad — una membresía activa por organizador + jugador
SELECT
  grantee_organizer_id,
  jugador_id,
  count(*) AS active_count
FROM public.organizer_player_access
WHERE is_active = true
GROUP BY grantee_organizer_id, jugador_id
HAVING count(*) > 1;
-- Esperado: 0 filas

-- V5: Integridad — activas sin left_at
SELECT count(*) AS active_with_left_at
FROM public.organizer_player_access
WHERE is_active = true AND left_at IS NOT NULL;
-- Esperado: 0

-- V6: joined_at poblado
SELECT
  count(*) AS total,
  count(joined_at) AS with_joined_at,
  count(joined_via) AS with_joined_via
FROM public.organizer_player_access;

-- V7: Legacy UNIQUE grant sigue presente
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'organizer_player_access_unique_grant'
        AND conrelid = 'public.organizer_player_access'::regclass
    ) THEN 'PASS: UNIQUE (grantee, jugador_id) legacy'
    ELSE 'FAIL: falta constraint legacy'
  END AS v7_unique_legacy;

-- V8: Carrera — un Riviera ID por official_player_key (ROMC, informativo)
SELECT
  count(*) AS identities,
  count(DISTINCT riviera_id) AS distinct_riviera_ids,
  count(riviera_id) AS with_riviera_id
FROM public.riviera_official_player_identity
WHERE to_regclass('public.riviera_official_player_identity') IS NOT NULL;

-- V9: Duplicados riviera_id (debe ser 0)
SELECT riviera_id, count(*) AS cnt
FROM public.riviera_official_player_identity
WHERE riviera_id IS NOT NULL
  AND to_regclass('public.riviera_official_player_identity') IS NOT NULL
GROUP BY riviera_id
HAVING count(*) > 1;
-- Esperado: 0 filas

-- V10: Comentario tabla refleja Player Membership
SELECT
  col_description(
    'public.organizer_player_access'::regclass,
    0
  ) AS table_comment;
