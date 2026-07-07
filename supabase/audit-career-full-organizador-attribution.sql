-- ═══════════════════════════════════════════════════════════════════════════
-- AUDITORÍA READ-ONLY: carrera deportiva completa — atribución de organizador
--
-- Alcance: TODOS los jugadores con Riviera ID oficial + todas sus participaciones
-- visibles en carrera pública (get_public_career_jugador_ids).
--
-- PRINCIPIOS (no negociables en este script):
--   • NO ejecuta UPDATE / INSERT / DELETE
--   • NO propone repairs
--   • NO asume que career_event_host_manual_overrides sea correcto
--   • Muestra cada fuente por separado: perfil, metadata, parent vivo, override
--   • Objetivo: reconstruir historia y detectar cuándo empezó la inconsistencia
--
-- IDs club prod (referencia):
--   Riviera Open  2770b522-9064-4c7b-a729-4a0ea7e3f6e8
--   Hackpadel      e724de97-3552-4a01-a269-f621e6f1ed26
--
-- LIMITACIONES CONOCIDAS (leer antes de interpretar):
--   • jugador_participaciones NO tiene columna updated_at; usamos
--     metadata.manual_override_approved_at como proxy del repair 6-jul.
--   • El repair del 6-jul NO guardó previous_organizador_id en metadata;
--     sin tabla _backup_* el valor anterior NO es recuperable desde DB.
--   • override.organizador_id se muestra tal cual en tabla; NO se asume correcto.
--   • organizer_del_evento / parent = solo si el padre AÚN existe en DB.
--     Si el padre fue eliminado, ambos son NULL (no se infiere desde override).
--
--   get_public_career_jugador_ids
--   riviera_participacion_expected_host_org
--   _riviera_participacion_parent_row_exists
--   is_jugador_participacion_excluded
--   get_organizador_display_name
--
-- Ejecutar sección por sección en Supabase SQL Editor (service role).
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
-- A0) Inventario de overrides (NO son verdad — solo estado actual de la tabla)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  o.id AS override_id,
  o.tipo_evento,
  o.evento_id,
  o.evento_nombre,
  o.organizador_id AS override_organizador_id,
  public.get_organizador_display_name(o.organizador_id) AS override_club,
  o.club_name AS override_club_name_raw,
  o.approved_by,
  o.approved_at AS override_approved_at,
  o.created_at AS override_created_at,
  o.reason AS override_reason,
  (o.approved_at AT TIME ZONE 'utc')::date = DATE '2026-07-06' AS override_touch_2026_07_06,
  (o.created_at AT TIME ZONE 'utc')::date = DATE '2026-07-06' AS override_created_2026_07_06
FROM public.career_event_host_manual_overrides o
ORDER BY o.approved_at, o.evento_nombre, o.evento_id;


