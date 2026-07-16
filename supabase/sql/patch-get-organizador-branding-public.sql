-- =============================================================================
-- PRODUCCIÓN: get_organizador_branding_public
-- Aplicar en SQL Editor (Primary). Una sola ejecución: BEGIN … COMMIT.
-- No confiar booleano del navegador. DTO público únicamente.
-- =============================================================================

BEGIN;

ALTER TABLE public.organizador_game_modes
  ADD COLUMN IF NOT EXISTS premium_branding_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS branding_key text NULL;

COMMENT ON COLUMN public.organizador_game_modes.premium_branding_enabled IS
  'Si true, vistas públicas pueden mostrar marca del club (no del visitante).';
COMMENT ON COLUMN public.organizador_game_modes.branding_key IS
  'Clave pública de assets del club (ej. /branding/<key>/og.png).';

-- Firma exacta (uuid). DROP obligatorio si cambió el RETURNS TABLE (error 42P13).
DROP FUNCTION IF EXISTS public.get_organizador_branding_public(uuid);

CREATE FUNCTION public.get_organizador_branding_public(p_org_id uuid)
RETURNS TABLE (
  organizador_id uuid,
  premium_branding_enabled boolean,
  branding_key text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ogm.organizador_id,
    (ogm.premium_branding_enabled = true) AS premium_branding_enabled,
    CASE
      WHEN ogm.premium_branding_enabled = true THEN nullif(trim(ogm.branding_key), '')
      ELSE NULL
    END AS branding_key
  FROM public.organizador_game_modes ogm
  WHERE ogm.organizador_id = p_org_id;
$$;

REVOKE ALL ON FUNCTION public.get_organizador_branding_public(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_organizador_branding_public(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_organizador_branding_public(uuid) IS
  'DTO público de branding del organizador anfitrión. Sin email/plan/facturación.';

-- Verificaciones inmediatas (misma transacción)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_organizador_branding_public'
      AND pg_get_function_identity_arguments(p.oid) = 'p_org_id uuid'
  ) THEN
    RAISE EXCEPTION 'get_organizador_branding_public(uuid) no quedó creada';
  END IF;
END $$;

COMMIT;
