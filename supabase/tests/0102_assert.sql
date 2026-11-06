-- Pruebas de simulación segura (0102) sobre la base desechable.
-- Requiere 0100 + seed + 0101 + 0102 ya aplicados.

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
  to_regprocedure('public.liga_notificaciones_simulacion_activa()') IS NOT NULL,
  'funcion de simulacion de servidor'
);

SELECT public._assert(
  NOT has_function_privilege('anon', 'public.liga_notificaciones_simulacion_activa()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.liga_notificaciones_simulacion_activa()', 'EXECUTE'),
  'clientes no ejecutan el detector de simulacion'
);

-- Preparación como dueño (RLS de verificaciones es solo lectura para el cliente).
UPDATE public.liga_notificaciones_preferencias
  SET admin_habilitado = true,
      correo_verificado = false,
      correo_verificacion_origen = NULL,
      correo_verificado_email = NULL,
      consentimiento_estado = 'sin_autorizacion',
      consentimiento_origen = NULL,
      consentimiento_registrado_at = NULL,
      consentimiento_registrado_por = NULL
  WHERE liga_jugador_id = '55555555-5555-4555-8555-555555555555';

UPDATE public.liga_notificaciones_verificaciones
  SET estado = 'invalidado',
      invalidated_at = now(),
      created_at = now() - interval '2 hours'
  WHERE liga_jugador_id = '55555555-5555-4555-8555-555555555555';

INSERT INTO public.liga_notificaciones_config (liga_id, bienvenida_pausada, modo_prueba)
VALUES ('33333333-3333-4333-8333-333333333333', true, true)
ON CONFLICT (liga_id) DO UPDATE SET modo_prueba = true, bienvenida_pausada = true;

SELECT set_config('app.liga_notificaciones_simulacion', 'false', false);
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SET ROLE authenticated;

DO $$
DECLARE
  v_res jsonb;
BEGIN
  v_res := public.solicitar_verificacion_correo_liga(
    '33333333-3333-4333-8333-333333333333',
    '55555555-5555-4555-8555-555555555555'
  );

  PERFORM public._assert(
    (v_res->>'ok')::boolean
    AND COALESCE((v_res->>'simulado')::boolean, false) = false
    AND (v_res ? 'enlace_simulado') = false,
    'modo_prueba solo no entrega enlace_simulado'
  );

  PERFORM public._assert(
    (SELECT estado FROM public.liga_notificaciones_verificacion_outbox
      WHERE solicitud_id = (v_res->>'solicitud_id')::uuid) = 'omitido',
    'outbox queda omitido sin GUC de simulacion'
  );
END $$;

RESET ROLE;

UPDATE public.liga_notificaciones_verificaciones
  SET estado = 'invalidado',
      invalidated_at = now(),
      created_at = now() - interval '2 hours'
  WHERE liga_jugador_id = '55555555-5555-4555-8555-555555555555';

SELECT set_config('app.liga_notificaciones_simulacion', 'true', false);
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SET ROLE authenticated;

DO $$
DECLARE
  v_res jsonb;
  v_token text;
  v_confirm jsonb;
BEGIN
  v_res := public.solicitar_verificacion_correo_liga(
    '33333333-3333-4333-8333-333333333333',
    '55555555-5555-4555-8555-555555555555'
  );

  PERFORM public._assert(
    (v_res->>'ok')::boolean
    AND (v_res->>'simulado')::boolean
    AND (v_res->>'enlace_simulado') LIKE '%/public/verificar-correo?t=%',
    'con GUC de servidor si hay enlace simulado'
  );

  v_token := substring(v_res->>'enlace_simulado' from 't=([a-f0-9]+)');
  v_confirm := public.confirmar_verificacion_correo_liga(v_token);
  PERFORM public._assert(
    (v_confirm->>'estado') = 'confirmado',
    'enlace simulado local confirma con POST'
  );
END $$;

SELECT set_config('app.liga_notificaciones_simulacion', '', false);
RESET ROLE;

SELECT public._assert(
  (SELECT count(*) FROM public.liga_notificaciones_queue) = 0
  AND (SELECT bienvenida_pausada FROM public.liga_notificaciones_config
    WHERE liga_id = '33333333-3333-4333-8333-333333333333'),
  'cola vacia y liga sigue pausada tras 0102'
);

SELECT public._assert(
  to_regclass('public.notificaciones_eventos_queue') IS NULL,
  'Torneo Express intacto tras 0102'
);
