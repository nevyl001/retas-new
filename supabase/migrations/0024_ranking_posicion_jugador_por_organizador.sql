-- 0024 — Posición 1-jugador EQUIVALENTE al ranking interno público final.
--
-- Semántica (UNA sola verdad con JugadoresPublicRanking):
--   1) Roster = nativos activos (cat/género) − clones locales revocados
--      ∪ grants sintéticos (sin local_jugador_id) filtrados por cat/género
--   2) Puntos = SUM(puntos_obtenidos) de la carrera pública del anchor
--      (get_public_career_jugador_ids) atribuidos al organizador anfitrión
--      vía metadata.organizador_id (con backfill duelo/TE igual que
--      riviera_list_participaciones_for_jugador_ids). Huérfanas = 0.
--   3) RANK competitivo solo por puntos (empates comparten #; el siguiente salta).
--      nombre NO entra en el RANK (solo desempate de presentación en la lista).
--
-- NO usa jugador_stats como fuente de orden.
-- NO es ROMC.
-- Aditivo. Sin DROP/DELETE/UPDATE de datos.

CREATE OR REPLACE FUNCTION public._riviera_ranking_interno_scored_roster(
  p_organizador_id uuid,
  p_categoria text DEFAULT NULL,
  p_genero text DEFAULT 'M'
)
RETURNS TABLE (
  jugador_id uuid,
  nombre text,
  puntos integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH revoked_locals AS (
    SELECT DISTINCT opa.local_jugador_id AS id
    FROM public.organizer_player_access opa
    WHERE opa.grantee_organizer_id = p_organizador_id
      AND opa.is_active = false
      AND opa.local_jugador_id IS NOT NULL
  ),
  natives AS (
    SELECT
      rj.id AS jugador_id,
      rj.nombre,
      rj.categoria,
      rj.genero
    FROM public.riviera_jugadores rj
    WHERE rj.organizador_id = p_organizador_id
      AND rj.estado = 'activo'
      AND (p_categoria IS NULL OR rj.categoria = p_categoria)
      AND (
        p_genero IS NULL
        OR (upper(p_genero) IN ('F', 'FEMENIL') AND rj.genero = 'F')
        OR (
          upper(p_genero) IN ('M', 'VARONIL')
          AND (rj.genero = 'M' OR rj.genero IS NULL)
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM revoked_locals rl WHERE rl.id = rj.id
      )
  ),
  active_grants AS (
    SELECT
      opa.jugador_id AS source_jugador_id,
      opa.local_jugador_id,
      opa.local_display_name,
      opa.local_category
    FROM public.organizer_player_access opa
    WHERE opa.grantee_organizer_id = p_organizador_id
      AND opa.is_active = true
  ),
  -- Grants con clon local ya en natives: el roster id sigue siendo el local.
  -- Grants sin clon: fila sintética con id = source (si cat/género coinciden).
  synthetic AS (
    SELECT
      g.source_jugador_id AS jugador_id,
      COALESCE(
        NULLIF(TRIM(g.local_display_name), ''),
        src.nombre,
        'Jugador'
      ) AS nombre
    FROM active_grants g
    JOIN public.riviera_jugadores src
      ON src.id = g.source_jugador_id
     AND src.estado = 'activo'
    WHERE g.local_jugador_id IS NULL
      AND COALESCE(NULLIF(TRIM(g.local_category), ''), src.categoria, 'open')
          = COALESCE(p_categoria, COALESCE(NULLIF(TRIM(g.local_category), ''), src.categoria, 'open'))
      AND (
        p_genero IS NULL
        OR (upper(p_genero) IN ('F', 'FEMENIL') AND src.genero = 'F')
        OR (
          upper(p_genero) IN ('M', 'VARONIL')
          AND (src.genero = 'M' OR src.genero IS NULL)
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM natives n WHERE n.jugador_id = g.source_jugador_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM natives n
        JOIN active_grants g2
          ON g2.local_jugador_id = n.jugador_id
         AND g2.source_jugador_id = g.source_jugador_id
      )
  ),
  roster AS (
    SELECT n.jugador_id, n.nombre FROM natives n
    UNION ALL
    SELECT s.jugador_id, s.nombre FROM synthetic s
  ),
  career_links AS (
    SELECT c.anchor_jugador_id, c.jugador_id AS linked_jugador_id
    FROM public.get_public_career_jugador_ids_batch(
      ARRAY(SELECT r.jugador_id FROM roster r)
    ) c
  ),
  parts AS (
    SELECT
      cl.anchor_jugador_id,
      jp.puntos_obtenidos,
      CASE
        WHEN COALESCE(jp.metadata->>'organizador_id', '') <> '' THEN jp.metadata->>'organizador_id'
        WHEN d.id IS NOT NULL THEN d.organizador_id::text
        WHEN t.id IS NOT NULL THEN t.organizador_id::text
        ELSE NULL
      END AS host_org
    FROM career_links cl
    JOIN public.jugador_participaciones jp
      ON jp.jugador_id = cl.linked_jugador_id
    JOIN public.riviera_jugadores rj
      ON rj.id = jp.jugador_id
     AND rj.estado = 'activo'
    LEFT JOIN public.duelos_2v2 d
      ON jp.tipo_evento = 'duelo_2v2'
     AND jp.evento_id::uuid = d.id
    LEFT JOIN public.torneo_express t
      ON jp.tipo_evento = 'torneo_express'
     AND jp.evento_id::uuid = t.id
    WHERE NOT public.is_jugador_participacion_excluded(
      jp.jugador_id,
      jp.tipo_evento::text,
      jp.evento_id
    )
  ),
  scored AS (
    SELECT
      r.jugador_id,
      r.nombre,
      COALESCE(
        SUM(p.puntos_obtenidos) FILTER (
          WHERE p.host_org = p_organizador_id::text
        ),
        0
      )::integer AS puntos
    FROM roster r
    LEFT JOIN parts p ON p.anchor_jugador_id = r.jugador_id
    GROUP BY r.jugador_id, r.nombre
  )
  SELECT s.jugador_id, s.nombre, s.puntos
  FROM scored s;
$$;

REVOKE ALL ON FUNCTION public._riviera_ranking_interno_scored_roster(uuid, text, text)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public._riviera_ranking_interno_scored_roster(uuid, text, text) IS
  'Roster puntuado del ranking interno (carrera@host + grants). Uso interno por la RPC 1-jugador. REVOKE a anon.';

CREATE OR REPLACE FUNCTION public.riviera_ranking_posicion_jugador_por_organizador(
  p_organizador_id uuid,
  p_jugador_id uuid,
  p_categoria text DEFAULT NULL,
  p_genero text DEFAULT 'M'
)
RETURNS TABLE (
  jugador_id uuid,
  posicion integer,
  puntos integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scored AS (
    SELECT *
    FROM public._riviera_ranking_interno_scored_roster(
      p_organizador_id,
      p_categoria,
      p_genero
    )
  ),
  -- Deep-link puede traer id local O id origen del grant.
  resolved AS (
    SELECT x.roster_id
    FROM (
      SELECT s.jugador_id AS roster_id
      FROM scored s
      WHERE s.jugador_id = p_jugador_id
      UNION
      SELECT opa.local_jugador_id
      FROM public.organizer_player_access opa
      JOIN scored s ON s.jugador_id = opa.local_jugador_id
      WHERE opa.grantee_organizer_id = p_organizador_id
        AND opa.is_active = true
        AND opa.jugador_id = p_jugador_id
        AND opa.local_jugador_id IS NOT NULL
      UNION
      SELECT opa.jugador_id
      FROM public.organizer_player_access opa
      JOIN scored s ON s.jugador_id = opa.jugador_id
      WHERE opa.grantee_organizer_id = p_organizador_id
        AND opa.is_active = true
        AND opa.local_jugador_id = p_jugador_id
    ) x
    LIMIT 1
  ),
  ranked AS (
    SELECT
      s.jugador_id,
      s.puntos,
      RANK() OVER (ORDER BY s.puntos DESC)::integer AS posicion
    FROM scored s
  )
  SELECT
    r.jugador_id,
    r.posicion,
    r.puntos
  FROM ranked r
  JOIN resolved x ON x.roster_id = r.jugador_id;
$$;

COMMENT ON FUNCTION public.riviera_ranking_posicion_jugador_por_organizador(uuid, uuid, text, text) IS
  'Posición 1-jugador idéntica al ranking interno público (carrera@host + grants + RANK competitivo por puntos).';

GRANT EXECUTE ON FUNCTION public.riviera_ranking_posicion_jugador_por_organizador(uuid, uuid, text, text)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
