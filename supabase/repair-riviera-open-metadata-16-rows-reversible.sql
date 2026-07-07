-- ═══════════════════════════════════════════════════════════════════════════
-- REPAIR REVERSIBLE: metadata.organizador_id → Riviera Open (16 filas B)
--
-- REGLA DE NEGOCIO APROBADA (2026-07-07):
--   Una verdad por evento_id. Sin atribución distinta por jugador en el mismo evento.
--
-- PRIORIDAD DE EVIDENCIA:
--   1. ranking_puntos_esquema = riviera_open_v1
--   2. perfil oficial = Riviera Open
--   3. contexto ROMC / Rush / Riviera Open
--   4. override 6-jul NO es fuente confiable (mismo incidente)
--
-- CRITERIOS DE ELEGIBILIDAD (todas deben cumplirse):
--   • ranking_puntos_esquema = riviera_open_v1
--   • perfil.organizador_id = Riviera Open
--   • metadata.organizador_id = Hackpadel
--   • repair_reason = manual_override_parent_deleted
--   • manual_override_approved_at LIKE 2026-07-06%
--   • parent evento eliminado
--   • override tabla = Hackpadel
--   • participacion_id en lista cerrada de 16 (sección B)
--
-- NO ejecutar UPDATE hasta: PREVIEW = 16 filas + backup OK + tu aprobación.
-- NO toca TypeScript, UI, algoritmo ni overrides.
--
-- Riviera Open: 2770b522-9064-4c7b-a729-4a0ea7e3f6e8
-- Hackpadel:     e724de97-3552-4a01-a269-f621e6f1ed26
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- 0) CTE compartido — candidatos elegibles
-- ═══════════════════════════════════════════════════════════════════════════
/*
WITH target_ids AS (
  SELECT unnest(ARRAY[
    '48a8cd17-70c1-47b1-bc05-4e4932bc0c18'::uuid,  -- Aaron Duran · Hack Padel
    'af969403-28ec-4aa4-8638-22121b3b7591'::uuid,  -- Alejandro R · Remontada Final
    '47e16c96-4658-4590-a194-ab1c8dce491c'::uuid,  -- Daniel N · Remontada Final
    '97d04a08-8d28-4cf8-9baa-7302c6a7be6b'::uuid,  -- David R · Hack Padel 5ta Fuerza
    '6425dfbf-4ce2-4b42-a0f6-0a0a5cdaf628'::uuid,  -- Edgardo T · Remontada Final
    '62e3798e-6edc-49fa-ae6a-fe7f2026999f'::uuid,  -- Edgardo T · Hack Padel
    '08ba6460-a0ef-46d7-9a6c-be62c8b0ba09'::uuid,  -- Erick M · Remontada Final
    'dca25cba-e9eb-47ea-8378-76eb22f0c0a8'::uuid,  -- Irving · Remontada Final
    'fb56fea8-a64c-4968-9406-8efdd71986ee'::uuid,  -- Isra · Hack Padel 5ta Fuerza
    '9df31843-d19f-43ec-accd-48f5a23369e1'::uuid,  -- Isra · Hack Padel
    'a169fa6b-32e6-4504-95e6-a74f3af927f8'::uuid,  -- Marco M · Hack Padel 5ta Fuerza
    'c211351e-401c-4e03-b42f-87942ccec04a'::uuid,  -- Nevyl · Hack Padel 5ta Fuerza
    'a8ef7057-ef5b-40e4-8d00-78d9bf75291f'::uuid,  -- Nevyl · Hack Padel
    'ab189ed3-cdf6-449e-a6db-ec2c39738ef5'::uuid,  -- Paco · Remontada Final
    '4529e4ac-06ba-4a7d-97c9-b5de7db2b1ff'::uuid,  -- Ricardo S · Remontada Final
    'ee2a6797-61b3-4dd2-b5e5-7e537b10f16c'::uuid   -- Sebastian · Remontada Final
  ]) AS participacion_id
),
repair_candidates AS (
  SELECT
    jp.id AS participacion_id,
    jp.jugador_id,
    jp.evento_id,
    jp.tipo_evento,
    jp.evento_nombre,
    jp.fecha,
    jp.puntos_obtenidos,
    jp.metadata,
    rj.nombre AS jugador_nombre,
    rj.organizador_id AS perfil_organizador_id,
    o.organizador_id AS override_organizador_id,
    ident.riviera_id::text AS riviera_id
  FROM target_ids t
  INNER JOIN public.jugador_participaciones jp ON jp.id = t.participacion_id
  INNER JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  LEFT JOIN public.career_event_host_manual_overrides o
    ON o.tipo_evento = jp.tipo_evento::text
   AND o.evento_id = trim(jp.evento_id::text)
  LEFT JOIN public.riviera_official_player_identity ident
    ON ident.canonical_riviera_jugador_id = jp.jugador_id
  WHERE COALESCE(jp.metadata->>'ranking_puntos_esquema', '') = 'riviera_open_v1'
    AND rj.organizador_id = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'::uuid
    AND jp.metadata->>'organizador_id' = 'e724de97-3552-4a01-a269-f621e6f1ed26'
    AND jp.metadata->>'repair_reason' = 'manual_override_parent_deleted'
    AND COALESCE(jp.metadata->>'manual_override_approved_at', '') LIKE '2026-07-06%'
    AND NOT public._riviera_participacion_parent_row_exists(
      jp.tipo_evento::text,
      jp.evento_id::text
    )
    AND o.organizador_id = 'e724de97-3552-4a01-a269-f621e6f1ed26'::uuid
)
*/