-- ═══════════════════════════════════════════════════════════════════════════
-- CTE base reutilizable (copiar mentalmente en cada sección si el editor
-- no permite múltiples statements con CTE compartido)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── A1) DETALLE: TODA participación de TODA carrera con Riviera ID ─────────
WITH riviera_universe AS (
  SELECT
    i.riviera_id::text AS riviera_id,
    i.official_player_key,
    COALESCE(
      i.canonical_riviera_jugador_id,
      (
        SELECT pl.riviera_jugador_id
        FROM public.riviera_official_player_profile_link pl
        WHERE pl.official_player_key = i.official_player_key
        ORDER BY pl.created_at NULLS LAST
        LIMIT 1
      )
    ) AS anchor_jugador_id,
    COALESCE(
      rj_canon.nombre,
      (
        SELECT rj2.nombre
        FROM public.riviera_official_player_profile_link pl2
        JOIN public.riviera_jugadores rj2 ON rj2.id = pl2.riviera_jugador_id
        WHERE pl2.official_player_key = i.official_player_key
        ORDER BY pl2.created_at NULLS LAST
        LIMIT 1
      ),
      '?'
    ) AS jugador_nombre
  FROM public.riviera_official_player_identity i
  LEFT JOIN public.riviera_jugadores rj_canon
    ON rj_canon.id = i.canonical_riviera_jugador_id
),
career_rows AS (
  SELECT
    ru.riviera_id,
    ru.jugador_nombre,
    ru.anchor_jugador_id,
    jp.id AS participacion_id,
    jp.jugador_id AS perfil_id,
    jp.tipo_evento,
    jp.evento_id,
    jp.evento_nombre AS evento,
    jp.fecha,
    COALESCE(
      NULLIF(trim(jp.metadata->>'jugador_categoria'), ''),
      NULLIF(trim(rj.categoria), '')
    ) AS categoria,
    jp.puntos_obtenidos AS puntos,
    jp.resultado,
    jp.metadata,
    jp.created_at,
    rj.organizador_id AS perfil_organizador_id,
    public.get_organizador_display_name(rj.organizador_id) AS perfil_organizador_nombre,
    public._riviera_participacion_parent_row_exists(
      jp.tipo_evento::text,
      jp.evento_id::text
    ) AS parent_event_existe,
    public.riviera_participacion_expected_host_org(
      jp.tipo_evento::text,
      jp.evento_id::text
    ) AS parent_event_organizador_id,
    o.id AS override_id,
    o.organizador_id AS override_organizador_id,
    o.club_name AS override_club_name,
    o.approved_at AS override_table_approved_at,
    o.created_at AS override_table_created_at,
    o.reason AS override_table_reason
  FROM riviera_universe ru
  CROSS JOIN LATERAL (
    SELECT g.jugador_id
    FROM public.get_public_career_jugador_ids(ru.anchor_jugador_id) AS g(jugador_id)
  ) career_ids
  JOIN public.jugador_participaciones jp
    ON jp.jugador_id = career_ids.jugador_id
  JOIN public.riviera_jugadores rj
    ON rj.id = jp.jugador_id
  LEFT JOIN public.career_event_host_manual_overrides o
    ON o.tipo_evento = jp.tipo_evento::text
   AND o.evento_id = trim(jp.evento_id::text)
  WHERE ru.anchor_jugador_id IS NOT NULL
    AND rj.estado = 'activo'
    AND COALESCE(rj.suma_ranking, true) = true
    AND NOT public.is_jugador_participacion_excluded(
      jp.jugador_id,
      jp.tipo_evento::text,
      jp.evento_id
    )
),
enriched AS (
  SELECT
    cr.*,
    NULLIF(trim(cr.metadata->>'organizador_id'), '') AS metadata_organizador_id,
    NULLIF(trim(cr.metadata->>'repair_reason'), '') AS metadata_repair_reason,
    NULLIF(trim(cr.metadata->>'manual_override_id'), '') AS metadata_manual_override_id,
    NULLIF(trim(cr.metadata->>'manual_override_approved_at'), '') AS metadata_manual_override_approved_at,
    (cr.metadata->>'repair_reason' = 'manual_override_parent_deleted') AS manual_override_parent_deleted,
    NULLIF(trim(cr.metadata->>'previous_organizador_id'), '') AS metadata_previous_organizador_id,
  -- evento_organizador = club del padre VIVO (tabla tournaments/duelos/etc.)
  -- NULL si el padre fue eliminado — NO se rellena con override
    CASE
      WHEN cr.parent_event_existe THEN cr.parent_event_organizador_id
      ELSE NULL
    END AS evento_organizador_id,
    public.get_organizador_display_name(
      CASE WHEN cr.parent_event_existe THEN cr.parent_event_organizador_id END
    ) AS evento_organizador_nombre,
    public.get_organizador_display_name(cr.parent_event_organizador_id)
      AS parent_event_organizador_nombre,
    public.get_organizador_display_name(cr.override_organizador_id)
      AS override_organizador_nombre,
    COALESCE(
      NULLIF(trim(cr.metadata->>'manual_override_approved_at'), '')::timestamptz,
      cr.override_table_approved_at,
      cr.created_at
    ) AS updated_at_efectivo,
    (
      SELECT COUNT(DISTINCT v)
      FROM unnest(ARRAY[
        NULLIF(trim(cr.metadata->>'organizador_id'), ''),
        cr.perfil_organizador_id::text,
        CASE WHEN cr.parent_event_existe THEN cr.parent_event_organizador_id::text END,
        cr.override_organizador_id::text
      ]) AS u(v)
      WHERE v IS NOT NULL
    ) AS fuentes_organizador_distintas
  FROM career_rows cr
)
SELECT
  jugador_nombre AS jugador,
  riviera_id,
  participacion_id,
  perfil_id,
  perfil_organizador_nombre AS perfil_organizador,
  perfil_organizador_id,
  evento,
  fecha,
  categoria,
  puntos,
  metadata_organizador_id,
  metadata_repair_reason,
  perfil_organizador_id AS organizer_del_perfil,
  evento_organizador_id AS organizer_del_evento,
  evento_organizador_nombre AS organizer_del_evento_nombre,
  CASE WHEN parent_event_existe THEN parent_event_organizador_id END AS organizer_del_parent,
  parent_event_organizador_nombre AS organizer_del_parent_nombre,
  parent_event_existe,
  override_organizador_id AS organizer_del_override,
  override_organizador_nombre AS organizer_del_override_nombre,
  override_id,
  override_table_approved_at,
  override_table_created_at,
  override_table_reason,
  manual_override_parent_deleted,
  metadata_manual_override_approved_at AS manual_override_approved_at,
  metadata_manual_override_id,
  metadata_previous_organizador_id,
  resultado,
  COALESCE(
    NULLIF(trim(metadata->>'lugar'), ''),
    CASE
      WHEN NULLIF(trim(metadata->>'posicion_final'), '') IS NOT NULL
        THEN 'pos ' || (metadata->>'posicion_final')
      WHEN NULLIF(trim(metadata->>'posicion'), '') IS NOT NULL
        THEN 'pos ' || (metadata->>'posicion')
      ELSE NULL
    END
  ) AS posicion,
  created_at,
  updated_at_efectivo AS updated_at,
  fuentes_organizador_distintas
