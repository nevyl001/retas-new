-- ═══════════════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO READ-ONLY: metadata.organizador_id en carrera por Riviera ID
-- Ejecutar en Supabase SQL Editor. NO modifica datos.
--
-- Riviera Open: 2770b522-9064-4c7b-a729-4a0ea7e3f6e8
-- Hackpadel:     e724de97-3552-4a01-a269-f621e6f1ed26
-- ═══════════════════════════════════════════════════════════════════════════

-- ── A) Ancla por Riviera ID ───────────────────────────────────────────────
WITH targets AS (
  SELECT * FROM (VALUES
    ('RIV-00000011', 'Nevyl'),
    ('RIV-00000009', 'Daniel N'),
    ('RIV-00000003', 'Alejandro R'),
    ('RIV-00000031', 'Edgardo T'),
    ('RIV-00000019', 'Irving'),
    ('RIV-00000024', 'Sebastian'),
    ('RIV-00000041', 'David R')
  ) AS t(riviera_id, jugador_nombre)
),
anchors AS (
  SELECT
    t.riviera_id,
    t.jugador_nombre,
    COALESCE(
      i.canonical_riviera_jugador_id,
      (
        SELECT rj.id
        FROM public.riviera_jugadores rj
        WHERE rj.nombre = t.jugador_nombre
          AND rj.organizador_id = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'::uuid
          AND rj.estado = 'activo'
        LIMIT 1
      )
    ) AS anchor_jugador_id
  FROM targets t
  LEFT JOIN public.riviera_official_player_identity i
    ON i.riviera_id::text = t.riviera_id
),
career_rows AS (
  SELECT
    a.riviera_id,
    a.jugador_nombre,
    a.anchor_jugador_id,
    jp.id AS participacion_id,
    jp.jugador_id,
    rj_home.organizador_id AS perfil_home_org,
    jp.evento_nombre,
    jp.evento_id,
    jp.fecha,
    jp.puntos_obtenidos AS puntos,
    NULLIF(trim(jp.metadata->>'organizador_id'), '') AS metadata_organizador_id,
    COALESCE(
      NULLIF(trim(jp.metadata->>'organizador_id'), ''),
      rj_home.organizador_id::text
    ) AS organizador_resuelto,
    COALESCE(
      public.get_organizador_display_name(
        COALESCE(
          NULLIF(trim(jp.metadata->>'organizador_id'), '')::uuid,
          rj_home.organizador_id
        )
      ),
      jp.metadata->>'club_name',
      '—'
    ) AS club_nombre_resuelto,
    jp.metadata->>'repair_reason' AS repair_reason,
    jp.metadata->>'manual_override_id' AS manual_override_id,
    jp.metadata->>'manual_override_approved_at' AS repair_applied_at,
    jp.created_at,
    jp.metadata AS metadata_full
  FROM anchors a
  CROSS JOIN LATERAL (
    SELECT g.jugador_id
    FROM public.get_public_career_jugador_ids(a.anchor_jugador_id) AS g(jugador_id)
  ) career_ids
  JOIN public.jugador_participaciones jp ON jp.jugador_id = career_ids.jugador_id
  LEFT JOIN public.riviera_jugadores rj_home ON rj_home.id = jp.jugador_id
  WHERE a.anchor_jugador_id IS NOT NULL
    AND COALESCE(jp.puntos_obtenidos, 0) <> 0
)
SELECT *
FROM career_rows
ORDER BY jugador_nombre, fecha DESC, evento_nombre, participacion_id;

-- ── B) Agrupado por jugador + metadata_organizador_id ───────────────────────
WITH targets AS (
  SELECT * FROM (VALUES
    ('RIV-00000011', 'Nevyl'),
    ('RIV-00000009', 'Daniel N'),
    ('RIV-00000003', 'Alejandro R'),
    ('RIV-00000031', 'Edgardo T'),
    ('RIV-00000019', 'Irving'),
    ('RIV-00000024', 'Sebastian'),
    ('RIV-00000041', 'David R')
  ) AS t(riviera_id, jugador_nombre)
),
anchors AS (
  SELECT
    t.riviera_id,
    t.jugador_nombre,
    COALESCE(
      i.canonical_riviera_jugador_id,
      (
        SELECT rj.id FROM public.riviera_jugadores rj
        WHERE rj.nombre = t.jugador_nombre
          AND rj.organizador_id = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'::uuid
          AND rj.estado = 'activo'
        LIMIT 1
      )
    ) AS anchor_jugador_id
  FROM targets t
  LEFT JOIN public.riviera_official_player_identity i
    ON i.riviera_id::text = t.riviera_id
),
career_rows AS (
  SELECT
    a.riviera_id,
    a.jugador_nombre,
    jp.puntos_obtenidos AS puntos,
    COALESCE(
      NULLIF(trim(jp.metadata->>'organizador_id'), ''),
      rj_home.organizador_id::text
    ) AS organizador_resuelto
  FROM anchors a
  CROSS JOIN LATERAL (
    SELECT g.jugador_id
    FROM public.get_public_career_jugador_ids(a.anchor_jugador_id) AS g(jugador_id)
  ) career_ids
  JOIN public.jugador_participaciones jp ON jp.jugador_id = career_ids.jugador_id
  LEFT JOIN public.riviera_jugadores rj_home ON rj_home.id = jp.jugador_id
  WHERE a.anchor_jugador_id IS NOT NULL
)
SELECT
  riviera_id,
  jugador_nombre,
  organizador_resuelto,
  COALESCE(public.get_organizador_display_name(organizador_resuelto::uuid), organizador_resuelto) AS club,
  SUM(puntos)::integer AS puntos_sum,
  COUNT(*)::integer AS filas
