-- Sincroniza género de clones locales cedidos con el jugador origen.
-- Corrige jugadores que aparecen en varonil y femenil a la vez.
-- Ejecutar en Supabase SQL Editor.

UPDATE public.riviera_jugadores local_rj
SET
  genero = src.genero,
  updated_at = now()
FROM public.organizer_player_access opa
INNER JOIN public.riviera_jugadores src ON src.id = opa.jugador_id
WHERE opa.local_jugador_id = local_rj.id
  AND opa.is_active = true
  AND local_rj.estado = 'activo'
  AND local_rj.genero IS DISTINCT FROM src.genero;
