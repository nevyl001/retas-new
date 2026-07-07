-- ═══════════════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO READ-ONLY: historial completo de carrera por Riviera ID
--
-- Objetivo: tabla evento-por-evento + resumen por jugador ANTES de cualquier
-- UPDATE de metadata.organizador_id.
--
-- Regla de lectura:
--   • evento_organizador_* = club REAL del evento (padre vivo o override manual)
--   • metadata.organizador_id = lo que la app usa hoy para el desglose ranking
--   • perfil_origen = club del perfil riviera_jugadores que posee la fila
--   • NO asumir que todo repair 6-jul debe volver a Riviera Open
--
-- Ejecutar en Supabase SQL Editor (service role). Solo SELECT.
--
-- IDs club (prod):
--   Riviera Open  2770b522-9064-4c7b-a729-4a0ea7e3f6e8
--   Hackpadel      e724de97-3552-4a01-a269-f621e6f1ed26
-- ═══════════════════════════════════════════════════════════════════════════

-- Requiere función de host esperado (deploy diagnose-career-event-host-organizer.sql)
-- CREATE OR REPLACE FUNCTION public.riviera_participacion_expected_host_org ...

-- ── Constantes ────────────────────────────────────────────────────────────
-- repair del 2026-07-06 (UTC) aplicado vía manual_override_approved_at en metadata
-- Filtrar participaciones tocadas ese día por el repair de overrides.

-- ═══════════════════════════════════════════════════════════════════════════
-- 0) Universo: todos los jugadores con Riviera ID oficial
-- ═══════════════════════════════════════════════════════════════════════════
WITH riviera_players AS (
  SELECT
    i.riviera_id::text AS riviera_id,
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
      )
    ) AS jugador_nombre
  FROM public.riviera_official_player_identity i
  LEFT JOIN public.riviera_jugadores rj_canon
    ON rj_canon.id = i.canonical_riviera_jugador_id
),

-- Casos a validar manualmente (filtro opcional en secciones 1–2)
validation_targets AS (
  SELECT * FROM (VALUES
    ('RIV-00000011', 'Nevyl'),
    ('RIV-00000009', 'Daniel N'),
    ('RIV-00000003', 'Alejandro R'),
    ('RIV-00000024', 'Sebastian'),
    ('RIV-00000031', 'Edgardo T'),
    ('RIV-00000019', 'Irving'),
    ('RIV-00000041', 'David R'),
    ('RIV-00000063', 'Lalo E'),
    ('RIV-00000068', 'Tadeo'),
    ('RIV-00000053', 'Said C')
    -- Cesare: sin fila en riviera_official_player_identity en prod al 2026-07-07
  ) AS v(riviera_id, jugador_nombre)
),

career_participaciones AS (
  SELECT
    rp.riviera_id,
    rp.jugador_nombre,
    rp.anchor_jugador_id,
    jp.id AS participacion_id,
    jp.jugador_id AS perfil_jugador_id,
    jp.tipo_evento,
    jp.evento_id,
    jp.evento_nombre,
    jp.fecha AS evento_fecha,
    jp.resultado,
    jp.puntos_obtenidos AS puntos_ranking,
    jp.metadata,
    jp.created_at,
    rj_perfil.organizador_id AS perfil_origen_organizador_id,
    COALESCE(
      public.get_organizador_display_name(rj_perfil.organizador_id),
      rj_perfil.organizador_id::text
    ) AS perfil_origen_club,
    public.riviera_participacion_expected_host_org(
      jp.tipo_evento::text,
      jp.evento_id::text
    ) AS evento_host_desde_padre_id,
    o.organizador_id AS evento_host_override_id,
    o.club_name AS evento_host_override_club,
    o.approved_at AS override_approved_at
  FROM riviera_players rp
  CROSS JOIN LATERAL (
    SELECT g.jugador_id
    FROM public.get_public_career_jugador_ids(rp.anchor_jugador_id) AS g(jugador_id)
  ) career_ids
  JOIN public.jugador_participaciones jp
    ON jp.jugador_id = career_ids.jugador_id
  JOIN public.riviera_jugadores rj_perfil
    ON rj_perfil.id = jp.jugador_id
  LEFT JOIN public.career_event_host_manual_overrides o
    ON o.tipo_evento = jp.tipo_evento::text
   AND o.evento_id = trim(jp.evento_id::text)
  WHERE rp.anchor_jugador_id IS NOT NULL
    AND rj_perfil.estado = 'activo'
    AND COALESCE(rj_perfil.suma_ranking, true) = true
    AND NOT public.is_jugador_participacion_excluded(
      jp.jugador_id,
      jp.tipo_evento::text,
      jp.evento_id
    )
),