-- ═══════════════════════════════════════════════════════════════════════════
-- 1) PREVIEW — debe devolver exactamente 16 filas
-- ═══════════════════════════════════════════════════════════════════════════
WITH target_ids AS (
  SELECT unnest(ARRAY[
    '48a8cd17-70c1-47b1-bc05-4e4932bc0c18'::uuid,
    'af969403-28ec-4aa4-8638-22121b3b7591'::uuid,
    '47e16c96-4658-4590-a194-ab1c8dce491c'::uuid,
    '97d04a08-8d28-4cf8-9baa-7302c6a7be6b'::uuid,
    '6425dfbf-4ce2-4b42-a0f6-0a0a5cdaf628'::uuid,
    '62e3798e-6edc-49fa-ae6a-fe7f2026999f'::uuid,
    '08ba6460-a0ef-46d7-9a6c-be62c8b0ba09'::uuid,
    'dca25cba-e9eb-47ea-8378-76eb22f0c0a8'::uuid,
    'fb56fea8-a64c-4968-9406-8efdd71986ee'::uuid,
    '9df31843-d19f-43ec-accd-48f5a23369e1'::uuid,
    'a169fa6b-32e6-4504-95e6-a74f3af927f8'::uuid,
    'c211351e-401c-4e03-b42f-87942ccec04a'::uuid,
    'a8ef7057-ef5b-40e4-8d00-78d9bf75291f'::uuid,
    'ab189ed3-cdf6-449e-a6db-ec2c39738ef5'::uuid,
    '4529e4ac-06ba-4a7d-97c9-b5de7db2b1ff'::uuid,
    'ee2a6797-61b3-4dd2-b5e5-7e537b10f16c'::uuid
  ]) AS participacion_id
),
repair_candidates AS (
  SELECT
    jp.id AS participacion_id,
    jp.jugador_id,
    jp.evento_id,
    jp.tipo_evento,
    jp.evento_nombre,
    jp.fecha,
    jp.puntos_obtenidos,
    rj.nombre AS jugador_nombre,
    rj.organizador_id AS perfil_organizador_id,
    ident.riviera_id::text AS riviera_id,
    jp.metadata->>'organizador_id' AS metadata_org_antes,
    jp.metadata->>'club_name' AS metadata_club_antes,
    jp.metadata->>'ranking_puntos_esquema' AS ranking_puntos_esquema,
    jp.metadata->>'repair_reason' AS repair_reason,
    jp.metadata->>'manual_override_approved_at' AS manual_override_approved_at,
    o.organizador_id AS override_organizador_id,
    '2770b522-9064-4c7b-a729-4a0ea7e3f6e8' AS metadata_org_despues,
    COALESCE(
      public.get_organizador_display_name('2770b522-9064-4c7b-a729-4a0ea7e3f6e8'::uuid),
      'Riviera Open'
    ) AS metadata_club_despues
  FROM target_ids t
  INNER JOIN public.jugador_participaciones jp ON jp.id = t.participacion_id
  INNER JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  LEFT JOIN public.career_event_host_manual_overrides o
    ON o.tipo_evento = jp.tipo_evento::text
   AND o.evento_id = trim(jp.evento_id::text)
  LEFT JOIN public.riviera_official_player_identity ident
    ON ident.canonical_riviera_jugador_id = jp.jugador_id
  WHERE COALESCE(jp.metadata->>'ranking_puntos_esquema', '') = 'riviera_open_v1'
    AND rj.organizador_id = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'::uuid
    AND jp.metadata->>'organizador_id' = 'e724de97-3552-4a01-a269-f621e6f1ed26'
    AND jp.metadata->>'repair_reason' = 'manual_override_parent_deleted'
    AND COALESCE(jp.metadata->>'manual_override_approved_at', '') LIKE '2026-07-06%'
    AND NOT public._riviera_participacion_parent_row_exists(
      jp.tipo_evento::text,
      jp.evento_id::text
    )
    AND o.organizador_id = 'e724de97-3552-4a01-a269-f621e6f1ed26'::uuid
)
SELECT
  jugador_nombre AS jugador,
  riviera_id,
  participacion_id,
  evento_nombre,
  fecha,
  puntos_obtenidos,
  metadata_club_antes AS metadata_club,
  public.get_organizador_display_name(perfil_organizador_id) AS perfil_club,
  '— (padre eliminado)' AS parent_club,
  public.get_organizador_display_name(override_organizador_id) AS override_club,
  repair_reason,
  manual_override_approved_at,
  metadata_club_despues AS metadata_club_nuevo
