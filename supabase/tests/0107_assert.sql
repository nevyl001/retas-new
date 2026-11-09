-- Confirma que 0107 no se aplicó. Solo lectura.

DO $$
DECLARE
  v_src text;
  v_pendientes int;
BEGIN
  SELECT pg_get_functiondef(
    'public.liga_notificacion_elegible_manual(uuid,uuid)'::regprocedure
  ) INTO v_src;

  IF v_src LIKE '%registro_autorizado_at%'
     OR v_src LIKE '%riviera_jugadores%' THEN
    RAISE EXCEPTION 'FAIL: la elegibilidad está usando el alta como autorización';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'liga_inscritos_contacto_autorizado'
      AND pg_get_function_result(p.oid) LIKE '%registro_autorizado_at%'
  ) THEN
    RAISE EXCEPTION 'FAIL: contacto expone registro_autorizado_at';
  END IF;

  SELECT count(*) INTO v_pendientes
  FROM public.liga_notificaciones_queue q
  JOIN public.liga_jugadores lj ON lj.id = q.liga_jugador_id
  WHERE q.estado = 'pendiente'
    AND q.attempts = 0
    AND q.tipo = 'bienvenida'
    AND lj.nombre IN ('Zaid', 'Eduardo L');

  IF v_pendientes <> 2 THEN
    RAISE EXCEPTION 'FAIL: Zaid o Eduardo L ya no están pendientes sin intentos';
  END IF;

  RAISE NOTICE 'PASS: 0107 no aplicada';
END $$;