enriched AS (
  SELECT
    cp.*,
    COALESCE(cp.evento_host_desde_padre_id, cp.evento_host_override_id) AS evento_organizador_id,
    COALESCE(
      public.get_organizador_display_name(cp.evento_host_desde_padre_id),
      cp.evento_host_override_club,
      public.get_organizador_display_name(cp.evento_host_override_id),
      CASE
        WHEN cp.evento_host_desde_padre_id IS NULL
         AND cp.evento_host_override_id IS NULL
          THEN 'SIN_HOST_CONOCIDO'
        ELSE NULL
      END
    ) AS evento_organizador_nombre,
    NULLIF(trim(cp.metadata->>'organizador_id'), '') AS metadata_organizador_id,
    NULLIF(trim(cp.metadata->>'repair_reason'), '') AS metadata_repair_reason,
    COALESCE(
      NULLIF(trim(cp.metadata->>'organizador_id'), ''),
      cp.perfil_origen_organizador_id::text
    ) AS ranking_organizador_resuelto_id,
    COALESCE(
      public.get_organizador_display_name(
        COALESCE(
          NULLIF(trim(cp.metadata->>'organizador_id'), '')::uuid,
          cp.perfil_origen_organizador_id
        )
      ),
      cp.metadata->>'club_name',
      '—'
    ) AS ranking_club_resuelto,
    NULLIF(trim(cp.metadata->>'posicion'), '') AS metadata_posicion,
    NULLIF(trim(cp.metadata->>'posicion_final'), '') AS metadata_posicion_final,
    NULLIF(trim(cp.metadata->>'lugar'), '') AS metadata_lugar,
    COALESCE(
      NULLIF(trim(cp.metadata->>'manual_override_approved_at'), '')::timestamptz,
      NULLIF(trim(cp.metadata->>'metadata_restored_at'), '')::timestamptz,
      cp.created_at
    ) AS updated_at_efectivo,
    (
      COALESCE(cp.metadata->>'repair_reason', '') = 'manual_override_parent_deleted'
      AND COALESCE(cp.metadata->>'manual_override_approved_at', '')
        LIKE '2026-07-06%'
    ) AS es_repair_6_jul,
    CASE
      WHEN COALESCE(cp.evento_host_desde_padre_id, cp.evento_host_override_id) IS NULL
        THEN 'SIN_HOST'
      WHEN NULLIF(trim(cp.metadata->>'organizador_id'), '') IS NULL
        THEN 'SIN_METADATA_ORG'
      WHEN NULLIF(trim(cp.metadata->>'organizador_id'), '')
        = COALESCE(cp.evento_host_desde_padre_id, cp.evento_host_override_id)::text
        THEN 'OK_METADATA_EQ_EVENTO'
      ELSE 'MISMATCH_METADATA_VS_EVENTO'
    END AS metadata_vs_evento_host
  FROM career_participaciones cp
)

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) DETALLE evento por evento — TODOS los jugadores con Riviera ID
--    (quitar comentario del WHERE para limitar a validation_targets)
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  e.jugador_nombre,
  e.riviera_id,
  e.participacion_id,
  e.perfil_jugador_id,
  e.evento_nombre,
  e.evento_fecha,
  e.tipo_evento,
  e.evento_id,
  e.evento_organizador_nombre,
  e.evento_organizador_id::text AS evento_organizador_id,
  e.metadata_organizador_id,
  e.metadata_repair_reason,
  e.puntos_ranking,
  e.resultado,
  COALESCE(
    e.metadata_lugar,
    CASE
      WHEN e.metadata_posicion_final IS NOT NULL
        THEN 'pos ' || e.metadata_posicion_final
      WHEN e.metadata_posicion IS NOT NULL
        THEN 'pos ' || e.metadata_posicion
      ELSE NULL
    END,
    '—'
  ) AS resultado_posicion,
  COALESCE(e.perfil_origen_club, '—')
    || ' (' || COALESCE(e.perfil_origen_organizador_id::text, '?') || ')'
    AS perfil_origen,
  e.ranking_club_resuelto AS ranking_club_actual,
  e.metadata_vs_evento_host,
  e.es_repair_6_jul,
  e.metadata->>'manual_override_id' AS manual_override_id,
  e.created_at,
  e.updated_at_efectivo AS updated_at
