-- Diagnóstico: metadata.organizador_id vs club anfitrión real del evento padre.
-- Ejecutar en Supabase SQL Editor (staging → prod). Solo lectura.
--
-- Jugadores: Daniel N, Nevyl, Sebastian, TestplayerCT1, TestplaCT2
-- Eventos críticos: Reta Nocturna, Lunes Mixta, Hack Padel 5ta Fuerza → HackPadel

-- Constantes (ajustar si cambian en otro entorno)
-- HackPadel:  e724de97-3552-4a01-a269-f621e6f1ed26
-- Riviera:   2770b522-9064-4c7b-a729-4a0ea7e3f6e8
-- Club Test: cd45cea7-a8ac-4596-b0ee-24959b4cbb5d

CREATE OR REPLACE FUNCTION public.riviera_participacion_expected_host_org(
  p_tipo_evento text,
  p_evento_id text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_tipo_evento
    WHEN 'reta' THEN (
      SELECT t.user_id
      FROM public.tournaments t
      WHERE t.id = NULLIF(trim(p_evento_id), '')::uuid
      LIMIT 1
    )
    WHEN 'americano' THEN (
      SELECT t.user_id
      FROM public.tournaments t
      WHERE t.id = NULLIF(trim(p_evento_id), '')::uuid
      LIMIT 1
    )
    WHEN 'duelo_2v2' THEN (
      SELECT d.organizador_id
      FROM public.duelos_2v2 d
      WHERE d.id = NULLIF(trim(p_evento_id), '')::uuid
      LIMIT 1
    )
    WHEN 'torneo_express' THEN (
      SELECT t.organizador_id
      FROM public.torneo_express t
      WHERE t.id = NULLIF(trim(p_evento_id), '')::uuid
      LIMIT 1
    )
    WHEN 'liga' THEN COALESCE(
      (
        SELECT l.organizador_id
        FROM public.liga_jornadas lj
        INNER JOIN public.ligas l ON l.id = lj.liga_id
        WHERE lj.id = NULLIF(trim(p_evento_id), '')::uuid
        LIMIT 1
      ),
      (
        SELECT l.organizador_id
        FROM public.ligas l
        WHERE l.id = NULLIF(trim(p_evento_id), '')::uuid
        LIMIT 1
      )
    )
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.riviera_participacion_expected_host_org(text, text) IS
  'Club anfitrión esperado según evento padre (reta/americano/duelo/torneo/liga).';

GRANT EXECUTE ON FUNCTION public.riviera_participacion_expected_host_org(text, text)
  TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) Detalle por participación (jugadores objetivo + perfiles enlazados)
-- ═══════════════════════════════════════════════════════════════════════════
WITH target_names AS (
  SELECT unnest(ARRAY[
    'Daniel N', 'Nevyl', 'Sebastian', 'TestplayerCT1', 'TestplaCT2'
  ]::text[]) AS nombre
),
target_riviera AS (
  SELECT unnest(ARRAY['RIV-00000102', 'RIV-00000103']::text[]) AS riviera_id
),
seed_profiles AS (
  SELECT DISTINCT rj.id AS jugador_id
  FROM public.riviera_jugadores rj
  WHERE rj.nombre IN (SELECT nombre FROM target_names)
  UNION
  SELECT DISTINCT pl.riviera_jugador_id
  FROM public.riviera_official_player_profile_link pl
  INNER JOIN public.riviera_official_player_identity ri
    ON ri.official_player_key = pl.official_player_key
  WHERE ri.riviera_id IN (SELECT riviera_id FROM target_riviera)
),
linked_profiles AS (
  SELECT DISTINCT pl2.riviera_jugador_id AS jugador_id
  FROM seed_profiles sp
  INNER JOIN public.riviera_official_player_profile_link pl1
    ON pl1.riviera_jugador_id = sp.jugador_id
  INNER JOIN public.riviera_official_player_profile_link pl2
    ON pl2.official_player_key = pl1.official_player_key
  UNION
  SELECT jugador_id FROM seed_profiles
)
SELECT
  rj.nombre AS jugador,
  ri.riviera_id,
  rj.id AS jugador_id,
  rj.organizador_id AS perfil_organizador_id,
  jp.id AS participacion_id,
  jp.evento_nombre,
  jp.tipo_evento,
  jp.puntos_obtenidos AS puntos,
  COALESCE(jp.metadata->>'organizador_id', '') AS metadata_organizador_id,
  COALESCE(jp.metadata->>'club_name', '') AS metadata_club_name,
  public.riviera_participacion_expected_host_org(
    jp.tipo_evento::text,
    jp.evento_id::text
  ) AS expected_organizador_id,
  public.get_organizador_display_name(
    public.riviera_participacion_expected_host_org(
      jp.tipo_evento::text,
      jp.evento_id::text
    )
  ) AS expected_club_name,
  CASE
    WHEN public.riviera_participacion_expected_host_org(
      jp.tipo_evento::text, jp.evento_id::text
    ) IS NULL THEN 'SIN_PADRE'
    WHEN COALESCE(jp.metadata->>'organizador_id', '') = ''
      OR jp.metadata->>'organizador_id'
        IS DISTINCT FROM public.riviera_participacion_expected_host_org(
          jp.tipo_evento::text, jp.evento_id::text
        )::text
    THEN 'MAL'
    ELSE 'OK'
  END AS estado