FROM enriched
ORDER BY jugador_nombre, fecha DESC NULLS LAST, evento, participacion_id;


-- ═══════════════════════════════════════════════════════════════════════════
-- A2) RESUMEN por jugador — TODOS con Riviera ID
--     Puntos y eventos por metadata.organizador_id (desglose que usa la app hoy)
-- ═══════════════════════════════════════════════════════════════════════════
WITH riviera_universe AS (
  SELECT
    i.riviera_id::text AS riviera_id,
    COALESCE(
      i.canonical_riviera_jugador_id,
      (
        SELECT pl.riviera_jugador_id
        FROM public.riviera_official_player_profile_link pl
        WHERE pl.official_player_key = i.official_player_key
        LIMIT 1
      )
    ) AS anchor_jugador_id,
    COALESCE(rj_canon.nombre, '?') AS jugador_nombre
  FROM public.riviera_official_player_identity i
  LEFT JOIN public.riviera_jugadores rj_canon
    ON rj_canon.id = i.canonical_riviera_jugador_id
),
rows AS (
  SELECT
    ru.jugador_nombre AS jugador,
    ru.riviera_id,
    jp.id AS participacion_id,
    jp.tipo_evento,
    jp.evento_id,
    jp.puntos_obtenidos,
    COALESCE(
      NULLIF(trim(jp.metadata->>'organizador_id'), ''),
      rj.organizador_id::text
    ) AS org_metadata_o_perfil,
    (jp.metadata->>'repair_reason' = 'manual_override_parent_deleted'
      AND COALESCE(jp.metadata->>'manual_override_approved_at', '') LIKE '2026-07-06%'
    ) AS repair_6_jul
  FROM riviera_universe ru
  CROSS JOIN LATERAL (
    SELECT g.jugador_id
    FROM public.get_public_career_jugador_ids(ru.anchor_jugador_id) AS g(jugador_id)
  ) ids
  JOIN public.jugador_participaciones jp ON jp.jugador_id = ids.jugador_id
  JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  WHERE ru.anchor_jugador_id IS NOT NULL
    AND rj.estado = 'activo'
    AND COALESCE(rj.suma_ranking, true) = true
    AND NOT public.is_jugador_participacion_excluded(
      jp.jugador_id, jp.tipo_evento::text, jp.evento_id
    )
)
SELECT
  jugador,
  riviera_id,
  COUNT(*)::integer AS total_participaciones,
  COALESCE(SUM(puntos_obtenidos) FILTER (
    WHERE org_metadata_o_perfil = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'
  ), 0)::integer AS puntos_riviera_open,
  COALESCE(SUM(puntos_obtenidos) FILTER (
    WHERE org_metadata_o_perfil = 'e724de97-3552-4a01-a269-f621e6f1ed26'
  ), 0)::integer AS puntos_hackpadel,
  COALESCE(SUM(puntos_obtenidos) FILTER (
    WHERE org_metadata_o_perfil NOT IN (
      '2770b522-9064-4c7b-a729-4a0ea7e3f6e8',
      'e724de97-3552-4a01-a269-f621e6f1ed26'
    )
  ), 0)::integer AS puntos_otros_clubes,
  COALESCE(SUM(puntos_obtenidos), 0)::integer AS total_puntos,
  COUNT(DISTINCT (tipo_evento, evento_id)) FILTER (
    WHERE org_metadata_o_perfil = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'
      AND COALESCE(puntos_obtenidos, 0) <> 0
  )::integer AS eventos_riviera_open,
  COUNT(DISTINCT (tipo_evento, evento_id)) FILTER (
    WHERE org_metadata_o_perfil = 'e724de97-3552-4a01-a269-f621e6f1ed26'
      AND COALESCE(puntos_obtenidos, 0) <> 0
  )::integer AS eventos_hackpadel,
  COUNT(DISTINCT (tipo_evento, evento_id)) FILTER (
    WHERE org_metadata_o_perfil NOT IN (
      '2770b522-9064-4c7b-a729-4a0ea7e3f6e8',
      'e724de97-3552-4a01-a269-f621e6f1ed26'
    )
      AND COALESCE(puntos_obtenidos, 0) <> 0
  )::integer AS eventos_otros_clubes,
  COUNT(*) FILTER (WHERE repair_6_jul)::integer AS participaciones_repair_6_jul
FROM rows
GROUP BY jugador, riviera_id
ORDER BY jugador;