FROM enriched e
-- WHERE e.riviera_id IN (SELECT riviera_id FROM validation_targets)  -- descomentar para subset
ORDER BY e.jugador_nombre, e.evento_fecha DESC NULLS LAST, e.evento_nombre, e.participacion_id;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2) DETALLE — solo casos de validación manual
-- ═══════════════════════════════════════════════════════════════════════════
WITH riviera_players AS (
  SELECT
    i.riviera_id::text AS riviera_id,
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
      )
    ) AS jugador_nombre
  FROM public.riviera_official_player_identity i
  LEFT JOIN public.riviera_jugadores rj_canon
    ON rj_canon.id = i.canonical_riviera_jugador_id
),
validation_targets AS (
  SELECT * FROM (VALUES
    ('RIV-00000011', 'Nevyl'),
    ('RIV-00000009', 'Daniel N'),
    ('RIV-00000003', 'Alejandro R'),
    ('RIV-00000024', 'Sebastian'),
    ('RIV-00000031', 'Edgardo T'),
    ('RIV-00000019', 'Irving'),
    ('RIV-00000041', 'David R'),
    ('RIV-00000063', 'Lalo E'),
    ('RIV-00000068', 'Tadeo'),
    ('RIV-00000053', 'Said C')
  ) AS v(riviera_id, jugador_nombre)
),
career_participaciones AS (
  SELECT
    rp.riviera_id,
    rp.jugador_nombre,
    rp.anchor_jugador_id,
    jp.id AS participacion_id,
    jp.jugador_id AS perfil_jugador_id,
    jp.tipo_evento,
    jp.evento_id,
    jp.evento_nombre,
    jp.fecha AS evento_fecha,
    jp.resultado,
    jp.puntos_obtenidos AS puntos_ranking,
    jp.metadata,
    jp.created_at,
    rj_perfil.organizador_id AS perfil_origen_organizador_id,
    COALESCE(
      public.get_organizador_display_name(rj_perfil.organizador_id),
      rj_perfil.organizador_id::text
    ) AS perfil_origen_club,
    public.riviera_participacion_expected_host_org(
      jp.tipo_evento::text,
      jp.evento_id::text
    ) AS evento_host_desde_padre_id,
    o.organizador_id AS evento_host_override_id,
    o.club_name AS evento_host_override_club
  FROM riviera_players rp
  INNER JOIN validation_targets vt ON vt.riviera_id = rp.riviera_id
  CROSS JOIN LATERAL (
    SELECT g.jugador_id
    FROM public.get_public_career_jugador_ids(rp.anchor_jugador_id) AS g(jugador_id)
  ) career_ids
  JOIN public.jugador_participaciones jp
    ON jp.jugador_id = career_ids.jugador_id
  JOIN public.riviera_jugadores rj_perfil
    ON rj_perfil.id = jp.jugador_id
  LEFT JOIN public.career_event_host_manual_overrides o
    ON o.tipo_evento = jp.tipo_evento::text
   AND o.evento_id = trim(jp.evento_id::text)
  WHERE rp.anchor_jugador_id IS NOT NULL
    AND rj_perfil.estado = 'activo'
    AND COALESCE(rj_perfil.suma_ranking, true) = true
    AND NOT public.is_jugador_participacion_excluded(
      jp.jugador_id,
      jp.tipo_evento::text,
      jp.evento_id
    )
),
enriched AS (
  SELECT
    cp.*,
    COALESCE(cp.evento_host_desde_padre_id, cp.evento_host_override_id) AS evento_organizador_id,
    COALESCE(
      public.get_organizador_display_name(cp.evento_host_desde_padre_id),
      cp.evento_host_override_club,
      public.get_organizador_display_name(cp.evento_host_override_id),
      'SIN_HOST_CONOCIDO'
    ) AS evento_organizador_nombre,
    NULLIF(trim(cp.metadata->>'organizador_id'), '') AS metadata_organizador_id,
    NULLIF(trim(cp.metadata->>'repair_reason'), '') AS metadata_repair_reason,
    COALESCE(
      NULLIF(trim(cp.metadata->>'organizador_id'), ''),
      cp.perfil_origen_organizador_id::text
    ) AS ranking_organizador_resuelto_id,
    (
      NULLIF(trim(cp.metadata->>'repair_reason'), '') = 'manual_override_parent_deleted'
      AND COALESCE(cp.metadata->>'manual_override_approved_at', '') LIKE '2026-07-06%'
    ) AS es_repair_6_jul,
    CASE
      WHEN COALESCE(cp.evento_host_desde_padre_id, cp.evento_host_override_id) IS NULL
        THEN 'SIN_HOST'
      WHEN NULLIF(trim(cp.metadata->>'organizador_id'), '') IS NULL
        THEN 'SIN_METADATA_ORG'
      WHEN NULLIF(trim(cp.metadata->>'organizador_id'), '')
        = COALESCE(cp.evento_host_desde_padre_id, cp.evento_host_override_id)::text
        THEN 'OK_METADATA_EQ_EVENTO'
      ELSE 'MISMATCH_METADATA_VS_EVENTO'
    END AS metadata_vs_evento_host
  FROM career_participaciones cp
)
SELECT
  e.jugador_nombre,
  e.riviera_id,
  e.participacion_id,
  e.evento_nombre,
  e.evento_fecha,
  e.evento_organizador_nombre,
  e.metadata_organizador_id,
  e.metadata_repair_reason,
  e.puntos_ranking,
  e.resultado,
  COALESCE(
    e.metadata->>'lugar',
    CASE
      WHEN e.metadata->>'posicion_final' IS NOT NULL
        THEN 'pos ' || (e.metadata->>'posicion_final')
      WHEN e.metadata->>'posicion' IS NOT NULL
        THEN 'pos ' || (e.metadata->>'posicion')
      ELSE '—'
    END
  ) AS resultado_posicion,
  COALESCE(e.perfil_origen_club, '—') AS perfil_origen,
  e.ranking_organizador_resuelto_id,
  e.metadata_vs_evento_host,
  e.es_repair_6_jul,
  e.created_at,
  COALESCE(
    NULLIF(trim(e.metadata->>'manual_override_approved_at'), '')::timestamptz,
    e.created_at
  ) AS updated_at
