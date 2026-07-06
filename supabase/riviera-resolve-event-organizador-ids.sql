-- Resuelve organizador_id de duelos/torneos sin depender de RLS del club autenticado.
-- Usado por la app para metadata.organizador_id en participaciones multiclub.
-- Ejecutar en Supabase SQL Editor (staging → prod).

CREATE OR REPLACE FUNCTION public.riviera_resolve_event_organizador_ids(
  p_duelo_ids uuid[] DEFAULT '{}'::uuid[],
  p_torneo_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS TABLE (
  evento_id uuid,
  organizador_id uuid,
  tipo_evento text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id, d.organizador_id, 'duelo_2v2'::text
  FROM public.duelos_2v2 d
  WHERE cardinality(p_duelo_ids) > 0
    AND d.id = ANY(p_duelo_ids)
  UNION ALL
  SELECT t.id, t.organizador_id, 'torneo_express'::text
  FROM public.torneo_express t
  WHERE cardinality(p_torneo_ids) > 0
    AND t.id = ANY(p_torneo_ids);
$$;

COMMENT ON FUNCTION public.riviera_resolve_event_organizador_ids(uuid[], uuid[]) IS
  'Lookup organizador_id por evento para scope multiclub (bypass RLS cross-club).';

GRANT EXECUTE ON FUNCTION public.riviera_resolve_event_organizador_ids(uuid[], uuid[])
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