-- A2b) Mismo resumen pero SOLO filas con puntos <> 0 (ranking efectivo)
WITH riviera_universe AS (
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
rows AS (
  SELECT
    ru.jugador_nombre AS jugador,
    ru.riviera_id,
    jp.puntos_obtenidos,
    COALESCE(NULLIF(trim(jp.metadata->>'organizador_id'), ''), rj.organizador_id::text) AS org_resuelto
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
    AND COALESCE(jp.puntos_obtenidos, 0) <> 0
)
SELECT
  jugador,
  riviera_id,
  COUNT(*)::integer AS total_participaciones_con_puntos,
  COALESCE(SUM(puntos_obtenidos) FILTER (WHERE org_resuelto = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'), 0)::integer AS puntos_riviera_open,
  COALESCE(SUM(puntos_obtenidos) FILTER (WHERE org_resuelto = 'e724de97-3552-4a01-a269-f621e6f1ed26'), 0)::integer AS puntos_hackpadel,
  COALESCE(SUM(puntos_obtenidos) FILTER (WHERE org_resuelto NOT IN (
    '2770b522-9064-4c7b-a729-4a0ea7e3f6e8', 'e724de97-3552-4a01-a269-f621e6f1ed26'
  )), 0)::integer AS puntos_otros_clubes,
  COALESCE(SUM(puntos_obtenidos), 0)::integer AS total,
  COUNT(DISTINCT org_resuelto) FILTER (WHERE org_resuelto = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8')::integer AS eventos_riviera_open,
  COUNT(DISTINCT org_resuelto) FILTER (WHERE org_resuelto = 'e724de97-3552-4a01-a269-f621e6f1ed26')::integer AS eventos_hackpadel,
  COUNT(DISTINCT org_resuelto) FILTER (WHERE org_resuelto NOT IN (
    '2770b522-9064-4c7b-a729-4a0ea7e3f6e8', 'e724de97-3552-4a01-a269-f621e6f1ed26'
  ))::integer AS eventos_otros_clubes
FROM rows
GROUP BY jugador, riviera_id
ORDER BY jugador;


-- ═══════════════════════════════════════════════════════════════════════════
-- B) DISCREPANCIAS: participaciones donde alguna fuente difiere de otra
--    (metadata vs perfil vs parent vivo vs override — sin coalescer)
-- ═══════════════════════════════════════════════════════════════════════════
WITH riviera_universe AS (
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
career_rows AS (
  SELECT
    ru.jugador_nombre,
    ru.riviera_id,
    jp.id AS participacion_id,
    jp.jugador_id AS perfil_id,
    jp.evento_nombre,
    jp.fecha,
    jp.puntos_obtenidos,
    jp.metadata,
    jp.created_at,
    rj.organizador_id AS perfil_org_id,
    public._riviera_participacion_parent_row_exists(jp.tipo_evento::text, jp.evento_id::text) AS parent_existe,
    public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text) AS parent_org_id,
    o.organizador_id AS override_org_id,
    o.approved_at AS override_approved_at
  FROM riviera_universe ru
  CROSS JOIN LATERAL (
    SELECT g.jugador_id FROM public.get_public_career_jugador_ids(ru.anchor_jugador_id) AS g(jugador_id)
  ) ids
  JOIN public.jugador_participaciones jp ON jp.jugador_id = ids.jugador_id
  JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  LEFT JOIN public.career_event_host_manual_overrides o
    ON o.tipo_evento = jp.tipo_evento::text AND o.evento_id = trim(jp.evento_id::text)
  WHERE ru.anchor_jugador_id IS NOT NULL
    AND rj.estado = 'activo'
    AND COALESCE(rj.suma_ranking, true) = true
    AND NOT public.is_jugador_participacion_excluded(jp.jugador_id, jp.tipo_evento::text, jp.evento_id)
),
labeled AS (
  SELECT
    cr.*,
    NULLIF(trim(cr.metadata->>'organizador_id'), '') AS metadata_org_id,
    CASE WHEN cr.parent_existe THEN cr.parent_org_id END AS evento_parent_org_id,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN NULLIF(trim(cr.metadata->>'organizador_id'), '') IS NOT NULL
        THEN 'metadata=' || NULLIF(trim(cr.metadata->>'organizador_id'), '') END,
      CASE WHEN cr.perfil_org_id IS NOT NULL
        THEN 'perfil=' || cr.perfil_org_id::text END,
      CASE WHEN cr.parent_existe AND cr.parent_org_id IS NOT NULL
        THEN 'parent=' || cr.parent_org_id::text END,
      CASE WHEN cr.override_org_id IS NOT NULL
        THEN 'override=' || cr.override_org_id::text END
    ], NULL) AS fuentes_presentes
  FROM career_rows cr
),
discrepant AS (
  SELECT
    l.*,
    (
      SELECT COUNT(DISTINCT v)
      FROM unnest(ARRAY[
        l.metadata_org_id,
        l.perfil_org_id::text,
        l.evento_parent_org_id::text,
        l.override_org_id::text
      ]) AS u(v)
      WHERE v IS NOT NULL
    ) AS orgs_distintos
  FROM labeled l
)
SELECT
  jugador_nombre AS jugador,
  riviera_id,
  participacion_id,
  perfil_id,
  evento_nombre,
  fecha,
  puntos_obtenidos,
  public.get_organizador_display_name(metadata_org_id::uuid) AS metadata_club,
  metadata_org_id,
  public.get_organizador_display_name(perfil_org_id) AS perfil_club,
  perfil_org_id,
  public.get_organizador_display_name(evento_parent_org_id) AS parent_club,
  evento_parent_org_id AS parent_org_id,
  parent_existe,
  public.get_organizador_display_name(override_org_id) AS override_club,
  override_org_id,
  override_approved_at,
  metadata->>'repair_reason' AS repair_reason,
  (metadata->>'repair_reason' = 'manual_override_parent_deleted') AS manual_override_parent_deleted,
  metadata->>'manual_override_approved_at' AS manual_override_approved_at,
  fuentes_presentes,
  orgs_distintos,
  CASE
    WHEN metadata_org_id IS DISTINCT FROM perfil_org_id::text AND metadata_org_id IS NOT NULL
      THEN array_append('{}'::text[], 'metadata≠perfil')
    ELSE '{}'::text[]
  END
  || CASE WHEN metadata_org_id IS DISTINCT FROM evento_parent_org_id::text
      AND metadata_org_id IS NOT NULL AND evento_parent_org_id IS NOT NULL
      THEN ARRAY['metadata≠parent'] ELSE '{}'::text[] END
  || CASE WHEN metadata_org_id IS DISTINCT FROM override_org_id::text
      AND metadata_org_id IS NOT NULL AND override_org_id IS NOT NULL
      THEN ARRAY['metadata≠override'] ELSE '{}'::text[] END
  || CASE WHEN perfil_org_id IS DISTINCT FROM evento_parent_org_id
      AND evento_parent_org_id IS NOT NULL
      THEN ARRAY['perfil≠parent'] ELSE '{}'::text[] END
  || CASE WHEN perfil_org_id IS DISTINCT FROM override_org_id
      AND override_org_id IS NOT NULL
      THEN ARRAY['perfil≠override'] ELSE '{}'::text[] END
  || CASE WHEN evento_parent_org_id IS DISTINCT FROM override_org_id
      AND evento_parent_org_id IS NOT NULL AND override_org_id IS NOT NULL
      THEN ARRAY['parent≠override'] ELSE '{}'::text[] END
  AS tipos_discrepancia,
  created_at
FROM discrepant
WHERE orgs_distintos > 1
ORDER BY jugador_nombre, fecha DESC NULLS LAST, evento_nombre, participacion_id;


-- ═══════════════════════════════════════════════════════════════════════════
-- B-filter) Jugadores clave — mismas columnas que B
-- ═══════════════════════════════════════════════════════════════════════════
WITH riviera_universe AS (
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
  WHERE COALESCE(rj_canon.nombre, '?') IN (
    'Nevyl', 'Daniel N', 'Alejandro R', 'Sebastian', 'Edgardo T', 'Irving', 'David R',
    'Aaron Duran', 'Isra', 'Marco M', 'Ricardo S', 'Paco', 'Erick M'
  )
),
career_rows AS (
  SELECT
    ru.jugador_nombre, ru.riviera_id, jp.id AS participacion_id, jp.jugador_id AS perfil_id,
    jp.evento_nombre, jp.fecha, jp.puntos_obtenidos, jp.metadata, jp.created_at,
    rj.organizador_id AS perfil_org_id,
    public._riviera_participacion_parent_row_exists(jp.tipo_evento::text, jp.evento_id::text) AS parent_existe,
    public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text) AS parent_org_id,
    o.organizador_id AS override_org_id,
    o.approved_at AS override_approved_at
  FROM riviera_universe ru
  CROSS JOIN LATERAL (
    SELECT g.jugador_id FROM public.get_public_career_jugador_ids(ru.anchor_jugador_id) AS g(jugador_id)
  ) ids
  JOIN public.jugador_participaciones jp ON jp.jugador_id = ids.jugador_id
  JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  LEFT JOIN public.career_event_host_manual_overrides o
    ON o.tipo_evento = jp.tipo_evento::text AND o.evento_id = trim(jp.evento_id::text)
  WHERE ru.anchor_jugador_id IS NOT NULL AND rj.estado = 'activo'
    AND COALESCE(rj.suma_ranking, true) = true
    AND NOT public.is_jugador_participacion_excluded(jp.jugador_id, jp.tipo_evento::text, jp.evento_id)
),
labeled AS (
  SELECT cr.*,
    NULLIF(trim(cr.metadata->>'organizador_id'), '') AS metadata_org_id,
    CASE WHEN cr.parent_existe THEN cr.parent_org_id END AS evento_parent_org_id
  FROM career_rows cr
),
discrepant AS (
  SELECT l.*,
    (SELECT COUNT(DISTINCT v) FROM unnest(ARRAY[
      l.metadata_org_id, l.perfil_org_id::text, l.evento_parent_org_id::text, l.override_org_id::text
    ]) AS u(v) WHERE v IS NOT NULL) AS orgs_distintos
  FROM labeled l
)
SELECT
  jugador_nombre AS jugador,
  riviera_id,
  participacion_id,
  evento_nombre,
  fecha,
  puntos_obtenidos,
  public.get_organizador_display_name(metadata_org_id::uuid) AS metadata_club,
  public.get_organizador_display_name(perfil_org_id) AS perfil_club,
  public.get_organizador_display_name(evento_parent_org_id) AS parent_club,
  public.get_organizador_display_name(override_org_id) AS override_club,
  metadata->>'repair_reason' AS repair_reason,
  metadata->>'manual_override_approved_at' AS manual_override_approved_at,
  (
    SELECT array_to_string(ARRAY_REMOVE(ARRAY[
      CASE WHEN metadata_org_id IS DISTINCT FROM perfil_org_id::text AND metadata_org_id IS NOT NULL
        THEN 'metadata≠perfil' END,
      CASE WHEN metadata_org_id IS DISTINCT FROM evento_parent_org_id::text
        AND metadata_org_id IS NOT NULL AND evento_parent_org_id IS NOT NULL
        THEN 'metadata≠parent' END,
      CASE WHEN metadata_org_id IS DISTINCT FROM override_org_id::text
        AND metadata_org_id IS NOT NULL AND override_org_id IS NOT NULL
        THEN 'metadata≠override' END,
      CASE WHEN perfil_org_id IS DISTINCT FROM evento_parent_org_id
        AND evento_parent_org_id IS NOT NULL THEN 'perfil≠parent' END,
      CASE WHEN perfil_org_id IS DISTINCT FROM override_org_id
        AND override_org_id IS NOT NULL THEN 'perfil≠override' END,
      CASE WHEN evento_parent_org_id IS DISTINCT FROM override_org_id
        AND evento_parent_org_id IS NOT NULL AND override_org_id IS NOT NULL
        THEN 'parent≠override' END
    ], NULL), ', ')
  ) AS tipos_discrepancia