FROM career_rows
GROUP BY riviera_id, jugador_nombre, organizador_resuelto
ORDER BY jugador_nombre, puntos_sum DESC;

-- ── C) Resumen diagnóstico (actual vs esperado) ───────────────────────────
-- Esperado documentado por negocio (7 casos visibles en UI).
WITH expected AS (
  SELECT * FROM (VALUES
    ('RIV-00000011', 'Nevyl',       120,  50, 170),
    ('RIV-00000009', 'Daniel N',     75,  75, 150),
    ('RIV-00000003', 'Alejandro R', 75,   0,  75),
    ('RIV-00000031', 'Edgardo T',    50,  70, 120),
    ('RIV-00000019', 'Irving',       50,  50, 100),
    ('RIV-00000024', 'Sebastian',    25,  25,  50),
    ('RIV-00000041', 'David R',     550,  50, 600)
  ) AS e(riviera_id, jugador_nombre, ro_esperado, hp_esperado, total_esperado)
),
actual AS (
  SELECT
    riviera_id,
    jugador_nombre,
    COALESCE(SUM(puntos) FILTER (
      WHERE organizador_resuelto = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'
    ), 0)::integer AS ro_actual,
    COALESCE(SUM(puntos) FILTER (
      WHERE organizador_resuelto = 'e724de97-3552-4a01-a269-f621e6f1ed26'
    ), 0)::integer AS hp_actual
  FROM (
    WITH targets AS (
      SELECT * FROM (VALUES
        ('RIV-00000011', 'Nevyl'),
        ('RIV-00000009', 'Daniel N'),
        ('RIV-00000003', 'Alejandro R'),
        ('RIV-00000031', 'Edgardo T'),
        ('RIV-00000019', 'Irving'),
        ('RIV-00000024', 'Sebastian'),
        ('RIV-00000041', 'David R')
      ) AS t(riviera_id, jugador_nombre)
    ),
    anchors AS (
      SELECT t.riviera_id, t.jugador_nombre,
        COALESCE(i.canonical_riviera_jugador_id,
          (SELECT rj.id FROM public.riviera_jugadores rj
           WHERE rj.nombre = t.jugador_nombre
             AND rj.organizador_id = '2770b522-9064-4c7b-a729-4a0ea7e3f6e8'::uuid
             AND rj.estado = 'activo' LIMIT 1)
        ) AS anchor_jugador_id
      FROM targets t
      LEFT JOIN public.riviera_official_player_identity i ON i.riviera_id::text = t.riviera_id
    )
    SELECT
      a.riviera_id,
      a.jugador_nombre,
      jp.puntos_obtenidos AS puntos,
      COALESCE(NULLIF(trim(jp.metadata->>'organizador_id'), ''), rj.organizador_id::text) AS organizador_resuelto
    FROM anchors a
    CROSS JOIN LATERAL (
      SELECT g.jugador_id FROM public.get_public_career_jugador_ids(a.anchor_jugador_id) AS g(jugador_id)
    ) ids
    JOIN public.jugador_participaciones jp ON jp.jugador_id = ids.jugador_id
    LEFT JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
    WHERE a.anchor_jugador_id IS NOT NULL
  ) sub
  GROUP BY riviera_id, jugador_nombre
)
SELECT
  e.jugador_nombre AS jugador,
  e.riviera_id,
  a.ro_actual AS riviera_open_pts_actual,
  a.hp_actual AS hackpadel_pts_actual,
  (a.ro_actual + a.hp_actual) AS total_actual,
  e.ro_esperado,
  e.hp_esperado,
  e.total_esperado,
  (a.ro_actual - e.ro_esperado) AS diff_ro,
  (a.hp_actual - e.hp_esperado) AS diff_hp,
  CASE
    WHEN a.ro_actual = e.ro_esperado AND a.hp_actual = e.hp_esperado THEN 'OK'
    WHEN a.hp_actual > e.hp_esperado AND a.ro_actual < e.ro_esperado THEN
      'metadata Hackpadel inflada — revisar repair 2026-07-06'
    ELSE 'revisar manualmente'
  END AS causa_probable
FROM expected e
JOIN actual a USING (riviera_id, jugador_nombre)
ORDER BY e.jugador_nombre;
