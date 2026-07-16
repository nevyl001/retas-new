-- Public branding DTO for club experience + OG share.
-- Server decides premium_branding_enabled; never trust a browser boolean.
-- Returns ONLY public fields (no email, plan, billing, private config).
--
-- DROP first: CREATE OR REPLACE cannot change OUT/return row type (42P13).

ALTER TABLE public.organizador_game_modes
  ADD COLUMN IF NOT EXISTS premium_branding_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS branding_key text NULL;

COMMENT ON COLUMN public.organizador_game_modes.premium_branding_enabled IS
  'Si true, vistas públicas pueden mostrar marca del club (no del visitante).';
COMMENT ON COLUMN public.organizador_game_modes.branding_key IS
  'Clave pública de assets del club (ej. carpeta /branding/<key>/).';

DROP FUNCTION IF EXISTS public.get_organizador_branding_public(uuid);

CREATE OR REPLACE FUNCTION public.get_organizador_branding_public(p_org_id uuid)
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
