-- Fase 2.1-B: clon local concedido debe sumar puntos en ranking interno del club.
-- is_public_ranking controla visible_publico, no suma_ranking.

UPDATE public.riviera_jugadores rj
SET
  suma_ranking = true,
  visible_publico = CASE
    WHEN opa.is_public_ranking THEN true
    ELSE rj.visible_publico
  END,
  updated_at = now()
FROM public.organizer_player_access opa
WHERE opa.local_jugador_id = rj.id
  AND opa.is_active = true
  AND (
    rj.suma_ranking IS DISTINCT FROM true
    OR (opa.is_public_ranking AND rj.visible_publico IS DISTINCT FROM true)
  );