FROM enriched e
ORDER BY e.jugador_nombre, e.evento_fecha DESC NULLS LAST, e.evento_nombre;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3) RESUMEN por jugador — desglose ranking ACTUAL (metadata resuelta = app)
-- ═══════════════════════════════════════════════════════════════════════════
WITH riviera_players AS (
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
    rp.riviera_id,
    rp.jugador_nombre AS jugador,
    jp.puntos_obtenidos,
    COALESCE(
      NULLIF(trim(jp.metadata->>'organizador_id'), ''),
      rj.organizador_id::text
    ) AS org_resuelto,
    jp.evento_nombre,
    (
      COALESCE(jp.metadata->>'repair_reason', '') = 'manual_override_parent_deleted'
      AND COALESCE(jp.metadata->>'manual_override_approved_at', '') LIKE '2026-07-06%'
    ) AS es_repair_6_jul
  FROM riviera_players rp
  CROSS JOIN LATERAL (
    SELECT g.jugador_id
    FROM public.get_public_career_jugador_ids(rp.anchor_jugador_id) AS g(jugador_id)
  ) ids
  JOIN public.jugador_participaciones jp ON jp.jugador_id = ids.jugador_id
  JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  WHERE rp.anchor_jugador_id IS NOT NULL
    AND rj.estado = 'activo'
    AND COALESCE(rj.suma_ranking, true) = true
    AND NOT public.is_jugador_participacion_excluded(
      jp.jugador_id, jp.tipo_evento::text, jp.evento_id
    )
)
SELECT
  jugador,
  riviera_id,
  COALESCE(SUM(puntos_obtenidos) FILTER (
    WHERE org_resuelto = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'
  ), 0)::integer AS riviera_open_pts,
  COALESCE(SUM(puntos_obtenidos) FILTER (
    WHERE org_resuelto = 'e724de97-3552-4a01-a269-f621e6f1ed26'
  ), 0)::integer AS hackpadel_pts,
  COALESCE(SUM(puntos_obtenidos), 0)::integer AS total_pts,
  COUNT(*) FILTER (
    WHERE org_resuelto = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'
      AND COALESCE(puntos_obtenidos, 0) <> 0
  )::integer AS eventos_riviera_open,
  COUNT(*) FILTER (
    WHERE org_resuelto = 'e724de97-3552-4a01-a269-f621e6f1ed26'
      AND COALESCE(puntos_obtenidos, 0) <> 0
  )::integer AS eventos_hackpadel,
  COUNT(*) FILTER (WHERE es_repair_6_jul)::integer AS participaciones_sospechosas_repair_6_jul