FROM discrepant
WHERE orgs_distintos > 1
ORDER BY jugador_nombre, fecha DESC NULLS LAST, evento_nombre;


-- Resumen de discrepancias por jugador
WITH riviera_universe AS (
  SELECT i.riviera_id::text AS riviera_id,
    COALESCE(i.canonical_riviera_jugador_id,
      (SELECT pl.riviera_jugador_id FROM public.riviera_official_player_profile_link pl
       WHERE pl.official_player_key = i.official_player_key LIMIT 1)) AS anchor_jugador_id,
    COALESCE(rj_canon.nombre, '?') AS jugador_nombre
  FROM public.riviera_official_player_identity i
  LEFT JOIN public.riviera_jugadores rj_canon ON rj_canon.id = i.canonical_riviera_jugador_id
),
career_rows AS (
  SELECT ru.jugador_nombre, ru.riviera_id, jp.id, jp.metadata, rj.organizador_id AS perfil_org_id,
    public._riviera_participacion_parent_row_exists(jp.tipo_evento::text, jp.evento_id::text) AS parent_existe,
    public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text) AS parent_org_id,
    o.organizador_id AS override_org_id
  FROM riviera_universe ru
  CROSS JOIN LATERAL (SELECT g.jugador_id FROM public.get_public_career_jugador_ids(ru.anchor_jugador_id) AS g(jugador_id)) ids
  JOIN public.jugador_participaciones jp ON jp.jugador_id = ids.jugador_id
  JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  LEFT JOIN public.career_event_host_manual_overrides o
    ON o.tipo_evento = jp.tipo_evento::text AND o.evento_id = trim(jp.evento_id::text)
  WHERE ru.anchor_jugador_id IS NOT NULL AND rj.estado = 'activo'
    AND COALESCE(rj.suma_ranking, true) = true
    AND NOT public.is_jugador_participacion_excluded(jp.jugador_id, jp.tipo_evento::text, jp.evento_id)
)
SELECT jugador_nombre AS jugador, riviera_id,
  COUNT(*) FILTER (WHERE (
    SELECT COUNT(DISTINCT v) FROM unnest(ARRAY[
      NULLIF(trim(metadata->>'organizador_id'), ''),
      perfil_org_id::text,
      CASE WHEN parent_existe THEN parent_org_id::text END,
      override_org_id::text
    ]) AS u(v) WHERE v IS NOT NULL
  ) > 1)::integer AS participaciones_con_discrepancia,
  COUNT(*)::integer AS total_participaciones
