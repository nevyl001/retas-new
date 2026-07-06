-- Historial de participaciones scoped al club anfitrión (ficha ranking interno).
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
  SELECT jp.*
  FROM public.jugador_participaciones jp
  INNER JOIN public.riviera_jugadores rj
    ON rj.id = jp.jugador_id
  WHERE jp.jugador_id = p_jugador_id
    AND rj.organizador_id = p_organizador_id
    AND rj.estado = 'activo'
    AND (
      jp.metadata->>'organizador_id' IS NULL
      OR jp.metadata->>'organizador_id' = p_organizador_id::text
    )
  ORDER BY jp.fecha DESC NULLS LAST, jp.created_at DESC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limit, 100), 1);
$$;

COMMENT ON FUNCTION public.riviera_participaciones_interno(uuid, uuid, integer) IS
  'Participaciones de un jugador en el contexto de un club (perfil local + metadata organizador).';

GRANT EXECUTE ON FUNCTION public.riviera_participaciones_interno(uuid, uuid, integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