FROM repair_candidates
ORDER BY jugador_nombre, fecha DESC, evento_nombre;

-- Gate: conteo (debe ser 16)
WITH target_ids AS (
  SELECT unnest(ARRAY[
    '48a8cd17-70c1-47b1-bc05-4e4932bc0c18'::uuid,
    'af969403-28ec-4aa4-8638-22121b3b7591'::uuid,
    '47e16c96-4658-4590-a194-ab1c8dce491c'::uuid,
    '97d04a08-8d28-4cf8-9baa-7302c6a7be6b'::uuid,
    '6425dfbf-4ce2-4b42-a0f6-0a0a5cdaf628'::uuid,
    '62e3798e-6edc-49fa-ae6a-fe7f2026999f'::uuid,
    '08ba6460-a0ef-46d7-9a6c-be62c8b0ba09'::uuid,
    'dca25cba-e9eb-47ea-8378-76eb22f0c0a8'::uuid,
    'fb56fea8-a64c-4968-9406-8efdd71986ee'::uuid,
    '9df31843-d19f-43ec-accd-48f5a23369e1'::uuid,
    'a169fa6b-32e6-4504-95e6-a74f3af927f8'::uuid,
    'c211351e-401c-4e03-b42f-87942ccec04a'::uuid,
    'a8ef7057-ef5b-40e4-8d00-78d9bf75291f'::uuid,
    'ab189ed3-cdf6-449e-a6db-ec2c39738ef5'::uuid,
    '4529e4ac-06ba-4a7d-97c9-b5de7db2b1ff'::uuid,
    'ee2a6797-61b3-4dd2-b5e5-7e537b10f16c'::uuid
  ]) AS participacion_id
)
SELECT COUNT(*)::integer AS filas_elegibles_preview
FROM target_ids t
INNER JOIN public.jugador_participaciones jp ON jp.id = t.participacion_id
INNER JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
LEFT JOIN public.career_event_host_manual_overrides o
  ON o.tipo_evento = jp.tipo_evento::text AND o.evento_id = trim(jp.evento_id::text)
WHERE COALESCE(jp.metadata->>'ranking_puntos_esquema', '') = 'riviera_open_v1'
  AND rj.organizador_id = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'::uuid
  AND jp.metadata->>'organizador_id' = 'e724de97-3552-4a01-a269-f621e6f1ed26'
  AND jp.metadata->>'repair_reason' = 'manual_override_parent_deleted'
  AND COALESCE(jp.metadata->>'manual_override_approved_at', '') LIKE '2026-07-06%'
  AND NOT public._riviera_participacion_parent_row_exists(jp.tipo_evento::text, jp.evento_id::text)
  AND o.organizador_id = 'e724de97-3552-4a01-a269-f621e6f1ed26'::uuid;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2) BACKUP — ejecutar ANTES del UPDATE
