-- Historial de participaciones scoped al club anfitrión (ficha ranking interno).
-- Incluye perfiles locales cedidos/importados (misma carrera, distinto jugador_id).
-- Ejecutar en Supabase SQL Editor (staging → prod).

CREATE OR REPLACE FUNCTION public.riviera_participaciones_interno(
  p_organizador_id uuid,
  p_jugador_id uuid,
  p_limit integer DEFAULT 100
)
RETURNS SETOF public.jugador_participaciones
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH linked AS (
    SELECT p_jugador_id AS jugador_id
    UNION
    SELECT g.jugador_id
    FROM public.get_public_career_jugador_ids(p_jugador_id) AS g(jugador_id)
    UNION
    SELECT opa.local_jugador_id
    FROM public.organizer_player_access opa
    WHERE opa.is_active = true
      AND opa.grantee_organizer_id = p_organizador_id
      AND opa.local_jugador_id IS NOT NULL
      AND (
        opa.jugador_id = p_jugador_id
        OR opa.local_jugador_id = p_jugador_id
      )
  )
  SELECT
    jp.id,
    jp.jugador_id,
    jp.tipo_evento,
    jp.evento_id,
    jp.evento_nombre,
    jp.fecha,
    jp.pareja_con,
    jp.resultado,
    jp.sets_favor,
    jp.sets_contra,
    jp.puntos_obtenidos,
    CASE
      WHEN COALESCE(jp.metadata->>'organizador_id', '') <> '' THEN jp.metadata
      WHEN d.id IS NOT NULL THEN COALESCE(jp.metadata, '{}'::jsonb)
        || jsonb_build_object('organizador_id', d.organizador_id::text)
      WHEN t.id IS NOT NULL THEN COALESCE(jp.metadata, '{}'::jsonb)
        || jsonb_build_object('organizador_id', t.organizador_id::text)
      ELSE COALESCE(jp.metadata, '{}'::jsonb)
    END AS metadata,
    jp.created_at
  FROM public.jugador_participaciones jp
  INNER JOIN public.riviera_jugadores rj ON rj.id = jp.jugador_id
  INNER JOIN linked l ON l.jugador_id = jp.jugador_id
  LEFT JOIN public.duelos_2v2 d
    ON jp.tipo_evento = 'duelo_2v2'
   AND jp.evento_id::uuid = d.id
  LEFT JOIN public.torneo_express t
    ON jp.tipo_evento = 'torneo_express'
   AND jp.evento_id::uuid = t.id
  WHERE rj.estado = 'activo'
    AND (
      COALESCE(jp.metadata->>'organizador_id', '') = p_organizador_id::text
      OR (
        COALESCE(jp.metadata->>'organizador_id', '') = ''
        AND rj.organizador_id = p_organizador_id
      )
    )
    AND NOT public.is_jugador_participacion_excluded(
      jp.jugador_id,
      jp.tipo_evento::text,
      jp.evento_id
    )
  ORDER BY jp.fecha DESC NULLS LAST, jp.created_at DESC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limit, 100), 1);
$$;

COMMENT ON FUNCTION public.riviera_participaciones_interno(uuid, uuid, integer) IS
  'Participaciones en el club anfitrión: perfiles locales + metadata.organizador_id (cedidos/importados).';

GRANT EXECUTE ON FUNCTION public.riviera_participaciones_interno(uuid, uuid, integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
