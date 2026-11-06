-- Pruebas de 0100 contra PostgreSQL. Fallan con RAISE si una condición no se cumple.

CREATE OR REPLACE FUNCTION public._assert(cond boolean, msg text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT cond THEN
    RAISE EXCEPTION 'FAIL: %', msg;
  END IF;
  RAISE NOTICE 'PASS: %', msg;
END;
$$;

SELECT public._assert(
  to_regclass('public.liga_notificaciones_queue') IS NOT NULL
  AND to_regclass('public.liga_notificaciones_log') IS NOT NULL
  AND to_regclass('public.liga_notificaciones_preferencias') IS NOT NULL
  AND to_regclass('public.liga_notificaciones_config') IS NOT NULL,
  'tablas creadas'
);

SELECT public._assert(
  (SELECT count(*) FROM pg_indexes WHERE indexname IN (
    'liga_notificaciones_queue_una_bienvenida',
    'liga_notificaciones_queue_pendientes',
    'liga_notificaciones_log_liga'
  )) = 3,
  'indices'
);

SELECT public._assert(
  (SELECT count(*) FROM pg_constraint
    WHERE conrelid = 'public.liga_notificaciones_preferencias'::regclass
      AND contype = 'f') >= 2,
  'claves foraneas de preferencias'
);

SELECT public._assert(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.liga_notificaciones_preferencias'::regclass
      AND tgname = 'liga_notificaciones_preferencias_guardar'
      AND NOT tgisinternal
  ),
  'trigger de preferencias'
);

SELECT public._assert(
  to_regprocedure('public.encolar_bienvenida_liga(uuid,uuid)') IS NOT NULL
  AND to_regprocedure('public.pausar_bienvenida_pendiente_liga(uuid,uuid)') IS NOT NULL,
  'funciones'
);

SELECT public._assert(
  (SELECT count(*) FROM public.liga_jugadores) = 3
  AND (SELECT count(*) FROM public.liga_inscripciones) = 3
  AND (SELECT email FROM public.liga_jugadores WHERE id = '55555555-5555-4555-8555-555555555555') = 'control-real@example.test'
  AND (SELECT nombre FROM public.liga_jugadores WHERE id = '66666666-6666-4666-8666-666666666666') = 'Jugador Ficticio',
  'los jugadores y las inscripciones de la prueba siguen intactos antes de operar'
);

-- Anónimo
DO $$
BEGIN
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM 1 FROM public.liga_notificaciones_preferencias;
  RAISE EXCEPTION 'FAIL: el anonimo leyo preferencias';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anonimo sin lectura';
END $$;

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM public.encolar_bienvenida_liga(
    '33333333-3333-4333-8333-333333333333',
    '55555555-5555-4555-8555-555555555555'
  );
  RAISE EXCEPTION 'FAIL: el anonimo ejecuto el encolado';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anonimo no ejecuta el encolado';
END $$;

-- Otro club
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
SET ROLE authenticated;
SELECT public._assert(
  (SELECT count(*) FROM public.liga_notificaciones_preferencias) = 0,
  'otro club no ve preferencias'
);
SELECT public._assert(
  (public.encolar_bienvenida_liga(
    '33333333-3333-4333-8333-333333333333',
    '55555555-5555-4555-8555-555555555555'
  )->>'motivo') = 'sin_permiso',
  'otro club no encola'
);
RESET ROLE;

-- Organizador: no puede verificar el correo
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SET ROLE authenticated;

INSERT INTO public.liga_notificaciones_preferencias (liga_id, liga_jugador_id, admin_habilitado)
VALUES ('33333333-3333-4333-8333-333333333333', '55555555-5555-4555-8555-555555555555', false);

DO $$
BEGIN
  UPDATE public.liga_notificaciones_preferencias
    SET correo_verificado = true
    WHERE liga_jugador_id = '55555555-5555-4555-8555-555555555555';
  RAISE EXCEPTION 'FAIL: el administrador verifico el correo con un update';
EXCEPTION
  WHEN check_violation THEN
    RAISE NOTICE 'PASS: verificar el correo sin mecanismo es rechazado';
END $$;

SELECT public._assert(
  (SELECT correo_verificado FROM public.liga_notificaciones_preferencias
    WHERE liga_jugador_id = '55555555-5555-4555-8555-555555555555') = false,
  'el correo sigue sin verificar'
);

UPDATE public.liga_notificaciones_preferencias
  SET admin_habilitado = true
  WHERE liga_jugador_id = '55555555-5555-4555-8555-555555555555';

UPDATE public.liga_notificaciones_preferencias
  SET admin_habilitado = false
  WHERE liga_jugador_id = '55555555-5555-4555-8555-555555555555';

SELECT public._assert(
  (SELECT admin_habilitado FROM public.liga_notificaciones_preferencias
    WHERE liga_jugador_id = '55555555-5555-4555-8555-555555555555') = false,
  'la autorizacion se puede apagar sin tocar el correo'
);

SELECT public._assert(
  (public.encolar_bienvenida_liga(
    '33333333-3333-4333-8333-333333333333',
    '66666666-6666-4666-8666-666666666666'
  )->>'motivo') = 'deshabilitado',
  'jugador deshabilitado no genera mensaje'
);