FROM linked_profiles lp
INNER JOIN public.riviera_jugadores rj ON rj.id = lp.jugador_id
INNER JOIN public.jugador_participaciones jp ON jp.jugador_id = rj.id
LEFT JOIN public.riviera_official_player_profile_link pl
  ON pl.riviera_jugador_id = rj.id
LEFT JOIN public.riviera_official_player_identity ri
  ON ri.official_player_key = pl.official_player_key
ORDER BY jugador, evento_nombre, participacion_id;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) Resumen por jugador
-- ═══════════════════════════════════════════════════════════════════════════
WITH target_names AS (
  SELECT unnest(ARRAY[
    'Daniel N', 'Nevyl', 'Sebastian', 'TestplayerCT1', 'TestplaCT2'
  ]::text[]) AS nombre
),
target_riviera AS (
  SELECT unnest(ARRAY['RIV-00000102', 'RIV-00000103']::text[]) AS riviera_id
),
seed_profiles AS (
  SELECT DISTINCT rj.id AS jugador_id
  FROM public.riviera_jugadores rj
  WHERE rj.nombre IN (SELECT nombre FROM target_names)
  UNION
  SELECT DISTINCT pl.riviera_jugador_id
  FROM public.riviera_official_player_profile_link pl
  INNER JOIN public.riviera_official_player_identity ri
    ON ri.official_player_key = pl.official_player_key
  WHERE ri.riviera_id IN (SELECT riviera_id FROM target_riviera)
),
linked_profiles AS (
  SELECT DISTINCT pl2.riviera_jugador_id AS jugador_id
  FROM seed_profiles sp
  INNER JOIN public.riviera_official_player_profile_link pl1
    ON pl1.riviera_jugador_id = sp.jugador_id
  INNER JOIN public.riviera_official_player_profile_link pl2
    ON pl2.official_player_key = pl1.official_player_key
  UNION
  SELECT jugador_id FROM seed_profiles
),
diag AS (
  SELECT
    rj.nombre AS jugador,
    ri.riviera_id,
    jp.puntos_obtenidos,
    public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text) AS exp_org,
    CASE
      WHEN public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text) IS NULL
        THEN 'SIN_PADRE'
      WHEN COALESCE(jp.metadata->>'organizador_id', '') IS DISTINCT FROM
        public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text)::text
        THEN 'MAL'
      ELSE 'OK'
    END AS estado
  FROM linked_profiles lp
  INNER JOIN public.riviera_jugadores rj ON rj.id = lp.jugador_id
  INNER JOIN public.jugador_participaciones jp ON jp.jugador_id = rj.id
  LEFT JOIN public.riviera_official_player_profile_link pl ON pl.riviera_jugador_id = rj.id
  LEFT JOIN public.riviera_official_player_identity ri ON ri.official_player_key = pl.official_player_key
)
SELECT
  jugador,
  riviera_id,
  COUNT(*) AS participaciones,
  COUNT(*) FILTER (WHERE estado = 'OK') AS ok,
  COUNT(*) FILTER (WHERE estado = 'MAL') AS mal,
  COUNT(*) FILTER (WHERE estado = 'SIN_PADRE') AS sin_padre,
  COALESCE(SUM(puntos_obtenidos) FILTER (
    WHERE estado = 'OK'
      AND exp_org = 'e724de97-3552-4a01-a269-f621e6f1ed26'::uuid
  ), 0) AS pts_ok_hackpadel,
  COALESCE(SUM(puntos_obtenidos) FILTER (
    WHERE estado = 'MAL'
      AND exp_org = 'e724de97-3552-4a01-a269-f621e6f1ed26'::uuid
  ), 0) AS pts_mal_atribuidos_hackpadel
FROM diag
GROUP BY jugador, riviera_id
ORDER BY jugador;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) Eventos críticos HackPadel
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  rj.nombre AS jugador,
  ri.riviera_id,
  jp.evento_nombre,
  jp.tipo_evento,
  jp.puntos_obtenidos,
  jp.metadata->>'organizador_id' AS metadata_org,
  public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text) AS expected_org,
  public.get_organizador_display_name(
    public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text)
  ) AS expected_club,
  CASE
    WHEN public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text)
      = 'e724de97-3552-4a01-a269-f621e6f1ed26'::uuid
      AND COALESCE(jp.metadata->>'organizador_id', '')
        = 'e724de97-3552-4a01-a269-f621e6f1ed26'
    THEN 'OK'
    WHEN public.riviera_participacion_expected_host_org(jp.tipo_evento::text, jp.evento_id::text)
      = 'e724de97-3552-4a01-a269-f621e6f1ed26'::uuid
    THEN 'MAL'
    ELSE 'REVISAR'
  END AS estado
FROM public.jugador_participaciones jp
INNER JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
LEFT JOIN public.riviera_official_player_profile_link pl ON pl.riviera_jugador_id = rj.id
LEFT JOIN public.riviera_official_player_identity ri ON ri.official_player_key = pl.official_player_key
WHERE (
    jp.evento_nombre ILIKE '%Reta Nocturna%'
    OR jp.evento_nombre ILIKE '%Lunes Mixta%'
    OR jp.evento_nombre ILIKE '%Hack Padel 5ta Fuerza%'
    OR jp.evento_nombre ILIKE '%Hackpadel 5ta Fuerza%'
  )
  AND rj.nombre IN ('Daniel N', 'Nevyl', 'Sebastian', 'TestplayerCT1', 'TestplaCT2')
ORDER BY jp.evento_nombre, rj.nombre;

NOTIFY pgrst, 'reload schema';
