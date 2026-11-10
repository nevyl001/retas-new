-- Guarda automatización con confirmación y reprograma recordatorios pendientes.
-- No instala cron. No toca ENVIOS_REALES, secretos, rankings ni resultados.
-- No envía correos. No modifica filas procesando/enviadas.

CREATE OR REPLACE FUNCTION public.liga_notificaciones_guardar_automatizacion(
  p_liga_id uuid,
  p_modo_operacion text,
  p_resultados_auto boolean,
  p_resultados_espera_minutos integer,
  p_recordatorio_auto boolean,
  p_recordatorio_horas integer,
  p_bienvenida_auto boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_modo text := CASE
    WHEN lower(btrim(COALESCE(p_modo_operacion, ''))) = 'automatico' THEN 'automatico'
    ELSE 'manual'
  END;
  v_espera integer := CASE
    WHEN p_resultados_espera_minutos IN (0, 5, 15) THEN p_resultados_espera_minutos
    ELSE 5
  END;
  v_horas integer := CASE
    WHEN p_recordatorio_horas IN (24, 12, 6, 2) THEN p_recordatorio_horas
    ELSE 24
  END;
  v_jornada uuid;
  v_reprogramados integer := 0;
  v_procesando integer := 0;
  v_antes_horas integer;
  v_despues_horas integer;
  v_recordatorio_auto boolean;
BEGIN
  IF v_actor IS NULL OR NOT public.liga_notificaciones_actor_puede(p_liga_id, v_actor) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
  END IF;

  SELECT recordatorio_horas
    INTO v_antes_horas
  FROM public.liga_notificaciones_config
  WHERE liga_id = p_liga_id
  FOR UPDATE;

  INSERT INTO public.liga_notificaciones_config (
    liga_id,
    modo_operacion,
    resultados_auto,
    resultados_espera_minutos,
    recordatorio_auto,
    recordatorio_horas,
    bienvenida_auto,
    updated_at
  ) VALUES (
    p_liga_id,
    v_modo,
    COALESCE(p_resultados_auto, false),
    v_espera,
    COALESCE(p_recordatorio_auto, false),
    v_horas,
    COALESCE(p_bienvenida_auto, false),
    now()
  )
  ON CONFLICT (liga_id) DO UPDATE
    SET modo_operacion = EXCLUDED.modo_operacion,
        resultados_auto = EXCLUDED.resultados_auto,
        resultados_espera_minutos = EXCLUDED.resultados_espera_minutos,
        recordatorio_auto = EXCLUDED.recordatorio_auto,
        recordatorio_horas = EXCLUDED.recordatorio_horas,
        bienvenida_auto = EXCLUDED.bienvenida_auto,
        updated_at = now();

  SELECT recordatorio_horas, recordatorio_auto
    INTO v_despues_horas, v_recordatorio_auto
  FROM public.liga_notificaciones_config
  WHERE liga_id = p_liga_id;

  IF v_despues_horas IS DISTINCT FROM v_horas THEN
    RETURN jsonb_build_object(
      'ok', false,
      'motivo', 'no_persistido',
      'recordatorio_horas', v_despues_horas
    );
  END IF;

  SELECT count(*)::integer
    INTO v_procesando
  FROM public.liga_notificaciones_queue
  WHERE liga_id = p_liga_id
    AND tipo = 'recordatorio_jornada'
    AND origen = 'automatico'
    AND estado = 'procesando';

  IF v_recordatorio_auto THEN
    FOR v_jornada IN
      SELECT id
      FROM public.liga_jornadas
      WHERE liga_id = p_liga_id
        AND estado IS DISTINCT FROM 'completed'
        AND fecha IS NOT NULL
        AND fecha >= CURRENT_DATE
    LOOP
      PERFORM public.liga_notificaciones_sync_recordatorio(v_jornada);
    END LOOP;
  END IF;

  SELECT count(*)::integer
    INTO v_reprogramados
  FROM public.liga_notificaciones_queue
  WHERE liga_id = p_liga_id
    AND tipo = 'recordatorio_jornada'
    AND origen = 'automatico'
    AND estado = 'pendiente';

  RETURN jsonb_build_object(
    'ok', true,
    'motivo', NULL,
    'modo_operacion', v_modo,
    'resultados_auto', COALESCE(p_resultados_auto, false),
    'resultados_espera_minutos', v_espera,
    'recordatorio_auto', v_recordatorio_auto,
    'recordatorio_horas', v_despues_horas,
    'bienvenida_auto', COALESCE(p_bienvenida_auto, false),
    'horas_anteriores', v_antes_horas,
    'pendientes_recordatorio', v_reprogramados,
    'procesando_recordatorio', v_procesando
  );
END;
$$;

REVOKE ALL ON FUNCTION public.liga_notificaciones_guardar_automatizacion(
  uuid, text, boolean, integer, boolean, integer, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liga_notificaciones_guardar_automatizacion(
  uuid, text, boolean, integer, boolean, integer, boolean
) TO authenticated, service_role;
