-- Nombre visible del organizador/club (lectura pública por UUID).

CREATE OR REPLACE FUNCTION public.get_organizador_display_name(p_organizador_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(trim(u.name), ''),
    NULLIF(trim(u.email), ''),
    'Club'
  )
  FROM public.users u
  WHERE u.id = p_organizador_id;
$$;

COMMENT ON FUNCTION public.get_organizador_display_name(uuid) IS
  'Nombre del club/organizador para branding en ranking y vistas públicas.';

GRANT EXECUTE ON FUNCTION public.get_organizador_display_name(uuid) TO anon, authenticated;
