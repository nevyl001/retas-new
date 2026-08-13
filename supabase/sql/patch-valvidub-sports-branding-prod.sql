-- Valvidub Sports: activar upgrade de branding premium
UPDATE public.organizador_game_modes
SET
  premium_branding_enabled = true,
  branding_key = 'valvidub-sports',
  updated_at = now()
WHERE organizador_id = 'cbc93677-0450-4622-a2fa-2f40947e385b';

SELECT organizador_id, premium_branding_enabled, branding_key
FROM public.organizador_game_modes
WHERE organizador_id = 'cbc93677-0450-4622-a2fa-2f40947e385b';

SELECT *
FROM public.get_organizador_branding_public('cbc93677-0450-4622-a2fa-2f40947e385b'::uuid);