SELECT public._assert(
  (SELECT count(*) FROM public.liga_notificaciones_queue) = 0,
  'un rechazo no deja cola'
);

SELECT public._assert(
  NOT has_function_privilege(
    'authenticated',
    'public.liga_notificacion_evaluar_correo(uuid)',
    'EXECUTE'
  ),
  'la evaluacion de correo no es ejecutable por el cliente'
);

RESET ROLE;

-- Preparar un caso elegible solo dentro de esta base desechable,
-- desactivando el trigger el tiempo justo para simular una verificacion futura.
-- El trigger vuelve a quedar activo antes de encolar.
ALTER TABLE public.liga_notificaciones_preferencias
  DISABLE TRIGGER liga_notificaciones_preferencias_guardar;

UPDATE public.liga_notificaciones_preferencias
  SET admin_habilitado = true,
      consentimiento_estado = 'autorizado',
      consentimiento_origen = 'manifestacion_presencial',
      consentimiento_registrado_at = now(),
      consentimiento_registrado_por = '11111111-1111-4111-8111-111111111111',
      correo_verificado = true
  WHERE liga_jugador_id = '55555555-5555-4555-8555-555555555555';

INSERT INTO public.liga_notificaciones_preferencias (
  liga_id, liga_jugador_id, admin_habilitado, consentimiento_estado,
  consentimiento_origen, consentimiento_registrado_at, consentimiento_registrado_por,
  correo_verificado
) VALUES
  ('33333333-3333-4333-8333-333333333333', '66666666-6666-4666-8666-666666666666',
   true, 'autorizado', 'manifestacion_presencial', now(),
   '11111111-1111-4111-8111-111111111111', true),
  ('33333333-3333-4333-8333-333333333333', '77777777-7777-4777-8777-777777777777',
   true, 'autorizado', 'manifestacion_presencial', now(),
   '11111111-1111-4111-8111-111111111111', true);

ALTER TABLE public.liga_notificaciones_preferencias
  ENABLE TRIGGER liga_notificaciones_preferencias_guardar;

UPDATE public.liga_notificaciones_preferencias
  SET correo_verificado = false
  WHERE liga_jugador_id = '55555555-5555-4555-8555-555555555555';

SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SET ROLE authenticated;

DO $$
BEGIN
  UPDATE public.liga_notificaciones_preferencias
    SET correo_verificado = true
    WHERE liga_jugador_id = '55555555-5555-4555-8555-555555555555';
  RAISE EXCEPTION 'FAIL: el trigger quedo desactivado';
EXCEPTION
  WHEN check_violation THEN
    RAISE NOTICE 'PASS: el trigger volvio a rechazar la verificacion';
END $$;

RESET ROLE;
ALTER TABLE public.liga_notificaciones_preferencias
  DISABLE TRIGGER liga_notificaciones_preferencias_guardar;
UPDATE public.liga_notificaciones_preferencias
  SET correo_verificado = true
  WHERE liga_jugador_id = '55555555-5555-4555-8555-555555555555';
ALTER TABLE public.liga_notificaciones_preferencias
  ENABLE TRIGGER liga_notificaciones_preferencias_guardar;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SET ROLE authenticated;

SELECT public._assert(
  (public.encolar_bienvenida_liga(
    '33333333-3333-4333-8333-333333333333',
    '66666666-6666-4666-8666-666666666666'
  )->>'motivo') = 'correo_invalido',
  'correo ficticio se omite'
);

SELECT public._assert(
  (public.encolar_bienvenida_liga(
    '33333333-3333-4333-8333-333333333333',
    '77777777-7777-4777-8777-777777777777'
  )->>'motivo') = 'correo_ambiguo',
  'correo duplicado se omite'
);

SELECT public._assert(
  (public.encolar_bienvenida_liga(
    '33333333-3333-4333-8333-333333333333',
    '55555555-5555-4555-8555-555555555555'
  )->>'motivo') = 'liga_pausada',
  'sin fila de configuracion la liga sigue pausada'
);

INSERT INTO public.liga_notificaciones_config (liga_id)
VALUES ('33333333-3333-4333-8333-333333333333');

SELECT public._assert(
  (SELECT bienvenida_pausada AND modo_prueba
    FROM public.liga_notificaciones_config
    WHERE liga_id = '33333333-3333-4333-8333-333333333333'),
  'la configuracion nueva nace pausada y en modo de prueba'
);

UPDATE public.liga_notificaciones_config
  SET bienvenida_pausada = false
  WHERE liga_id = '33333333-3333-4333-8333-333333333333';

RESET ROLE;

SELECT public._assert(
  (SELECT nombre FROM public.liga_jugadores WHERE id = '55555555-5555-4555-8555-555555555555') = 'Jugador Control'
  AND (SELECT email FROM public.liga_jugadores WHERE id = '55555555-5555-4555-8555-555555555555') = 'control-real@example.test'
  AND (SELECT count(*) FROM public.liga_inscripciones) = 3,
  'el historial deportivo de la prueba no cambio'
);