-- ═══════════════════════════════════════════════════════════════════════════
/*
DROP TABLE IF EXISTS public._backup_jp_metadata_20260707_riviera_open_16;

CREATE TABLE public._backup_jp_metadata_20260707_riviera_open_16 AS
SELECT
  jp.id AS participacion_id,
  jp.jugador_id,
  jp.evento_id,
  jp.tipo_evento,
  jp.evento_nombre,
  jp.puntos_obtenidos,
  jp.metadata AS metadata_before,
  now() AT TIME ZONE 'utc' AS backed_up_at
FROM public.jugador_participaciones jp
WHERE jp.id IN (
  '48a8cd17-70c1-47b1-bc05-4e4932bc0c18',
  'af969403-28ec-4aa4-8638-22121b3b7591',
  '47e16c96-4658-4590-a194-ab1c8dce491c',
  '97d04a08-8d28-4cf8-9baa-7302c6a7be6b',
  '6425dfbf-4ce2-4b42-a0f6-0a0a5cdaf628',
  '62e3798e-6edc-49fa-ae6a-fe7f2026999f',
  '08ba6460-a0ef-46d7-9a6c-be62c8b0ba09',
  'dca25cba-e9eb-47ea-8378-76eb22f0c0a8',
  'fb56fea8-a64c-4968-9406-8efdd71986ee',
  '9df31843-d19f-43ec-accd-48f5a23369e1',
  'a169fa6b-32e6-4504-95e6-a74f3af927f8',
  'c211351e-401c-4e03-b42f-87942ccec04a',
  'a8ef7057-ef5b-40e4-8d00-78d9bf75291f',
  'ab189ed3-cdf6-449e-a6db-ec2c39738ef5',
  '4529e4ac-06ba-4a7d-97c9-b5de7db2b1ff',
  'ee2a6797-61b3-4dd2-b5e5-7e537b10f16c'
);

SELECT COUNT(*)::integer AS filas_respaldadas
FROM public._backup_jp_metadata_20260707_riviera_open_16;
-- Esperado: 16
*/


