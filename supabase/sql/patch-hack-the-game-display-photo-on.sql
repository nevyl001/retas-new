-- Fix puntual: reactivar fotos en convocatoria pública Hack The Game
-- Causa: tournament_open_registration.display_photo = false
-- (la RPC anula foto_url y /jugar muestra solo iniciales)
--
-- Read-check primero, luego UPDATE. Idempotente.

SELECT public_slug, display_photo, display_rating, title_public, capacity
FROM public.tournament_open_registration
WHERE public_slug = 'ra-c09d3480e5';

UPDATE public.tournament_open_registration
SET display_photo = true,
    updated_at = now()
WHERE public_slug = 'ra-c09d3480e5'
  AND display_photo IS DISTINCT FROM true;

-- Verify: display_photo debe ser true
SELECT
  public_slug,
  display_photo,
  public.get_tournament_open_registration_public('ra-c09d3480e5') ->> 'display_photo'
    AS rpc_display_photo
FROM public.tournament_open_registration
WHERE public_slug = 'ra-c09d3480e5';
