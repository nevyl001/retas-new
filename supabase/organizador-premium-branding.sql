-- Upgrade visual premium por organizador (admin maestro).
-- Ejecutar en Supabase SQL Editor después de admin-master-controls.sql

ALTER TABLE public.organizador_game_modes
  ADD COLUMN IF NOT EXISTS premium_branding_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS branding_key text NULL;

COMMENT ON COLUMN public.organizador_game_modes.premium_branding_enabled IS
  'Si true, la cuenta usa colores/logos del manifiesto branding_key (upgrade premium).';

COMMENT ON COLUMN public.organizador_game_modes.branding_key IS
  'Clave del manifiesto registrado en la app (ej. hack-padel). Ignorada si premium_branding_enabled es false.';

-- Lectura pública segura (solo flags de branding, sin modos ni permisos).
CREATE OR REPLACE FUNCTION public.get_organizador_branding_public(p_org_id uuid)
RETURNS TABLE (
  premium_branding_enabled boolean,
  branding_key text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(ogm.premium_branding_enabled, false),
    NULLIF(TRIM(ogm.branding_key), '')
  FROM public.organizador_game_modes ogm
  WHERE ogm.organizador_id = p_org_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_organizador_branding_public(uuid) TO anon, authenticated;