-- ═══════════════════════════════════════════════════════════════════════════
-- 3) UPDATE — descomentar tras backup + PREVIEW = 16
-- ═══════════════════════════════════════════════════════════════════════════
/*
BEGIN;

UPDATE public.jugador_participaciones jp
SET metadata = COALESCE(jp.metadata, '{}'::jsonb)
  || jsonb_build_object(
    'organizador_id', '2770b522-9064-4c7b-a729-4a0ea7e3f6e8',
    'club_name', COALESCE(
      public.get_organizador_display_name('2770b522-9064-4c7b-a729-4a0ea7e3f6e8'::uuid),
      'Riviera Open'
    ),
    'repair_reason', 'metadata_organizador_restored_to_riviera_open',
    'integrity_status', 'repaired_ranking_metadata_rule_a',
    'previous_organizador_id', jp.metadata->>'organizador_id',
    'previous_repair_reason', jp.metadata->>'repair_reason',
    'previous_manual_override_approved_at', jp.metadata->>'manual_override_approved_at',
    'metadata_restored_at', to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'metadata_restored_rule', 'A_evento_id_single_truth_riviera_open_v1'
  )
WHERE jp.id IN (
  '48a8cd17-70c1-47b1-bc05-4e4932bc0c18',
  'af969403-28ec-4aa4-8638-22121b3b7591',
  '47e16c96-4658-4590-a194-ab1c8dce491c',
  '97d04a08-8d28-4cf8-9baa-7302c6a7be6b',
  '6425dfbf-4ce2-4b42-a0f6-0a0a5cdaf628',
  '62e3798e-6edc-49fa-ae6a-fe7f2026999f',
  '08ba6460-a0ef-46d7-9a6c-be62c8b0ba09',
  'dca25cba-e9eb-47ea-8378-76eb22f0c0a8',
  'fb56fea8-a64c-4968-9406-8efdd71986ee',
  '9df31843-d19f-43ec-accd-48f5a23369e1',
  'a169fa6b-32e6-4504-95e6-a74f3af927f8',
  'c211351e-401c-4e03-b42f-87942ccec04a',
  'a8ef7057-ef5b-40e4-8d00-78d9bf75291f',
  'ab189ed3-cdf6-449e-a6db-ec2c39738ef5',
  '4529e4ac-06ba-4a7d-97c9-b5de7db2b1ff',
  'ee2a6797-61b3-4dd2-b5e5-7e537b10f16c'
)
AND EXISTS (
  SELECT 1
  FROM public.riviera_jugadores rj
  WHERE rj.id = jp.jugador_id
    AND rj.organizador_id = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'::uuid
)
AND COALESCE(jp.metadata->>'ranking_puntos_esquema', '') = 'riviera_open_v1'
AND jp.metadata->>'organizador_id' = 'e724de97-3552-4a01-a269-f621e6f1ed26'
AND jp.metadata->>'repair_reason' = 'manual_override_parent_deleted'
AND COALESCE(jp.metadata->>'manual_override_approved_at', '') LIKE '2026-07-06%'
AND NOT public._riviera_participacion_parent_row_exists(jp.tipo_evento::text, jp.evento_id::text)
AND EXISTS (
  SELECT 1
  FROM public.career_event_host_manual_overrides o
  WHERE o.tipo_evento = jp.tipo_evento::text
    AND o.evento_id = trim(jp.evento_id::text)
    AND o.organizador_id = 'e724de97-3552-4a01-a269-f621e6f1ed26'::uuid
);

-- Debe afectar exactamente 16 filas. Si ROW_COUNT <> 16 → ROLLBACK.
-- SELECT COUNT(*) FROM jugador_participaciones WHERE metadata->>'metadata_restored_rule' = 'A_evento_id_single_truth_riviera_open_v1';

DO $$
DECLARE v_jid uuid;
BEGIN
  FOR v_jid IN
    SELECT DISTINCT b.jugador_id
    FROM public._backup_jp_metadata_20260707_riviera_open_16 b
  LOOP
    PERFORM public.refresh_jugador_stats(v_jid);
  END LOOP;
END $$;

-- Validar sección 4 antes de COMMIT. Si no cuadra: ROLLBACK;
COMMIT;
*/


-- ═══════════════════════════════════════════════════════════════════════════
-- 4) VERIFICACIÓN POST-UPDATE (metadata resuelta = lo que lee la app)
-- ═══════════════════════════════════════════════════════════════════════════
WITH expected AS (
  SELECT * FROM (VALUES
    ('Nevyl',       'RIV-00000011', 120,  50, 170),
    ('Daniel N',    'RIV-00000009',  75,  75, 150),
    ('Sebastian',   'RIV-00000024',  25,  25,  50),
    ('Alejandro R', 'RIV-00000003',  75,   0,  75),
    ('Edgardo T',   'RIV-00000031', 120,   0, 120),
    ('Irving',      'RIV-00000019', 100,   0, 100),
    ('David R',     'RIV-00000041', 600,   0, 600)
  ) AS e(jugador_nombre, riviera_id, ro_esperado, hp_esperado, total_esperado)
),
riviera_universe AS (
  SELECT
    i.riviera_id::text AS riviera_id,
    COALESCE(
      i.canonical_riviera_jugador_id,
      (SELECT pl.riviera_jugador_id FROM public.riviera_official_player_profile_link pl
       WHERE pl.official_player_key = i.official_player_key LIMIT 1)
    ) AS anchor_jugador_id,
    COALESCE(rj_canon.nombre, '?') AS jugador_nombre
  FROM public.riviera_official_player_identity i
  LEFT JOIN public.riviera_jugadores rj_canon ON rj_canon.id = i.canonical_riviera_jugador_id
),
actual AS (
  SELECT
    ru.jugador_nombre,
    ru.riviera_id,
    COALESCE(SUM(jp.puntos_obtenidos) FILTER (
      WHERE COALESCE(NULLIF(trim(jp.metadata->>'organizador_id'), ''), rj.organizador_id::text)
        = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'
    ), 0)::integer AS ro_actual,
    COALESCE(SUM(jp.puntos_obtenidos) FILTER (
      WHERE COALESCE(NULLIF(trim(jp.metadata->>'organizador_id'), ''), rj.organizador_id::text)
        = 'e724de97-3552-4a01-a269-f621e6f1ed26'
    ), 0)::integer AS hp_actual
  FROM riviera_universe ru
  CROSS JOIN LATERAL (
    SELECT g.jugador_id FROM public.get_public_career_jugador_ids(ru.anchor_jugador_id) AS g(jugador_id)
  ) ids
  JOIN public.jugador_participaciones jp ON jp.jugador_id = ids.jugador_id
  JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  WHERE ru.anchor_jugador_id IS NOT NULL
    AND rj.estado = 'activo'
    AND COALESCE(rj.suma_ranking, true) = true
    AND NOT public.is_jugador_participacion_excluded(jp.jugador_id, jp.tipo_evento::text, jp.evento_id)
  GROUP BY ru.jugador_nombre, ru.riviera_id
)
SELECT
  e.jugador_nombre AS jugador,
  e.riviera_id,
  a.ro_actual AS riviera_open_pts,
  a.hp_actual AS hackpadel_pts,
  (a.ro_actual + a.hp_actual) AS total_pts,
  e.ro_esperado,
  e.hp_esperado,
  e.total_esperado,
  (a.ro_actual - e.ro_esperado) AS diff_ro,
  (a.hp_actual - e.hp_esperado) AS diff_hp,
  CASE
    WHEN a.ro_actual = e.ro_esperado AND a.hp_actual = e.hp_esperado THEN 'OK'
    ELSE 'REVISAR'
  END AS estado
