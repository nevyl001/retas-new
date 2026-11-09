-- Pruebas de verificación de correo (0101) sobre la base desechable.

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
  to_regclass('public.liga_notificaciones_verificaciones') IS NOT NULL
  AND to_regclass('public.liga_notificaciones_verificacion_outbox') IS NOT NULL,
  'tablas de verificacion'
);

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM public.solicitar_verificacion_correo_liga(
    '33333333-3333-4333-8333-333333333333',
    '55555555-5555-4555-8555-555555555555'
  );
  RAISE EXCEPTION 'FAIL: anon creo solicitud';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: anon no solicita verificacion';
END $$;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
SET ROLE authenticated;
SELECT public._assert(
  (public.solicitar_verificacion_correo_liga(
    '33333333-3333-4333-8333-333333333333',
    '55555555-5555-4555-8555-555555555555'
  )->>'motivo') = 'sin_permiso',
  'otro club no solicita'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SET ROLE authenticated;

INSERT INTO public.liga_notificaciones_preferencias (liga_id, liga_jugador_id, admin_habilitado)
VALUES ('33333333-3333-4333-8333-333333333333', '55555555-5555-4555-8555-555555555555', false)
ON CONFLICT (liga_id, liga_jugador_id) DO UPDATE SET admin_habilitado = false, correo_verificado = false,
  correo_verificacion_origen = NULL, correo_verificado_email = NULL;

SELECT public._assert(
  (public.solicitar_verificacion_correo_liga(
    '33333333-3333-4333-8333-333333333333',
    '55555555-5555-4555-8555-555555555555'
  )->>'motivo') = 'deshabilitado',
  'sin autorizacion admin no solicita'
);

UPDATE public.liga_notificaciones_preferencias
  SET admin_habilitado = true
  WHERE liga_jugador_id = '55555555-5555-4555-8555-555555555555';

INSERT INTO public.liga_notificaciones_config (liga_id, bienvenida_pausada, modo_prueba)
VALUES ('33333333-3333-4333-8333-333333333333', true, true)
ON CONFLICT (liga_id) DO UPDATE SET modo_prueba = true, bienvenida_pausada = true;

INSERT INTO public.liga_notificaciones_preferencias (liga_id, liga_jugador_id, admin_habilitado)
VALUES ('33333333-3333-4333-8333-333333333333', '77777777-7777-4777-8777-777777777777', true)
ON CONFLICT (liga_id, liga_jugador_id) DO UPDATE SET admin_habilitado = true;

SELECT public._assert(
  (public.solicitar_verificacion_correo_liga(
    '33333333-3333-4333-8333-333333333333',
    '77777777-7777-4777-8777-777777777777'
  )->>'motivo') = 'correo_ambiguo',
  'correo compartido no recibe enlace'
);

-- El token solo sale con GUC de servidor (desde 0101 endurecida; 0102 reafirma).
-- modo_prueba=true de la liga NO basta.
SELECT set_config('app.liga_notificaciones_simulacion', '', false);
SELECT public._assert(
  NOT ((public.solicitar_verificacion_correo_liga(
    '33333333-3333-4333-8333-333333333333',
    '55555555-5555-4555-8555-555555555555'
  )) ? 'enlace_simulado'),
  'modo_prueba no filtra enlace_simulado sin GUC'
);
-- Limpia la solicitud creada arriba para no chocar con demasiado_pronto/limite.
UPDATE public.liga_notificaciones_verificaciones
  SET estado = 'invalidado', invalidated_at = now()
  WHERE liga_jugador_id = '55555555-5555-4555-8555-555555555555'
    AND estado = 'pendiente';
UPDATE public.liga_notificaciones_verificaciones
  SET created_at = now() - interval '20 minutes'
  WHERE liga_jugador_id = '55555555-5555-4555-8555-555555555555';

SELECT set_config('app.liga_notificaciones_simulacion', 'true', false);

DO $$
DECLARE
  v_res jsonb;
  v_token text;
  v_hash text;
  v_confirm jsonb;
  v_reuse jsonb;
  v_bienvenida jsonb;
BEGIN
  v_res := public.solicitar_verificacion_correo_liga(
    '33333333-3333-4333-8333-333333333333',
    '55555555-5555-4555-8555-555555555555'
  );

  PERFORM public._assert(
    (v_res->>'ok')::boolean
    AND (v_res->>'simulado')::boolean
    AND (v_res->>'enlace_simulado') LIKE '%/public/verificar-correo?t=%',
    'solicitud simulada con enlace de prueba'
  );

  PERFORM public._assert(
    (SELECT count(*) FROM public.liga_notificaciones_verificaciones
      WHERE liga_jugador_id = '55555555-5555-4555-8555-555555555555'
        AND estado = 'pendiente') = 1,
    'una sola solicitud pendiente'
  );

  v_token := substring(v_res->>'enlace_simulado' from 't=([a-f0-9]+)');
  SELECT token_hash INTO v_hash
  FROM public.liga_notificaciones_verificaciones
  WHERE liga_jugador_id = '55555555-5555-4555-8555-555555555555'
    AND estado = 'pendiente'
  LIMIT 1;

  PERFORM public._assert(
    char_length(v_hash) = 64
    AND v_hash ~ '^[a-f0-9]+$'
    AND v_hash IS DISTINCT FROM v_token
    AND position(v_token in coalesce(v_hash, '')) = 0,
    'el token en claro no se guarda; solo el hash'
  );

  PERFORM public._assert(
    (public.solicitar_verificacion_correo_liga(
      '33333333-3333-4333-8333-333333333333',
      '55555555-5555-4555-8555-555555555555'
    )->>'motivo') = 'demasiado_pronto',
    'reenvio inmediato bloqueado'
  );

  PERFORM public._assert(
    (public.inspeccionar_verificacion_correo_liga(v_token)->>'estado') = 'pendiente',
    'GET deja el token pendiente'
  );

  PERFORM public._assert(
    (SELECT estado FROM public.liga_notificaciones_verificaciones
      WHERE token_hash = v_hash) = 'pendiente',
    'inspeccionar no consume'
  );

  v_confirm := public.confirmar_verificacion_correo_liga(v_token);
  PERFORM public._assert(
    (v_confirm->>'estado') = 'confirmado',
    'POST confirma'
  );

  PERFORM public._assert(
    (SELECT correo_verificado
        AND correo_verificacion_origen = 'enlace_de_confirmacion'
        AND correo_verificado_email = 'control-real@example.test'
        AND admin_habilitado = true
        AND consentimiento_estado = 'sin_autorizacion'
      FROM public.liga_notificaciones_preferencias
      WHERE liga_jugador_id = '55555555-5555-4555-8555-555555555555'),
    'confirma solo la verificacion; no habilita ni inventa consentimiento'
  );

  v_reuse := public.confirmar_verificacion_correo_liga(v_token);
  PERFORM public._assert(
    (v_reuse->>'estado') = 'utilizado',
    'reutilizar el token falla'
  );

  v_bienvenida := public.encolar_bienvenida_liga(
    '33333333-3333-4333-8333-333333333333',
    '55555555-5555-4555-8555-555555555555'
  );
  PERFORM public._assert(
    (v_bienvenida->>'motivo') = 'sin_autorizacion',
    'verificar no crea bienvenida automatica'
  );
END $$;

SELECT public._assert(
  (SELECT count(*) FROM public.liga_notificaciones_queue) = 0
  AND (SELECT bienvenida_pausada FROM public.liga_notificaciones_config
    WHERE liga_id = '33333333-3333-4333-8333-333333333333'),
  'cola vacia y liga sigue pausada'
);

SELECT set_config('app.liga_notificaciones_simulacion', '', false);
RESET ROLE;

UPDATE public.liga_jugadores
  SET email = 'otro@example.test'
  WHERE id = '55555555-5555-4555-8555-555555555555';

SELECT public._assert(
  (SELECT correo_verificado_email FROM public.liga_notificaciones_preferencias
    WHERE liga_jugador_id = '55555555-5555-4555-8555-555555555555')
    = 'control-real@example.test',
  'el email acreditado sigue siendo el anterior'
);

UPDATE public.liga_jugadores
  SET email = 'control-real@example.test'
  WHERE id = '55555555-5555-4555-8555-555555555555';

SELECT public._assert(
  to_regclass('public.notificaciones_eventos_queue') IS NULL,
  'Torneo Express intacto'
);

SELECT public._assert(
  (SELECT count(*) FROM public.liga_inscripciones) = 3
  AND (SELECT count(*) FROM public.liga_jugadores) = 3,
  'inscripciones y jugadores intactos'
);