FROM career_rows
GROUP BY jugador_nombre, riviera_id
HAVING COUNT(*) FILTER (WHERE (
  SELECT COUNT(DISTINCT v) FROM unnest(ARRAY[
    NULLIF(trim(metadata->>'organizador_id'), ''),
    perfil_org_id::text,
    CASE WHEN parent_existe THEN parent_org_id::text END,
    override_org_id::text
  ]) AS u(v) WHERE v IS NOT NULL
) > 1) > 0
ORDER BY participaciones_con_discrepancia DESC, jugador;


-- C0) TODAS las participaciones en DB con stamp repair 2026-07-06
--     (incluye perfiles sin Riviera ID — universo completo del repair)
SELECT
  jp.id AS participacion_id,
  rj.nombre AS jugador,
  ident.riviera_id::text AS riviera_id,
  jp.jugador_id AS perfil_id,
  jp.evento_nombre AS evento,
  jp.puntos_obtenidos,
  jp.created_at,
  jp.metadata->>'manual_override_approved_at' AS updated_at_repair,
  jp.metadata->>'previous_organizador_id' AS valor_anterior_metadata,
  jp.metadata->>'organizador_id' AS valor_nuevo_organizador_id,
  jp.metadata->>'repair_reason' AS repair_reason,
  (jp.metadata->>'repair_reason' = 'manual_override_parent_deleted') AS manual_override_parent_deleted,
  jp.metadata->>'manual_override_id' AS manual_override_id,
  jp.metadata AS metadata_completo