FROM rows
GROUP BY jugador, riviera_id
ORDER BY jugador;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4) RESUMEN validación manual — subset + desglose por EVENTO REAL
--    (útil para confirmar si metadata coincide con club del evento)
-- ═══════════════════════════════════════════════════════════════════════════
WITH riviera_players AS (
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
validation_targets AS (
  SELECT * FROM (VALUES
    ('RIV-00000011', 'Nevyl'),
    ('RIV-00000009', 'Daniel N'),
    ('RIV-00000003', 'Alejandro R'),
    ('RIV-00000024', 'Sebastian'),
    ('RIV-00000031', 'Edgardo T'),
    ('RIV-00000019', 'Irving'),
    ('RIV-00000041', 'David R'),
    ('RIV-00000063', 'Lalo E'),
    ('RIV-00000068', 'Tadeo'),
    ('RIV-00000053', 'Said C')
  ) AS v(riviera_id, jugador_nombre)
),
rows AS (
  SELECT
    rp.jugador_nombre AS jugador,
    rp.riviera_id,
    jp.puntos_obtenidos,
    COALESCE(
      NULLIF(trim(jp.metadata->>'organizador_id'), ''),
      rj.organizador_id::text
    ) AS org_metadata_resuelto,
    COALESCE(
      public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text),
      o.organizador_id
    )::text AS org_evento_real,
    (
      COALESCE(jp.metadata->>'repair_reason', '') = 'manual_override_parent_deleted'
      AND COALESCE(jp.metadata->>'manual_override_approved_at', '') LIKE '2026-07-06%'
    ) AS es_repair_6_jul
  FROM riviera_players rp
  INNER JOIN validation_targets vt ON vt.riviera_id = rp.riviera_id
  CROSS JOIN LATERAL (
    SELECT g.jugador_id
    FROM public.get_public_career_jugador_ids(rp.anchor_jugador_id) AS g(jugador_id)
  ) ids
  JOIN public.jugador_participaciones jp ON jp.jugador_id = ids.jugador_id
  JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  LEFT JOIN public.career_event_host_manual_overrides o
    ON o.tipo_evento = jp.tipo_evento::text
   AND o.evento_id = trim(jp.evento_id::text)
  WHERE rp.anchor_jugador_id IS NOT NULL
    AND rj.estado = 'activo'
    AND COALESCE(rj.suma_ranking, true) = true
    AND NOT public.is_jugador_participacion_excluded(
      jp.jugador_id, jp.tipo_evento::text, jp.evento_id
    )
)
SELECT
  jugador,
  riviera_id,
  -- Lo que muestra la app hoy (metadata)
  COALESCE(SUM(puntos_obtenidos) FILTER (
    WHERE org_metadata_resuelto = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'
  ), 0)::integer AS ro_pts_metadata,
  COALESCE(SUM(puntos_obtenidos) FILTER (
    WHERE org_metadata_resuelto = 'e724de97-3552-4a01-a269-f621e6f1ed26'
  ), 0)::integer AS hp_pts_metadata,
  COALESCE(SUM(puntos_obtenidos), 0)::integer AS total_pts,
  -- Lo que daría el club REAL del evento (padre o override)
  COALESCE(SUM(puntos_obtenidos) FILTER (
    WHERE org_evento_real = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'
  ), 0)::integer AS ro_pts_por_evento_real,
  COALESCE(SUM(puntos_obtenidos) FILTER (
    WHERE org_evento_real = 'e724de97-3552-4a01-a269-f621e6f1ed26'
  ), 0)::integer AS hp_pts_por_evento_real,
  COUNT(*) FILTER (WHERE es_repair_6_jul)::integer AS participaciones_sospechosas_repair_6_jul,
  COUNT(*) FILTER (
    WHERE org_metadata_resuelto IS DISTINCT FROM org_evento_real
      AND org_evento_real IS NOT NULL
  )::integer AS filas_metadata_distinto_evento
