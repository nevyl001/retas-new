-- Participaciones con metadata.organizador_id resuelto en SQL (bypass RLS cross-club).
-- Ejecutar en Supabase SQL Editor (staging → prod).

CREATE OR REPLACE FUNCTION public.riviera_list_participaciones_enriched(
  p_jugador_id uuid,
  p_limit integer DEFAULT 100
)
RETURNS SETOF public.jugador_participaciones
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  LEFT JOIN public.duelos_2v2 d
    ON jp.tipo_evento = 'duelo_2v2'
   AND jp.evento_id::uuid = d.id
  LEFT JOIN public.torneo_express t
    ON jp.tipo_evento = 'torneo_express'
   AND jp.evento_id::uuid = t.id
  WHERE jp.jugador_id = p_jugador_id
  ORDER BY jp.fecha DESC NULLS LAST, jp.created_at DESC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limit, 100), 1);
$$;

COMMENT ON FUNCTION public.riviera_list_participaciones_enriched(uuid, integer) IS
  'Historial del jugador con metadata.organizador_id inferido desde duelo/torneo (multiclub).';

GRANT EXECUTE ON FUNCTION public.riviera_list_participaciones_enriched(uuid, integer)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