FROM public.jugador_participaciones jp
LEFT JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
LEFT JOIN public.riviera_official_player_identity ident
  ON ident.canonical_riviera_jugador_id = jp.jugador_id
WHERE jp.metadata->>'repair_reason' = 'manual_override_parent_deleted'
  AND COALESCE(jp.metadata->>'manual_override_approved_at', '') LIKE '2026-07-06%'
ORDER BY jp.metadata->>'manual_override_approved_at', rj.nombre, jp.evento_nombre;


-- ═══════════════════════════════════════════════════════════════════════════
-- C) REGISTROS TOCados el 2026-07-06 — solo carrera con Riviera ID
--    Ordenados por updated_at efectivo
-- ═══════════════════════════════════════════════════════════════════════════
WITH riviera_universe AS (
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
touch_candidates AS (
  SELECT
    ru.jugador_nombre,
    ru.riviera_id,
    jp.id AS participacion_id,
    jp.evento_nombre,
    jp.puntos_obtenidos,
    jp.metadata,
    jp.created_at,
    NULLIF(trim(jp.metadata->>'organizador_id'), '') AS valor_nuevo_organizador_id,
    NULLIF(trim(jp.metadata->>'previous_organizador_id'), '') AS valor_anterior_desde_metadata,
    NULLIF(trim(jp.metadata->>'repair_reason'), '') AS repair_reason,
    (jp.metadata->>'repair_reason' = 'manual_override_parent_deleted') AS manual_override_parent_deleted,
    NULLIF(trim(jp.metadata->>'manual_override_approved_at'), '') AS metadata_manual_override_approved_at,
    o.organizador_id AS override_organizador_id,
    o.approved_at AS override_table_approved_at,
    COALESCE(
      NULLIF(trim(jp.metadata->>'manual_override_approved_at'), '')::timestamptz,
      o.approved_at
    ) AS updated_at_efectivo
  FROM riviera_universe ru
  CROSS JOIN LATERAL (
    SELECT g.jugador_id FROM public.get_public_career_jugador_ids(ru.anchor_jugador_id) AS g(jugador_id)
  ) ids
  JOIN public.jugador_participaciones jp ON jp.jugador_id = ids.jugador_id
  JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  LEFT JOIN public.career_event_host_manual_overrides o
    ON o.tipo_evento = jp.tipo_evento::text AND o.evento_id = trim(jp.evento_id::text)
  WHERE ru.anchor_jugador_id IS NOT NULL
    AND rj.estado = 'activo'
    AND COALESCE(rj.suma_ranking, true) = true
    AND NOT public.is_jugador_participacion_excluded(jp.jugador_id, jp.tipo_evento::text, jp.evento_id)
    AND (
      COALESCE(jp.metadata->>'manual_override_approved_at', '') LIKE '2026-07-06%'
      OR (jp.metadata->>'repair_reason' = 'manual_override_parent_deleted'
          AND COALESCE(jp.metadata->>'manual_override_approved_at', '') LIKE '2026-07-06%')
      OR (o.approved_at AT TIME ZONE 'utc')::date = DATE '2026-07-06'
    )
)
SELECT
  participacion_id,
  jugador_nombre AS jugador,
  riviera_id,
  evento_nombre AS evento,
  puntos_obtenidos,
  updated_at_efectivo AS updated_at,
  created_at,
  COALESCE(
    valor_anterior_desde_metadata,
    '(sin valor anterior en metadata — participación creada ' || created_at::text || ')'
  ) AS valor_anterior_organizador_id,
  valor_nuevo_organizador_id,
  public.get_organizador_display_name(valor_anterior_desde_metadata::uuid) AS club_anterior,
  public.get_organizador_display_name(valor_nuevo_organizador_id::uuid) AS club_nuevo,
  repair_reason,
  manual_override_parent_deleted,
  metadata_manual_override_approved_at AS manual_override_approved_at,
  override_organizador_id,
  override_table_approved_at
FROM touch_candidates
ORDER BY updated_at_efectivo NULLS LAST, jugador_nombre, evento_nombre;


-- C1b) Con backup de tabla si existe (ejecutar aparte tras crear _backup_jp_metadata_*)
/*
WITH touch_candidates AS ( ... mismo CTE de arriba ... )
SELECT
  tc.participacion_id,
  tc.jugador_nombre,
  b.metadata_before->>'organizador_id' AS valor_anterior_backup,
  tc.valor_nuevo_organizador_id AS valor_nuevo,
  b.metadata_before,
  b.backed_up_at
FROM touch_candidates tc
LEFT JOIN public._backup_jp_metadata_20260707_ranking b
  ON b.participacion_id = tc.participacion_id
ORDER BY tc.updated_at_efectivo;
*/