FROM expected e
LEFT JOIN actual a ON a.riviera_id = e.riviera_id AND a.jugador_nombre = e.jugador_nombre
ORDER BY e.jugador_nombre;

-- 4b) Las 16 filas deben tener metadata = Riviera Open
SELECT
  jp.id AS participacion_id,
  rj.nombre AS jugador,
  jp.evento_nombre,
  jp.metadata->>'organizador_id' AS metadata_org,
  jp.metadata->>'repair_reason' AS repair_reason
FROM public.jugador_participaciones jp
JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
WHERE jp.id IN (
  '48a8cd17-70c1-47b1-bc05-4e4932bc0c18',
  'af969403-28ec-4aa4-8638-22121b3b7591',
  '47e16c96-4658-4590-a194-ab1c8dce491c',
  '97d04a08-8d28-4cf8-9baa-7302c6a7be6b',
  '6425dfbf-4ce2-4b42-a0f6-0a0a5cdaf628',
  '62e3798e-6edc-49fa-ae6a-fe7f2026999f',
  '08ba6460-a0ef-46d7-9a6c-be62c8b0ba09',
  'dca25cba-e9eb-47ea-8378-76eb22f0c0a8',
  'fb56fea8-a64c-4968-9406-8efdd71986ee',
  '9df31843-d19f-43ec-accd-48f5a23369e1',
  'a169fa6b-32e6-4504-95e6-a74f3af927f8',
  'c211351e-401c-4e03-b42f-87942ccec04a',
  'a8ef7057-ef5b-40e4-8d00-78d9bf75291f',
  'ab189ed3-cdf6-449e-a6db-ec2c39738ef5',
  '4529e4ac-06ba-4a7d-97c9-b5de7db2b1ff',
  'ee2a6797-61b3-4dd2-b5e5-7e537b10f16c'
)
ORDER BY rj.nombre, jp.evento_nombre;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5) ROLLBACK — restaurar metadata exacta desde backup
-- ═══════════════════════════════════════════════════════════════════════════
/*
BEGIN;

UPDATE public.jugador_participaciones jp
SET metadata = b.metadata_before
FROM public._backup_jp_metadata_20260707_riviera_open_16 b
WHERE jp.id = b.participacion_id;

DO $$
DECLARE v_jid uuid;
BEGIN
  FOR v_jid IN
    SELECT DISTINCT b.jugador_id
    FROM public._backup_jp_metadata_20260707_riviera_open_16 b
  LOOP
    PERFORM public.refresh_jugador_stats(v_jid);
  END LOOP;
END $$;

COMMIT;

-- Verificar rollback: metadata vuelve a Hackpadel en las 16 filas
SELECT jp.id, jp.metadata->>'organizador_id'
FROM public.jugador_participaciones jp
WHERE jp.id IN (SELECT participacion_id FROM public._backup_jp_metadata_20260707_riviera_open_16);
*/
