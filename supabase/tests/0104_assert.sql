-- Asserts de 0104 (worker + gate MANUAL). Base desechable tras 0100–0103.

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
  to_regclass('public.liga_notificaciones_verificacion_envio') IS NOT NULL,
  'tabla staging verificacion worker'
);

SELECT public._assert(
  NOT has_table_privilege('authenticated', 'public.liga_notificaciones_verificacion_envio', 'SELECT'),
  'authenticated sin SELECT en staging de token'
);

SELECT public._assert(
  to_regprocedure('public.encolar_bienvenida_liga(uuid,uuid,text)') IS NOT NULL,
  'encolar con p_origen'
);

-- Organizer fixture (misma seed que 0100/0101).
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SET ROLE authenticated;

-- Origen automático rechazado mientras modo_operacion=manual (default).
SELECT public._assert(
  (public.encolar_bienvenida_liga(
    '33333333-3333-4333-8333-333333333333',
    '55555555-5555-4555-8555-555555555555',
    'inscripcion_confirmada'
  )->>'motivo') = 'modo_manual',
  'auto-encolado bloqueado en modo manual'
);

RESET ROLE;
