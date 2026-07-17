-- =============================================================================
-- FORENSIC READ-ONLY — UN SOLO group_key
-- Filas reales. Sin conteos, sin atribución, sin reparación.
-- Prohibido: INSERT / UPDATE / DELETE / DDL / DO / CREATE / TEMP / vistas / funciones.
--
-- Cómo parametrizar:
--   Find-replace en TODO el archivo la cadena literal del group_key
--   (hoy: liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179)
--
-- Cada SELECT es independiente: repite la misma cadena de CTEs:
--   params → parsed → group_members → member_ids → member_player_ids → member_liga_ids
-- (PostgreSQL no reutiliza CTE entre statements.)
--
-- Formatos: liga:<uuid> | players:<uuid> | joint:<player_uuid>|<liga_uuid>
-- Grupo inicial: liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179  (MULTI_OWNER)
--
-- Tablas opcionales: si no están en producción, el bloque queda NO_APLICA
-- (sin FROM a esa relación) para no abortar el resto del audit (sin DO/DDL).
--
-- Columnas en ORDER BY / WHERE / filtros:
--   Solo columnas confirmadas por CREATE/ALTER en supabase/*.sql, o PK id.
--   Si una temporal no está en DDL del repo → ORDER BY <pk> (evitar 42703).
-- =============================================================================

BEGIN;
SET TRANSACTION READ ONLY;

-- Valor activo (find-replace esta cadena en todos los WITH params):
-- liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179


-- ── 00 presencia tablas opcionales (solo to_regclass; seguro) ─────────────
SELECT
  '00_optional_presence' AS section,
  v.table_name,
  CASE
    WHEN to_regclass(('public.' || v.table_name)) IS NOT NULL THEN 'EXISTE'
    ELSE 'NO_EXISTE'
  END AS status,
  v.role_in_audit
FROM (
  VALUES
    ('riviera_player_sharing_request', 'opcional_sharing'),
    ('riviera_jugador_import_blocklist', 'opcional_blocklist'),
    ('jugador_participacion_exclusiones', 'opcional_exclusiones'),
    ('riviera_official_player_identity', 'romc_identity'),
    ('riviera_official_player_profile_link', 'romc_profile_link'),
    ('riviera_official_points_ledger', 'romc_ledger_core'),
    ('notificaciones_log', 'opcional_notif'),
    ('jugador_stats', 'stats')
) AS v(table_name, role_in_audit)
ORDER BY v.table_name;

-- ── 01 params + scope resuelto ────────────────────────────────────────────
WITH params AS (
  SELECT 'liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179'::text AS group_key
),
parsed AS (
  SELECT
    p.group_key,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN 'SOLO_LIGA'
      WHEN p.group_key LIKE 'players:%' THEN 'SOLO_PLAYERS'
      WHEN p.group_key LIKE 'joint:%' THEN 'PLAYERS_Y_LIGA'
      ELSE 'INVALID'
    END AS layer_class,
    CASE
      WHEN p.group_key LIKE 'players:%' THEN
        nullif(substr(p.group_key, length('players:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 1), '')::uuid
      ELSE NULL::uuid
    END AS legacy_player_id,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN
        nullif(substr(p.group_key, length('liga:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 2), '')::uuid
      ELSE NULL::uuid
    END AS legacy_liga_jugador_id
  FROM params p
),
group_members AS (
  SELECT
    pr.group_key,
    pr.layer_class,
    pr.legacy_player_id AS group_key_legacy_player_id,
    pr.legacy_liga_jugador_id AS group_key_legacy_liga_jugador_id,
    rj.id AS riviera_jugador_id,
    rj.legacy_player_id AS member_legacy_player_id,
    rj.legacy_liga_jugador_id AS member_legacy_liga_jugador_id
  FROM parsed pr
  JOIN public.riviera_jugadores rj
    ON (pr.layer_class = 'SOLO_LIGA' AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id)
    OR (pr.layer_class = 'SOLO_PLAYERS' AND rj.legacy_player_id = pr.legacy_player_id)
    OR (
      pr.layer_class = 'PLAYERS_Y_LIGA'
      AND rj.legacy_player_id = pr.legacy_player_id
      AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id
    )
),
member_ids AS (
  SELECT gm.riviera_jugador_id AS id
  FROM group_members gm
),
member_player_ids AS (
  SELECT DISTINCT gm.member_legacy_player_id AS players_id
  FROM group_members gm
  WHERE gm.member_legacy_player_id IS NOT NULL
),
member_liga_ids AS (
  SELECT DISTINCT coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) AS liga_id
  FROM group_members gm
  WHERE coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) IS NOT NULL
)
SELECT
  '01_params_scope' AS section,
  pr.group_key,
  pr.layer_class,
  pr.legacy_player_id AS group_key_legacy_player_id,
  pr.legacy_liga_jugador_id AS group_key_legacy_liga_jugador_id,
  gm.riviera_jugador_id,
  gm.member_legacy_player_id,
  gm.member_legacy_liga_jugador_id
FROM parsed pr
LEFT JOIN group_members gm ON gm.group_key = pr.group_key
ORDER BY gm.riviera_jugador_id NULLS LAST;

-- ── 02 riviera_jugadores ──────────────────────────────────────────────────
WITH params AS (
  SELECT 'liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179'::text AS group_key
),
parsed AS (
  SELECT
    p.group_key,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN 'SOLO_LIGA'
      WHEN p.group_key LIKE 'players:%' THEN 'SOLO_PLAYERS'
      WHEN p.group_key LIKE 'joint:%' THEN 'PLAYERS_Y_LIGA'
      ELSE 'INVALID'
    END AS layer_class,
    CASE
      WHEN p.group_key LIKE 'players:%' THEN
        nullif(substr(p.group_key, length('players:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 1), '')::uuid
      ELSE NULL::uuid
    END AS legacy_player_id,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN
        nullif(substr(p.group_key, length('liga:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 2), '')::uuid
      ELSE NULL::uuid
    END AS legacy_liga_jugador_id
  FROM params p
),
group_members AS (
  SELECT
    pr.group_key,
    pr.layer_class,
    pr.legacy_player_id AS group_key_legacy_player_id,
    pr.legacy_liga_jugador_id AS group_key_legacy_liga_jugador_id,
    rj.id AS riviera_jugador_id,
    rj.legacy_player_id AS member_legacy_player_id,
    rj.legacy_liga_jugador_id AS member_legacy_liga_jugador_id
  FROM parsed pr
  JOIN public.riviera_jugadores rj
    ON (pr.layer_class = 'SOLO_LIGA' AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id)
    OR (pr.layer_class = 'SOLO_PLAYERS' AND rj.legacy_player_id = pr.legacy_player_id)
    OR (
      pr.layer_class = 'PLAYERS_Y_LIGA'
      AND rj.legacy_player_id = pr.legacy_player_id
      AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id
    )
),
member_ids AS (
  SELECT gm.riviera_jugador_id AS id
  FROM group_members gm
),
member_player_ids AS (
  SELECT DISTINCT gm.member_legacy_player_id AS players_id
  FROM group_members gm
  WHERE gm.member_legacy_player_id IS NOT NULL
),
member_liga_ids AS (
  SELECT DISTINCT coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) AS liga_id
  FROM group_members gm
  WHERE coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) IS NOT NULL
)
SELECT '02_riviera_jugadores' AS section, rj.*
FROM public.riviera_jugadores rj
WHERE rj.id IN (SELECT id FROM member_ids)
-- created_at: sin CREATE TABLE riviera_jugadores en repo → omitido (evitar 42703)
ORDER BY rj.id;

-- ── 03 organizer_player_access ────────────────────────────────────────────
WITH params AS (
  SELECT 'liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179'::text AS group_key
),
parsed AS (
  SELECT
    p.group_key,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN 'SOLO_LIGA'
      WHEN p.group_key LIKE 'players:%' THEN 'SOLO_PLAYERS'
      WHEN p.group_key LIKE 'joint:%' THEN 'PLAYERS_Y_LIGA'
      ELSE 'INVALID'
    END AS layer_class,
    CASE
      WHEN p.group_key LIKE 'players:%' THEN
        nullif(substr(p.group_key, length('players:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 1), '')::uuid
      ELSE NULL::uuid
    END AS legacy_player_id,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN
        nullif(substr(p.group_key, length('liga:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 2), '')::uuid
      ELSE NULL::uuid
    END AS legacy_liga_jugador_id
  FROM params p
),
group_members AS (
  SELECT
    pr.group_key,
    pr.layer_class,
    pr.legacy_player_id AS group_key_legacy_player_id,
    pr.legacy_liga_jugador_id AS group_key_legacy_liga_jugador_id,
    rj.id AS riviera_jugador_id,
    rj.legacy_player_id AS member_legacy_player_id,
    rj.legacy_liga_jugador_id AS member_legacy_liga_jugador_id
  FROM parsed pr
  JOIN public.riviera_jugadores rj
    ON (pr.layer_class = 'SOLO_LIGA' AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id)
    OR (pr.layer_class = 'SOLO_PLAYERS' AND rj.legacy_player_id = pr.legacy_player_id)
    OR (
      pr.layer_class = 'PLAYERS_Y_LIGA'
      AND rj.legacy_player_id = pr.legacy_player_id
      AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id
    )
),
member_ids AS (
  SELECT gm.riviera_jugador_id AS id
  FROM group_members gm
),
member_player_ids AS (
  SELECT DISTINCT gm.member_legacy_player_id AS players_id
  FROM group_members gm
  WHERE gm.member_legacy_player_id IS NOT NULL
),
member_liga_ids AS (
  SELECT DISTINCT coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) AS liga_id
  FROM group_members gm
  WHERE coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) IS NOT NULL
)
SELECT '03_organizer_player_access' AS section, opa.*
FROM public.organizer_player_access opa
WHERE opa.jugador_id IN (SELECT id FROM member_ids)
   OR opa.local_jugador_id IN (SELECT id FROM member_ids)
-- created_at confirmado en organizer-player-access.sql
ORDER BY opa.created_at NULLS LAST, opa.id;

-- ── 04 jugador_participaciones ────────────────────────────────────────────
WITH params AS (
  SELECT 'liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179'::text AS group_key
),
parsed AS (
  SELECT
    p.group_key,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN 'SOLO_LIGA'
      WHEN p.group_key LIKE 'players:%' THEN 'SOLO_PLAYERS'
      WHEN p.group_key LIKE 'joint:%' THEN 'PLAYERS_Y_LIGA'
      ELSE 'INVALID'
    END AS layer_class,
    CASE
      WHEN p.group_key LIKE 'players:%' THEN
        nullif(substr(p.group_key, length('players:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 1), '')::uuid
      ELSE NULL::uuid
    END AS legacy_player_id,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN
        nullif(substr(p.group_key, length('liga:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 2), '')::uuid
      ELSE NULL::uuid
    END AS legacy_liga_jugador_id
  FROM params p
),
group_members AS (
  SELECT
    pr.group_key,
    pr.layer_class,
    pr.legacy_player_id AS group_key_legacy_player_id,
    pr.legacy_liga_jugador_id AS group_key_legacy_liga_jugador_id,
    rj.id AS riviera_jugador_id,
    rj.legacy_player_id AS member_legacy_player_id,
    rj.legacy_liga_jugador_id AS member_legacy_liga_jugador_id
  FROM parsed pr
  JOIN public.riviera_jugadores rj
    ON (pr.layer_class = 'SOLO_LIGA' AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id)
    OR (pr.layer_class = 'SOLO_PLAYERS' AND rj.legacy_player_id = pr.legacy_player_id)
    OR (
      pr.layer_class = 'PLAYERS_Y_LIGA'
      AND rj.legacy_player_id = pr.legacy_player_id
      AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id
    )
),
member_ids AS (
  SELECT gm.riviera_jugador_id AS id
  FROM group_members gm
),
member_player_ids AS (
  SELECT DISTINCT gm.member_legacy_player_id AS players_id
  FROM group_members gm
  WHERE gm.member_legacy_player_id IS NOT NULL
),
member_liga_ids AS (
  SELECT DISTINCT coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) AS liga_id
  FROM group_members gm
  WHERE coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) IS NOT NULL
)
SELECT '04_jugador_participaciones' AS section, jp.*
FROM public.jugador_participaciones jp
WHERE jp.jugador_id IN (SELECT id FROM member_ids)
-- fecha + created_at confirmados en riviera-career-participaciones-public.sql
ORDER BY jp.fecha NULLS LAST, jp.created_at NULLS LAST, jp.id;

-- ── 05 rating_historial ───────────────────────────────────────────────────
WITH params AS (
  SELECT 'liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179'::text AS group_key
),
parsed AS (
  SELECT
    p.group_key,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN 'SOLO_LIGA'
      WHEN p.group_key LIKE 'players:%' THEN 'SOLO_PLAYERS'
      WHEN p.group_key LIKE 'joint:%' THEN 'PLAYERS_Y_LIGA'
      ELSE 'INVALID'
    END AS layer_class,
    CASE
      WHEN p.group_key LIKE 'players:%' THEN
        nullif(substr(p.group_key, length('players:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 1), '')::uuid
      ELSE NULL::uuid
    END AS legacy_player_id,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN
        nullif(substr(p.group_key, length('liga:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 2), '')::uuid
      ELSE NULL::uuid
    END AS legacy_liga_jugador_id
  FROM params p
),
group_members AS (
  SELECT
    pr.group_key,
    pr.layer_class,
    pr.legacy_player_id AS group_key_legacy_player_id,
    pr.legacy_liga_jugador_id AS group_key_legacy_liga_jugador_id,
    rj.id AS riviera_jugador_id,
    rj.legacy_player_id AS member_legacy_player_id,
    rj.legacy_liga_jugador_id AS member_legacy_liga_jugador_id
  FROM parsed pr
  JOIN public.riviera_jugadores rj
    ON (pr.layer_class = 'SOLO_LIGA' AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id)
    OR (pr.layer_class = 'SOLO_PLAYERS' AND rj.legacy_player_id = pr.legacy_player_id)
    OR (
      pr.layer_class = 'PLAYERS_Y_LIGA'
      AND rj.legacy_player_id = pr.legacy_player_id
      AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id
    )
),
member_ids AS (
  SELECT gm.riviera_jugador_id AS id
  FROM group_members gm
),
member_player_ids AS (
  SELECT DISTINCT gm.member_legacy_player_id AS players_id
  FROM group_members gm
  WHERE gm.member_legacy_player_id IS NOT NULL
),
member_liga_ids AS (
  SELECT DISTINCT coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) AS liga_id
  FROM group_members gm
  WHERE coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) IS NOT NULL
)
SELECT '05_rating_historial' AS section, rh.*
FROM public.rating_historial rh
WHERE rh.jugador_id IN (SELECT id FROM member_ids)
-- fecha confirmada en rating-sistema.sql
ORDER BY rh.fecha NULLS LAST, rh.id;

-- ── 06 riviera_official_points_ledger ─────────────────────────────────────
WITH params AS (
  SELECT 'liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179'::text AS group_key
),
parsed AS (
  SELECT
    p.group_key,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN 'SOLO_LIGA'
      WHEN p.group_key LIKE 'players:%' THEN 'SOLO_PLAYERS'
      WHEN p.group_key LIKE 'joint:%' THEN 'PLAYERS_Y_LIGA'
      ELSE 'INVALID'
    END AS layer_class,
    CASE
      WHEN p.group_key LIKE 'players:%' THEN
        nullif(substr(p.group_key, length('players:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 1), '')::uuid
      ELSE NULL::uuid
    END AS legacy_player_id,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN
        nullif(substr(p.group_key, length('liga:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 2), '')::uuid
      ELSE NULL::uuid
    END AS legacy_liga_jugador_id
  FROM params p
),
group_members AS (
  SELECT
    pr.group_key,
    pr.layer_class,
    pr.legacy_player_id AS group_key_legacy_player_id,
    pr.legacy_liga_jugador_id AS group_key_legacy_liga_jugador_id,
    rj.id AS riviera_jugador_id,
    rj.legacy_player_id AS member_legacy_player_id,
    rj.legacy_liga_jugador_id AS member_legacy_liga_jugador_id
  FROM parsed pr
  JOIN public.riviera_jugadores rj
    ON (pr.layer_class = 'SOLO_LIGA' AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id)
    OR (pr.layer_class = 'SOLO_PLAYERS' AND rj.legacy_player_id = pr.legacy_player_id)
    OR (
      pr.layer_class = 'PLAYERS_Y_LIGA'
      AND rj.legacy_player_id = pr.legacy_player_id
      AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id
    )
),
member_ids AS (
  SELECT gm.riviera_jugador_id AS id
  FROM group_members gm
),
member_player_ids AS (
  SELECT DISTINCT gm.member_legacy_player_id AS players_id
  FROM group_members gm
  WHERE gm.member_legacy_player_id IS NOT NULL
),
member_liga_ids AS (
  SELECT DISTINCT coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) AS liga_id
  FROM group_members gm
  WHERE coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) IS NOT NULL
)
SELECT '06_riviera_official_points_ledger' AS section, led.*
FROM public.riviera_official_points_ledger led
WHERE led.source_local_jugador_id IN (SELECT id FROM member_ids)
-- created_at confirmado en riviera-official-multi-club-romc1.sql
ORDER BY led.created_at NULLS LAST, led.id;

-- ── 07 pairs ──────────────────────────────────────────────────────────────
WITH params AS (
  SELECT 'liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179'::text AS group_key
),
parsed AS (
  SELECT
    p.group_key,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN 'SOLO_LIGA'
      WHEN p.group_key LIKE 'players:%' THEN 'SOLO_PLAYERS'
      WHEN p.group_key LIKE 'joint:%' THEN 'PLAYERS_Y_LIGA'
      ELSE 'INVALID'
    END AS layer_class,
    CASE
      WHEN p.group_key LIKE 'players:%' THEN
        nullif(substr(p.group_key, length('players:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 1), '')::uuid
      ELSE NULL::uuid
    END AS legacy_player_id,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN
        nullif(substr(p.group_key, length('liga:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 2), '')::uuid
      ELSE NULL::uuid
    END AS legacy_liga_jugador_id
  FROM params p
),
group_members AS (
  SELECT
    pr.group_key,
    pr.layer_class,
    pr.legacy_player_id AS group_key_legacy_player_id,
    pr.legacy_liga_jugador_id AS group_key_legacy_liga_jugador_id,
    rj.id AS riviera_jugador_id,
    rj.legacy_player_id AS member_legacy_player_id,
    rj.legacy_liga_jugador_id AS member_legacy_liga_jugador_id
  FROM parsed pr
  JOIN public.riviera_jugadores rj
    ON (pr.layer_class = 'SOLO_LIGA' AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id)
    OR (pr.layer_class = 'SOLO_PLAYERS' AND rj.legacy_player_id = pr.legacy_player_id)
    OR (
      pr.layer_class = 'PLAYERS_Y_LIGA'
      AND rj.legacy_player_id = pr.legacy_player_id
      AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id
    )
),
member_ids AS (
  SELECT gm.riviera_jugador_id AS id
  FROM group_members gm
),
member_player_ids AS (
  SELECT DISTINCT gm.member_legacy_player_id AS players_id
  FROM group_members gm
  WHERE gm.member_legacy_player_id IS NOT NULL
),
member_liga_ids AS (
  SELECT DISTINCT coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) AS liga_id
  FROM group_members gm
  WHERE coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) IS NOT NULL
)
SELECT '07_pairs' AS section, p.*
FROM public.pairs p
WHERE p.player1_id IN (SELECT players_id FROM member_player_ids)
   OR p.player2_id IN (SELECT players_id FROM member_player_ids)
-- created_at: sin CREATE TABLE pairs en repo → omitido (evitar 42703)
ORDER BY p.id;

-- ── 08 liga_inscripciones ─────────────────────────────────────────────────
WITH params AS (
  SELECT 'liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179'::text AS group_key
),
parsed AS (
  SELECT
    p.group_key,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN 'SOLO_LIGA'
      WHEN p.group_key LIKE 'players:%' THEN 'SOLO_PLAYERS'
      WHEN p.group_key LIKE 'joint:%' THEN 'PLAYERS_Y_LIGA'
      ELSE 'INVALID'
    END AS layer_class,
    CASE
      WHEN p.group_key LIKE 'players:%' THEN
        nullif(substr(p.group_key, length('players:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 1), '')::uuid
      ELSE NULL::uuid
    END AS legacy_player_id,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN
        nullif(substr(p.group_key, length('liga:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 2), '')::uuid
      ELSE NULL::uuid
    END AS legacy_liga_jugador_id
  FROM params p
),
group_members AS (
  SELECT
    pr.group_key,
    pr.layer_class,
    pr.legacy_player_id AS group_key_legacy_player_id,
    pr.legacy_liga_jugador_id AS group_key_legacy_liga_jugador_id,
    rj.id AS riviera_jugador_id,
    rj.legacy_player_id AS member_legacy_player_id,
    rj.legacy_liga_jugador_id AS member_legacy_liga_jugador_id
  FROM parsed pr
  JOIN public.riviera_jugadores rj
    ON (pr.layer_class = 'SOLO_LIGA' AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id)
    OR (pr.layer_class = 'SOLO_PLAYERS' AND rj.legacy_player_id = pr.legacy_player_id)
    OR (
      pr.layer_class = 'PLAYERS_Y_LIGA'
      AND rj.legacy_player_id = pr.legacy_player_id
      AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id
    )
),
member_ids AS (
  SELECT gm.riviera_jugador_id AS id
  FROM group_members gm
),
member_player_ids AS (
  SELECT DISTINCT gm.member_legacy_player_id AS players_id
  FROM group_members gm
  WHERE gm.member_legacy_player_id IS NOT NULL
),
member_liga_ids AS (
  SELECT DISTINCT coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) AS liga_id
  FROM group_members gm
  WHERE coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) IS NOT NULL
)
SELECT '08_liga_inscripciones' AS section, li.*
FROM public.liga_inscripciones li
WHERE li.jugador_id IN (SELECT liga_id FROM member_liga_ids)
-- sin columna temporal en tipo/prod (42703 created_at) → solo PK
ORDER BY li.id;

-- ── 09 liga_equipos ───────────────────────────────────────────────────────
WITH params AS (
  SELECT 'liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179'::text AS group_key
),
parsed AS (
  SELECT
    p.group_key,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN 'SOLO_LIGA'
      WHEN p.group_key LIKE 'players:%' THEN 'SOLO_PLAYERS'
      WHEN p.group_key LIKE 'joint:%' THEN 'PLAYERS_Y_LIGA'
      ELSE 'INVALID'
    END AS layer_class,
    CASE
      WHEN p.group_key LIKE 'players:%' THEN
        nullif(substr(p.group_key, length('players:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 1), '')::uuid
      ELSE NULL::uuid
    END AS legacy_player_id,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN
        nullif(substr(p.group_key, length('liga:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 2), '')::uuid
      ELSE NULL::uuid
    END AS legacy_liga_jugador_id
  FROM params p
),
group_members AS (
  SELECT
    pr.group_key,
    pr.layer_class,
    pr.legacy_player_id AS group_key_legacy_player_id,
    pr.legacy_liga_jugador_id AS group_key_legacy_liga_jugador_id,
    rj.id AS riviera_jugador_id,
    rj.legacy_player_id AS member_legacy_player_id,
    rj.legacy_liga_jugador_id AS member_legacy_liga_jugador_id
  FROM parsed pr
  JOIN public.riviera_jugadores rj
    ON (pr.layer_class = 'SOLO_LIGA' AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id)
    OR (pr.layer_class = 'SOLO_PLAYERS' AND rj.legacy_player_id = pr.legacy_player_id)
    OR (
      pr.layer_class = 'PLAYERS_Y_LIGA'
      AND rj.legacy_player_id = pr.legacy_player_id
      AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id
    )
),
member_ids AS (
  SELECT gm.riviera_jugador_id AS id
  FROM group_members gm
),
member_player_ids AS (
  SELECT DISTINCT gm.member_legacy_player_id AS players_id
  FROM group_members gm
  WHERE gm.member_legacy_player_id IS NOT NULL
),
member_liga_ids AS (
  SELECT DISTINCT coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) AS liga_id
  FROM group_members gm
  WHERE coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) IS NOT NULL
)
SELECT '09_liga_equipos' AS section, le.*
FROM public.liga_equipos le
WHERE le.jugador1_id IN (SELECT liga_id FROM member_liga_ids)
   OR le.jugador2_id IN (SELECT liga_id FROM member_liga_ids)
-- created_at: sin CREATE TABLE liga_equipos en repo → omitido (evitar 42703)
ORDER BY le.id;

-- ── 10 liga_jornada_parejas ───────────────────────────────────────────────
WITH params AS (
  SELECT 'liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179'::text AS group_key
),
parsed AS (
  SELECT
    p.group_key,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN 'SOLO_LIGA'
      WHEN p.group_key LIKE 'players:%' THEN 'SOLO_PLAYERS'
      WHEN p.group_key LIKE 'joint:%' THEN 'PLAYERS_Y_LIGA'
      ELSE 'INVALID'
    END AS layer_class,
    CASE
      WHEN p.group_key LIKE 'players:%' THEN
        nullif(substr(p.group_key, length('players:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 1), '')::uuid
      ELSE NULL::uuid
    END AS legacy_player_id,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN
        nullif(substr(p.group_key, length('liga:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 2), '')::uuid
      ELSE NULL::uuid
    END AS legacy_liga_jugador_id
  FROM params p
),
group_members AS (
  SELECT
    pr.group_key,
    pr.layer_class,
    pr.legacy_player_id AS group_key_legacy_player_id,
    pr.legacy_liga_jugador_id AS group_key_legacy_liga_jugador_id,
    rj.id AS riviera_jugador_id,
    rj.legacy_player_id AS member_legacy_player_id,
    rj.legacy_liga_jugador_id AS member_legacy_liga_jugador_id
  FROM parsed pr
  JOIN public.riviera_jugadores rj
    ON (pr.layer_class = 'SOLO_LIGA' AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id)
    OR (pr.layer_class = 'SOLO_PLAYERS' AND rj.legacy_player_id = pr.legacy_player_id)
    OR (
      pr.layer_class = 'PLAYERS_Y_LIGA'
      AND rj.legacy_player_id = pr.legacy_player_id
      AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id
    )
),
member_ids AS (
  SELECT gm.riviera_jugador_id AS id
  FROM group_members gm
),
member_player_ids AS (
  SELECT DISTINCT gm.member_legacy_player_id AS players_id
  FROM group_members gm
  WHERE gm.member_legacy_player_id IS NOT NULL
),
member_liga_ids AS (
  SELECT DISTINCT coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) AS liga_id
  FROM group_members gm
  WHERE coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) IS NOT NULL
)
SELECT '10_liga_jornada_parejas' AS section, ljp.*
FROM public.liga_jornada_parejas ljp
WHERE ljp.jugador1_id IN (SELECT liga_id FROM member_liga_ids)
   OR ljp.jugador2_id IN (SELECT liga_id FROM member_liga_ids)
-- created_at no está en tipo LigaJornadaPareja ni en inserts → omitido
ORDER BY ljp.id;

-- ── 11 players ────────────────────────────────────────────────────────────
WITH params AS (
  SELECT 'liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179'::text AS group_key
),
parsed AS (
  SELECT
    p.group_key,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN 'SOLO_LIGA'
      WHEN p.group_key LIKE 'players:%' THEN 'SOLO_PLAYERS'
      WHEN p.group_key LIKE 'joint:%' THEN 'PLAYERS_Y_LIGA'
      ELSE 'INVALID'
    END AS layer_class,
    CASE
      WHEN p.group_key LIKE 'players:%' THEN
        nullif(substr(p.group_key, length('players:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 1), '')::uuid
      ELSE NULL::uuid
    END AS legacy_player_id,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN
        nullif(substr(p.group_key, length('liga:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 2), '')::uuid
      ELSE NULL::uuid
    END AS legacy_liga_jugador_id
  FROM params p
),
group_members AS (
  SELECT
    pr.group_key,
    pr.layer_class,
    pr.legacy_player_id AS group_key_legacy_player_id,
    pr.legacy_liga_jugador_id AS group_key_legacy_liga_jugador_id,
    rj.id AS riviera_jugador_id,
    rj.legacy_player_id AS member_legacy_player_id,
    rj.legacy_liga_jugador_id AS member_legacy_liga_jugador_id
  FROM parsed pr
  JOIN public.riviera_jugadores rj
    ON (pr.layer_class = 'SOLO_LIGA' AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id)
    OR (pr.layer_class = 'SOLO_PLAYERS' AND rj.legacy_player_id = pr.legacy_player_id)
    OR (
      pr.layer_class = 'PLAYERS_Y_LIGA'
      AND rj.legacy_player_id = pr.legacy_player_id
      AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id
    )
),
member_ids AS (
  SELECT gm.riviera_jugador_id AS id
  FROM group_members gm
),
member_player_ids AS (
  SELECT DISTINCT gm.member_legacy_player_id AS players_id
  FROM group_members gm
  WHERE gm.member_legacy_player_id IS NOT NULL
),
member_liga_ids AS (
  SELECT DISTINCT coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) AS liga_id
  FROM group_members gm
  WHERE coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) IS NOT NULL
)
SELECT '11_players' AS section, pl.*
FROM public.players pl
WHERE pl.id IN (SELECT players_id FROM member_player_ids)
-- created_at: sin CREATE TABLE players en repo → omitido (evitar 42703)
ORDER BY pl.id;

-- ── 12 liga_jugadores ─────────────────────────────────────────────────────
WITH params AS (
  SELECT 'liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179'::text AS group_key
),
parsed AS (
  SELECT
    p.group_key,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN 'SOLO_LIGA'
      WHEN p.group_key LIKE 'players:%' THEN 'SOLO_PLAYERS'
      WHEN p.group_key LIKE 'joint:%' THEN 'PLAYERS_Y_LIGA'
      ELSE 'INVALID'
    END AS layer_class,
    CASE
      WHEN p.group_key LIKE 'players:%' THEN
        nullif(substr(p.group_key, length('players:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 1), '')::uuid
      ELSE NULL::uuid
    END AS legacy_player_id,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN
        nullif(substr(p.group_key, length('liga:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 2), '')::uuid
      ELSE NULL::uuid
    END AS legacy_liga_jugador_id
  FROM params p
),
group_members AS (
  SELECT
    pr.group_key,
    pr.layer_class,
    pr.legacy_player_id AS group_key_legacy_player_id,
    pr.legacy_liga_jugador_id AS group_key_legacy_liga_jugador_id,
    rj.id AS riviera_jugador_id,
    rj.legacy_player_id AS member_legacy_player_id,
    rj.legacy_liga_jugador_id AS member_legacy_liga_jugador_id
  FROM parsed pr
  JOIN public.riviera_jugadores rj
    ON (pr.layer_class = 'SOLO_LIGA' AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id)
    OR (pr.layer_class = 'SOLO_PLAYERS' AND rj.legacy_player_id = pr.legacy_player_id)
    OR (
      pr.layer_class = 'PLAYERS_Y_LIGA'
      AND rj.legacy_player_id = pr.legacy_player_id
      AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id
    )
),
member_ids AS (
  SELECT gm.riviera_jugador_id AS id
  FROM group_members gm
),
member_player_ids AS (
  SELECT DISTINCT gm.member_legacy_player_id AS players_id
  FROM group_members gm
  WHERE gm.member_legacy_player_id IS NOT NULL
),
member_liga_ids AS (
  SELECT DISTINCT coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) AS liga_id
  FROM group_members gm
  WHERE coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) IS NOT NULL
)
SELECT '12_liga_jugadores' AS section, lj.*
FROM public.liga_jugadores lj
WHERE lj.id IN (SELECT liga_id FROM member_liga_ids)
-- created_at: sin CREATE TABLE liga_jugadores en repo → omitido (evitar 42703)
ORDER BY lj.id;

-- ── 13 duelos_2v2 ─────────────────────────────────────────────────────────
WITH params AS (
  SELECT 'liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179'::text AS group_key
),
parsed AS (
  SELECT
    p.group_key,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN 'SOLO_LIGA'
      WHEN p.group_key LIKE 'players:%' THEN 'SOLO_PLAYERS'
      WHEN p.group_key LIKE 'joint:%' THEN 'PLAYERS_Y_LIGA'
      ELSE 'INVALID'
    END AS layer_class,
    CASE
      WHEN p.group_key LIKE 'players:%' THEN
        nullif(substr(p.group_key, length('players:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 1), '')::uuid
      ELSE NULL::uuid
    END AS legacy_player_id,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN
        nullif(substr(p.group_key, length('liga:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 2), '')::uuid
      ELSE NULL::uuid
    END AS legacy_liga_jugador_id
  FROM params p
),
group_members AS (
  SELECT
    pr.group_key,
    pr.layer_class,
    pr.legacy_player_id AS group_key_legacy_player_id,
    pr.legacy_liga_jugador_id AS group_key_legacy_liga_jugador_id,
    rj.id AS riviera_jugador_id,
    rj.legacy_player_id AS member_legacy_player_id,
    rj.legacy_liga_jugador_id AS member_legacy_liga_jugador_id
  FROM parsed pr
  JOIN public.riviera_jugadores rj
    ON (pr.layer_class = 'SOLO_LIGA' AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id)
    OR (pr.layer_class = 'SOLO_PLAYERS' AND rj.legacy_player_id = pr.legacy_player_id)
    OR (
      pr.layer_class = 'PLAYERS_Y_LIGA'
      AND rj.legacy_player_id = pr.legacy_player_id
      AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id
    )
),
member_ids AS (
  SELECT gm.riviera_jugador_id AS id
  FROM group_members gm
),
member_player_ids AS (
  SELECT DISTINCT gm.member_legacy_player_id AS players_id
  FROM group_members gm
  WHERE gm.member_legacy_player_id IS NOT NULL
),
member_liga_ids AS (
  SELECT DISTINCT coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) AS liga_id
  FROM group_members gm
  WHERE coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) IS NOT NULL
)
SELECT '13_duelos_2v2' AS section, d.*
FROM public.duelos_2v2 d
WHERE d.pareja_a_j1_id IN (SELECT id FROM member_ids)
   OR d.pareja_a_j2_id IN (SELECT id FROM member_ids)
   OR d.pareja_b_j1_id IN (SELECT id FROM member_ids)
   OR d.pareja_b_j2_id IN (SELECT id FROM member_ids)
-- created_at confirmado en duelos-2v2.sql
ORDER BY d.created_at NULLS LAST, d.id;

-- ── 14 tournament_open_registration_entries ───────────────────────────────
WITH params AS (
  SELECT 'liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179'::text AS group_key
),
parsed AS (
  SELECT
    p.group_key,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN 'SOLO_LIGA'
      WHEN p.group_key LIKE 'players:%' THEN 'SOLO_PLAYERS'
      WHEN p.group_key LIKE 'joint:%' THEN 'PLAYERS_Y_LIGA'
      ELSE 'INVALID'
    END AS layer_class,
    CASE
      WHEN p.group_key LIKE 'players:%' THEN
        nullif(substr(p.group_key, length('players:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 1), '')::uuid
      ELSE NULL::uuid
    END AS legacy_player_id,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN
        nullif(substr(p.group_key, length('liga:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 2), '')::uuid
      ELSE NULL::uuid
    END AS legacy_liga_jugador_id
  FROM params p
),
group_members AS (
  SELECT
    pr.group_key,
    pr.layer_class,
    pr.legacy_player_id AS group_key_legacy_player_id,
    pr.legacy_liga_jugador_id AS group_key_legacy_liga_jugador_id,
    rj.id AS riviera_jugador_id,
    rj.legacy_player_id AS member_legacy_player_id,
    rj.legacy_liga_jugador_id AS member_legacy_liga_jugador_id
  FROM parsed pr
  JOIN public.riviera_jugadores rj
    ON (pr.layer_class = 'SOLO_LIGA' AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id)
    OR (pr.layer_class = 'SOLO_PLAYERS' AND rj.legacy_player_id = pr.legacy_player_id)
    OR (
      pr.layer_class = 'PLAYERS_Y_LIGA'
      AND rj.legacy_player_id = pr.legacy_player_id
      AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id
    )
),
member_ids AS (
  SELECT gm.riviera_jugador_id AS id
  FROM group_members gm
),
member_player_ids AS (
  SELECT DISTINCT gm.member_legacy_player_id AS players_id
  FROM group_members gm
  WHERE gm.member_legacy_player_id IS NOT NULL
),
member_liga_ids AS (
  SELECT DISTINCT coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) AS liga_id
  FROM group_members gm
  WHERE coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) IS NOT NULL
)
SELECT '14_tournament_open_registration_entries' AS section, e.*
FROM public.tournament_open_registration_entries e
WHERE e.riviera_jugador_id IN (SELECT id FROM member_ids)
-- confirmed_at + created_at confirmados en reta-abierta-open-registration.sql
ORDER BY coalesce(e.confirmed_at, e.created_at) NULLS LAST, e.id;

-- ── 15 riviera_official_player_identity ───────────────────────────────────
WITH params AS (
  SELECT 'liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179'::text AS group_key
),
parsed AS (
  SELECT
    p.group_key,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN 'SOLO_LIGA'
      WHEN p.group_key LIKE 'players:%' THEN 'SOLO_PLAYERS'
      WHEN p.group_key LIKE 'joint:%' THEN 'PLAYERS_Y_LIGA'
      ELSE 'INVALID'
    END AS layer_class,
    CASE
      WHEN p.group_key LIKE 'players:%' THEN
        nullif(substr(p.group_key, length('players:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 1), '')::uuid
      ELSE NULL::uuid
    END AS legacy_player_id,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN
        nullif(substr(p.group_key, length('liga:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 2), '')::uuid
      ELSE NULL::uuid
    END AS legacy_liga_jugador_id
  FROM params p
),
group_members AS (
  SELECT
    pr.group_key,
    pr.layer_class,
    pr.legacy_player_id AS group_key_legacy_player_id,
    pr.legacy_liga_jugador_id AS group_key_legacy_liga_jugador_id,
    rj.id AS riviera_jugador_id,
    rj.legacy_player_id AS member_legacy_player_id,
    rj.legacy_liga_jugador_id AS member_legacy_liga_jugador_id
  FROM parsed pr
  JOIN public.riviera_jugadores rj
    ON (pr.layer_class = 'SOLO_LIGA' AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id)
    OR (pr.layer_class = 'SOLO_PLAYERS' AND rj.legacy_player_id = pr.legacy_player_id)
    OR (
      pr.layer_class = 'PLAYERS_Y_LIGA'
      AND rj.legacy_player_id = pr.legacy_player_id
      AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id
    )
),
member_ids AS (
  SELECT gm.riviera_jugador_id AS id
  FROM group_members gm
),
member_player_ids AS (
  SELECT DISTINCT gm.member_legacy_player_id AS players_id
  FROM group_members gm
  WHERE gm.member_legacy_player_id IS NOT NULL
),
member_liga_ids AS (
  SELECT DISTINCT coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) AS liga_id
  FROM group_members gm
  WHERE coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) IS NOT NULL
)
SELECT '15_riviera_official_player_identity' AS section, i.*
FROM public.riviera_official_player_identity i
WHERE i.canonical_riviera_jugador_id IN (SELECT id FROM member_ids)
-- created_at + official_player_key confirmados en riviera-official-multi-club-romc1.sql
ORDER BY i.created_at NULLS LAST, i.official_player_key;

-- ── 16 riviera_official_player_profile_link ───────────────────────────────
WITH params AS (
  SELECT 'liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179'::text AS group_key
),
parsed AS (
  SELECT
    p.group_key,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN 'SOLO_LIGA'
      WHEN p.group_key LIKE 'players:%' THEN 'SOLO_PLAYERS'
      WHEN p.group_key LIKE 'joint:%' THEN 'PLAYERS_Y_LIGA'
      ELSE 'INVALID'
    END AS layer_class,
    CASE
      WHEN p.group_key LIKE 'players:%' THEN
        nullif(substr(p.group_key, length('players:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 1), '')::uuid
      ELSE NULL::uuid
    END AS legacy_player_id,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN
        nullif(substr(p.group_key, length('liga:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 2), '')::uuid
      ELSE NULL::uuid
    END AS legacy_liga_jugador_id
  FROM params p
),
group_members AS (
  SELECT
    pr.group_key,
    pr.layer_class,
    pr.legacy_player_id AS group_key_legacy_player_id,
    pr.legacy_liga_jugador_id AS group_key_legacy_liga_jugador_id,
    rj.id AS riviera_jugador_id,
    rj.legacy_player_id AS member_legacy_player_id,
    rj.legacy_liga_jugador_id AS member_legacy_liga_jugador_id
  FROM parsed pr
  JOIN public.riviera_jugadores rj
    ON (pr.layer_class = 'SOLO_LIGA' AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id)
    OR (pr.layer_class = 'SOLO_PLAYERS' AND rj.legacy_player_id = pr.legacy_player_id)
    OR (
      pr.layer_class = 'PLAYERS_Y_LIGA'
      AND rj.legacy_player_id = pr.legacy_player_id
      AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id
    )
),
member_ids AS (
  SELECT gm.riviera_jugador_id AS id
  FROM group_members gm
),
member_player_ids AS (
  SELECT DISTINCT gm.member_legacy_player_id AS players_id
  FROM group_members gm
  WHERE gm.member_legacy_player_id IS NOT NULL
),
member_liga_ids AS (
  SELECT DISTINCT coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) AS liga_id
  FROM group_members gm
  WHERE coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) IS NOT NULL
)
SELECT '16_riviera_official_player_profile_link' AS section, l.*
FROM public.riviera_official_player_profile_link l
WHERE l.riviera_jugador_id IN (SELECT id FROM member_ids)
-- created_at confirmado en riviera-official-multi-club-romc1.sql
ORDER BY l.created_at NULLS LAST, l.riviera_jugador_id;

-- ── 17 jugador_stats ──────────────────────────────────────────────────────
WITH params AS (
  SELECT 'liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179'::text AS group_key
),
parsed AS (
  SELECT
    p.group_key,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN 'SOLO_LIGA'
      WHEN p.group_key LIKE 'players:%' THEN 'SOLO_PLAYERS'
      WHEN p.group_key LIKE 'joint:%' THEN 'PLAYERS_Y_LIGA'
      ELSE 'INVALID'
    END AS layer_class,
    CASE
      WHEN p.group_key LIKE 'players:%' THEN
        nullif(substr(p.group_key, length('players:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 1), '')::uuid
      ELSE NULL::uuid
    END AS legacy_player_id,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN
        nullif(substr(p.group_key, length('liga:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 2), '')::uuid
      ELSE NULL::uuid
    END AS legacy_liga_jugador_id
  FROM params p
),
group_members AS (
  SELECT
    pr.group_key,
    pr.layer_class,
    pr.legacy_player_id AS group_key_legacy_player_id,
    pr.legacy_liga_jugador_id AS group_key_legacy_liga_jugador_id,
    rj.id AS riviera_jugador_id,
    rj.legacy_player_id AS member_legacy_player_id,
    rj.legacy_liga_jugador_id AS member_legacy_liga_jugador_id
  FROM parsed pr
  JOIN public.riviera_jugadores rj
    ON (pr.layer_class = 'SOLO_LIGA' AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id)
    OR (pr.layer_class = 'SOLO_PLAYERS' AND rj.legacy_player_id = pr.legacy_player_id)
    OR (
      pr.layer_class = 'PLAYERS_Y_LIGA'
      AND rj.legacy_player_id = pr.legacy_player_id
      AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id
    )
),
member_ids AS (
  SELECT gm.riviera_jugador_id AS id
  FROM group_members gm
),
member_player_ids AS (
  SELECT DISTINCT gm.member_legacy_player_id AS players_id
  FROM group_members gm
  WHERE gm.member_legacy_player_id IS NOT NULL
),
member_liga_ids AS (
  SELECT DISTINCT coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) AS liga_id
  FROM group_members gm
  WHERE coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) IS NOT NULL
)
SELECT '17_jugador_stats' AS section, js.*
FROM public.jugador_stats js
WHERE js.jugador_id IN (SELECT id FROM member_ids)
ORDER BY js.jugador_id;

-- ── 18 riviera_player_sharing_request — NO_APLICA ─────────────────────────
-- Situación B: existe migración en repo (riviera-player-sharing-requests-2.1.0.sql)
-- pero la relación NO está en producción (ERROR 42P01). Nombre no renombrado.
-- Tabla no presente en producción. Se omite del audit.
SELECT
  '18_riviera_player_sharing_request' AS section,
  'NO_APLICA' AS status,
  'Tabla no presente en producción. Se omite del audit.' AS note,
  'public.riviera_player_sharing_request' AS expected_table;

-- ── 19 notificaciones_log — NO_APLICA ─────────────────────────────────────
-- Sin CREATE TABLE notificaciones_log en repo. Tabla opcional (TE).
-- Tabla no presente en producción. Se omite del audit.
-- (Si 00_optional_presence = EXISTE y se necesita dump, reactivar en follow-up.)
SELECT
  '19_notificaciones_log' AS section,
  'NO_APLICA' AS status,
  'Tabla no presente en producción. Se omite del audit.' AS note,
  'public.notificaciones_log' AS expected_table;

-- ── 20 jugador_participacion_exclusiones — NO_APLICA ──────────────────────
-- Tabla opcional en repo (jugador-participacion-exclusiones.sql).
-- Delete scripts la protegen con to_regclass. Sin DO no hay SELECT condicional:
-- se omite el dump para que una ausencia no aborte el audit completo.
-- Tabla no presente en producción. Se omite del audit.
-- (Si 00_optional_presence = EXISTE y se necesita el dump, reactivar en follow-up.)
SELECT
  '20_jugador_participacion_exclusiones' AS section,
  'NO_APLICA' AS status,
  'Tabla no presente en producción. Se omite del audit.' AS note,
  'public.jugador_participacion_exclusiones' AS expected_table;

-- ── 21 riviera_jugador_import_blocklist — NO_APLICA ───────────────────────
-- Tabla opcional en repo (jugador-import-blocklist.sql).
-- Delete scripts la protegen con to_regclass. Sin DO no hay SELECT condicional:
-- se omite el dump para que una ausencia no aborte el audit completo.
-- Tabla no presente en producción. Se omite del audit.
-- (Si 00_optional_presence = EXISTE y se necesita el dump, reactivar en follow-up.)
SELECT
  '21_riviera_jugador_import_blocklist' AS section,
  'NO_APLICA' AS status,
  'Tabla no presente en producción. Se omite del audit.' AS note,
  'public.riviera_jugador_import_blocklist' AS expected_table;

-- ── 22 liga_partidos ──────────────────────────────────────────────────────
WITH params AS (
  SELECT 'liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179'::text AS group_key
),
parsed AS (
  SELECT
    p.group_key,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN 'SOLO_LIGA'
      WHEN p.group_key LIKE 'players:%' THEN 'SOLO_PLAYERS'
      WHEN p.group_key LIKE 'joint:%' THEN 'PLAYERS_Y_LIGA'
      ELSE 'INVALID'
    END AS layer_class,
    CASE
      WHEN p.group_key LIKE 'players:%' THEN
        nullif(substr(p.group_key, length('players:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 1), '')::uuid
      ELSE NULL::uuid
    END AS legacy_player_id,
    CASE
      WHEN p.group_key LIKE 'liga:%' THEN
        nullif(substr(p.group_key, length('liga:') + 1), '')::uuid
      WHEN p.group_key LIKE 'joint:%' THEN
        nullif(split_part(substr(p.group_key, length('joint:') + 1), '|', 2), '')::uuid
      ELSE NULL::uuid
    END AS legacy_liga_jugador_id
  FROM params p
),
group_members AS (
  SELECT
    pr.group_key,
    pr.layer_class,
    pr.legacy_player_id AS group_key_legacy_player_id,
    pr.legacy_liga_jugador_id AS group_key_legacy_liga_jugador_id,
    rj.id AS riviera_jugador_id,
    rj.legacy_player_id AS member_legacy_player_id,
    rj.legacy_liga_jugador_id AS member_legacy_liga_jugador_id
  FROM parsed pr
  JOIN public.riviera_jugadores rj
    ON (pr.layer_class = 'SOLO_LIGA' AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id)
    OR (pr.layer_class = 'SOLO_PLAYERS' AND rj.legacy_player_id = pr.legacy_player_id)
    OR (
      pr.layer_class = 'PLAYERS_Y_LIGA'
      AND rj.legacy_player_id = pr.legacy_player_id
      AND rj.legacy_liga_jugador_id = pr.legacy_liga_jugador_id
    )
),
member_ids AS (
  SELECT gm.riviera_jugador_id AS id
  FROM group_members gm
),
member_player_ids AS (
  SELECT DISTINCT gm.member_legacy_player_id AS players_id
  FROM group_members gm
  WHERE gm.member_legacy_player_id IS NOT NULL
),
member_liga_ids AS (
  SELECT DISTINCT coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) AS liga_id
  FROM group_members gm
  WHERE coalesce(gm.group_key_legacy_liga_jugador_id, gm.member_legacy_liga_jugador_id) IS NOT NULL
),
pareja_ids AS (
  SELECT ljp.id
  FROM public.liga_jornada_parejas ljp
  WHERE ljp.jugador1_id IN (SELECT liga_id FROM member_liga_ids)
     OR ljp.jugador2_id IN (SELECT liga_id FROM member_liga_ids)
)
SELECT '22_liga_partidos' AS section, lp.*
FROM public.liga_partidos lp
WHERE lp.pareja1_id IN (SELECT id FROM pareja_ids)
   OR lp.pareja2_id IN (SELECT id FROM pareja_ids)
-- created_at: sin CREATE TABLE liga_partidos en repo → omitido (evitar 42703)
ORDER BY lp.id;

-- ── AUDIT_STATUS (cierre: confirma que el script llegó al final) ───────────
SELECT
  'AUDIT_STATUS' AS section,
  true AS audit_completed,
  'liga:8e3158a6-6180-4bd3-91c3-bb41e56a0179'::text AS group_key,
  23 AS executed_blocks,
  4 AS skipped_optional_blocks,
  '18_riviera_player_sharing_request,19_notificaciones_log,20_jugador_participacion_exclusiones,21_riviera_jugador_import_blocklist'::text AS optional_blocks,
  '00_optional_presence,01_params_scope,02_riviera_jugadores,03_organizer_player_access,04_jugador_participaciones,05_rating_historial,06_riviera_official_points_ledger,07_pairs,08_liga_inscripciones,09_liga_equipos,10_liga_jornada_parejas,11_players,12_liga_jugadores,13_duelos_2v2,14_tournament_open_registration_entries,15_riviera_official_player_identity,16_riviera_official_player_profile_link,17_jugador_stats,22_liga_partidos'::text AS core_blocks;

ROLLBACK;