-- C2) Conteo global repair 6-jul
SELECT
  COUNT(*)::integer AS participaciones_tocadas_2026_07_06,
  COUNT(DISTINCT jp.jugador_id)::integer AS perfiles_distintos,
  COALESCE(SUM(jp.puntos_obtenidos), 0)::integer AS puntos_en_filas_tocadas
FROM public.jugador_participaciones jp
WHERE jp.metadata->>'repair_reason' = 'manual_override_parent_deleted'
  AND COALESCE(jp.metadata->>'manual_override_approved_at', '') LIKE '2026-07-06%';


-- C3) Overrides con timestamp 2026-07-06 (tabla, no metadata)
SELECT *
FROM public.career_event_host_manual_overrides o
WHERE (o.approved_at AT TIME ZONE 'utc')::date = DATE '2026-07-06'
   OR (o.created_at AT TIME ZONE 'utc')::date = DATE '2026-07-06'
ORDER BY o.approved_at, o.evento_nombre;


-- ═══════════════════════════════════════════════════════════════════════════
-- D) Línea de tiempo: primera y última inconsistencia por jugador
--    (útil para ver cuándo empezó el problema)
-- ═══════════════════════════════════════════════════════════════════════════
WITH riviera_universe AS (
  SELECT i.riviera_id::text AS riviera_id,
    COALESCE(i.canonical_riviera_jugador_id,
      (SELECT pl.riviera_jugador_id FROM public.riviera_official_player_profile_link pl
       WHERE pl.official_player_key = i.official_player_key LIMIT 1)) AS anchor_jugador_id,
    COALESCE(rj_canon.nombre, '?') AS jugador_nombre
  FROM public.riviera_official_player_identity i
  LEFT JOIN public.riviera_jugadores rj_canon ON rj_canon.id = i.canonical_riviera_jugador_id
),
career_rows AS (
  SELECT ru.jugador_nombre, ru.riviera_id, jp.fecha, jp.created_at, jp.evento_nombre,
    (
      SELECT COUNT(DISTINCT v)
      FROM unnest(ARRAY[
        NULLIF(trim(jp.metadata->>'organizador_id'), ''),
        rj.organizador_id::text,
        CASE WHEN public._riviera_participacion_parent_row_exists(jp.tipo_evento::text, jp.evento_id::text)
          THEN public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text)::text END,
        o.organizador_id::text
      ]) AS u(v)
      WHERE v IS NOT NULL
    ) > 1 AS tiene_discrepancia,
    (jp.metadata->>'repair_reason' = 'manual_override_parent_deleted'
      AND COALESCE(jp.metadata->>'manual_override_approved_at', '') LIKE '2026-07-06%') AS repair_6_jul
  FROM riviera_universe ru
  CROSS JOIN LATERAL (SELECT g.jugador_id FROM public.get_public_career_jugador_ids(ru.anchor_jugador_id) AS g(jugador_id)) ids
  JOIN public.jugador_participaciones jp ON jp.jugador_id = ids.jugador_id
  JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  LEFT JOIN public.career_event_host_manual_overrides o
    ON o.tipo_evento = jp.tipo_evento::text AND o.evento_id = trim(jp.evento_id::text)
  WHERE ru.anchor_jugador_id IS NOT NULL AND rj.estado = 'activo'
    AND COALESCE(rj.suma_ranking, true) = true
    AND NOT public.is_jugador_participacion_excluded(jp.jugador_id, jp.tipo_evento::text, jp.evento_id)
)
SELECT
  jugador_nombre AS jugador,
  riviera_id,
  MIN(fecha) FILTER (WHERE tiene_discrepancia) AS primera_fecha_discrepancia,
  MIN(created_at) FILTER (WHERE tiene_discrepancia) AS primera_created_discrepancia,
  MIN(fecha) FILTER (WHERE repair_6_jul) AS primera_fecha_repair_6_jul,
  COUNT(*) FILTER (WHERE tiene_discrepancia)::integer AS total_discrepancias,
  COUNT(*) FILTER (WHERE repair_6_jul)::integer AS total_repair_6_jul
FROM career_rows
GROUP BY jugador_nombre, riviera_id
HAVING COUNT(*) FILTER (WHERE tiene_discrepancia OR repair_6_jul) > 0
ORDER BY primera_fecha_discrepancia NULLS LAST, jugador;
