SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

SELECT public._assert(
  (SELECT count(*) FROM public.liga_notificaciones_queue
    WHERE liga_jugador_id = '55555555-5555-4555-8555-555555555555'
      AND estado = 'pendiente') = 1,
  'la concurrencia dejo una sola bienvenida pendiente'
);

SET ROLE authenticated;
SELECT public._assert(
  (public.encolar_bienvenida_liga(
    '33333333-3333-4333-8333-333333333333',
    '55555555-5555-4555-8555-555555555555'
  )->>'motivo') = 'ya_encolado',
  'repetir el encolado no duplica'
);

UPDATE public.liga_notificaciones_preferencias
  SET admin_habilitado = false
  WHERE liga_jugador_id = '55555555-5555-4555-8555-555555555555';

SELECT public._assert(
  (public.pausar_bienvenida_pendiente_liga(
    '33333333-3333-4333-8333-333333333333',
    '55555555-5555-4555-8555-555555555555'
  )->>'ok') = 'true',
  'deshabilitar puede pausar lo pendiente'
);

SELECT public._assert(
  (SELECT estado FROM public.liga_notificaciones_queue
    WHERE liga_jugador_id = '55555555-5555-4555-8555-555555555555') = 'pausado',
  'el pendiente queda pausado'
);

RESET ROLE;

SELECT public._assert(
  (SELECT nombre FROM public.liga_jugadores WHERE id = '55555555-5555-4555-8555-555555555555') = 'Jugador Control'
  AND (SELECT email FROM public.liga_jugadores WHERE id = '66666666-6666-4666-8666-666666666666') = 'prueba@padel.local'
  AND (SELECT count(*) FROM public.liga_inscripciones) = 3
  AND (SELECT count(*) FROM public.liga_jugadores) = 3,
  'despues de encolar, jugadores e inscripciones siguen igual'
);

SELECT public._assert(
  to_regclass('public.notificaciones_eventos_queue') IS NULL,
  'no se creo la cola de Torneo Express'
);