FROM rows
GROUP BY jugador, riviera_id
ORDER BY jugador;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5) Alejandro R — verificación explícita (RIV-00000003)
--    ¿Tiene 75 RO históricos + 75 Remontada Hackpadel = 150?
-- ═══════════════════════════════════════════════════════════════════════════
WITH anchor AS (
  SELECT canonical_riviera_jugador_id AS jugador_id
  FROM public.riviera_official_player_identity
  WHERE riviera_id::text = 'RIV-00000003'
  LIMIT 1
)
SELECT
  'RIV-00000003' AS riviera_id,
  rj.nombre AS jugador,
  jp.id AS participacion_id,
  jp.evento_nombre,
  jp.fecha,
  jp.puntos_obtenidos,
  jp.metadata->>'organizador_id' AS metadata_org,
  public.get_organizador_display_name(
    COALESCE(
      public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text),
      o.organizador_id
    )
  ) AS evento_club_real,
  rj.organizador_id AS perfil_origen_org,
  jp.metadata->>'repair_reason' AS repair_reason
FROM anchor a
CROSS JOIN LATERAL (
  SELECT g.jugador_id
  FROM public.get_public_career_jugador_ids(a.jugador_id) AS g(jugador_id)
) ids
JOIN public.jugador_participaciones jp ON jp.jugador_id = ids.jugador_id
JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
LEFT JOIN public.career_event_host_manual_overrides o
  ON o.tipo_evento = jp.tipo_evento::text
 AND o.evento_id = trim(jp.evento_id::text)
ORDER BY jp.fecha DESC;
