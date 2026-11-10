-- Correctiva. Acepta 6 horas de anticipación en el recordatorio.
-- No toca la cola por sí sola. No instala cron. No envía correos.
-- No reaplicar 0111 ni 0113.

ALTER TABLE public.liga_notificaciones_config
  DROP CONSTRAINT IF EXISTS liga_notificaciones_config_recordatorio_horas_check;

ALTER TABLE public.liga_notificaciones_config
  ADD CONSTRAINT liga_notificaciones_config_recordatorio_horas_check
  CHECK (recordatorio_horas IN (24, 12, 6, 2));

CREATE OR REPLACE FUNCTION public.liga_notificaciones_sync_recordatorio(p_jornada_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jornada public.liga_jornadas%ROWTYPE;
  v_activa boolean;
  v_horas integer;
  v_hora time;
  v_distintas integer;
  v_inicio timestamptz;
  v_cuando timestamptz;
  v_liga_nombre text;
  v_fecha text;
  v_hora_txt text;
  v_ruta text;
  v_jugador record;
  v_elegible text;
  v_cuerpo text;
BEGIN
  SELECT * INTO v_jornada FROM public.liga_jornadas WHERE id = p_jornada_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_jornada.estado = 'completed' OR v_jornada.fecha IS NULL THEN
    UPDATE public.liga_notificaciones_queue
       SET estado = 'omitido', motivo = 'cancelado', updated_at = now()
     WHERE jornada_id = v_jornada.id
       AND tipo = 'recordatorio_jornada'
       AND origen = 'automatico'
       AND estado = 'pendiente';
    RETURN;
  END IF;

  SELECT COALESCE(recordatorio_auto, false), COALESCE(recordatorio_horas, 24)
    INTO v_activa, v_horas
  FROM public.liga_notificaciones_config
  WHERE liga_id = v_jornada.liga_id;

  IF NOT COALESCE(v_activa, false) THEN
    UPDATE public.liga_notificaciones_queue
       SET estado = 'omitido', motivo = 'automatizacion_apagada', updated_at = now()
     WHERE jornada_id = v_jornada.id
       AND tipo = 'recordatorio_jornada'
       AND origen = 'automatico'
       AND estado = 'pendiente';
    RETURN;
  END IF;
  IF v_horas NOT IN (24, 12, 6, 2) THEN
    v_horas := 24;
  END IF;

  SELECT count(DISTINCT hora_inicio)
    INTO v_distintas
  FROM public.liga_partidos
  WHERE jornada_id = v_jornada.id
    AND COALESCE(ronda, 1) = 1
    AND hora_inicio IS NOT NULL;

  IF v_distintas IS DISTINCT FROM 1 THEN
    UPDATE public.liga_notificaciones_queue
       SET estado = 'omitido',
           motivo = CASE WHEN COALESCE(v_distintas, 0) = 0
                         THEN 'jornada_sin_horario'
                         ELSE 'horarios_distintos' END,
           programado_para = NULL,
           updated_at = now()
     WHERE jornada_id = v_jornada.id
       AND tipo = 'recordatorio_jornada'
       AND origen = 'automatico'
       AND estado = 'pendiente';
    RETURN;
  END IF;

  SELECT min(hora_inicio)
    INTO v_hora
  FROM public.liga_partidos
  WHERE jornada_id = v_jornada.id
    AND COALESCE(ronda, 1) = 1
    AND hora_inicio IS NOT NULL;

  v_inicio := (v_jornada.fecha + v_hora) AT TIME ZONE 'America/Mexico_City';
  v_cuando := v_inicio - make_interval(hours => v_horas);
  IF v_cuando <= now() OR v_inicio <= now() THEN
    UPDATE public.liga_notificaciones_queue
       SET estado = 'omitido', motivo = 'recordatorio_vencido', updated_at = now()
     WHERE jornada_id = v_jornada.id
       AND tipo = 'recordatorio_jornada'
       AND origen = 'automatico'
       AND estado = 'pendiente';
    RETURN;
  END IF;

  SELECT nombre INTO v_liga_nombre FROM public.ligas WHERE id = v_jornada.liga_id;
  v_liga_nombre := COALESCE(NULLIF(btrim(v_liga_nombre), ''), 'tu liga');
  v_fecha := to_char(v_jornada.fecha, 'DD/MM/YYYY');
  v_hora_txt := to_char(v_hora, 'HH24:MI');
  v_ruta := '/public/liga/' || v_jornada.liga_id::text || '/jornada/' || v_jornada.numero::text;
  v_cuerpo :=
    'Hola {{nombre}},' || E'\n\n'
    || 'La Jornada ' || v_jornada.numero::text || ' de {{liga}} es el '
    || v_fecha || ' a las ' || v_hora_txt || ' hrs.' || E'\n\n'
    || 'Fecha: ' || v_fecha || E'\n'
    || 'Horario: ' || v_hora_txt || ' hrs' || E'\n'
    || 'Sede: {{club}}' || E'\n\n'
    || 'RESULTADOS_URL:' || v_ruta;

  FOR v_jugador IN
    SELECT DISTINCT jugador_id
    FROM public.liga_inscripciones
    WHERE liga_id = v_jornada.liga_id
  LOOP
    v_elegible := public.liga_notificacion_elegible_manual(v_jornada.liga_id, v_jugador.jugador_id);
    INSERT INTO public.liga_notificaciones_queue (
      liga_id, liga_jugador_id, tipo, idempotency_key, estado, motivo,
      asunto, cuerpo_texto, origen, programado_para, jornada_id, jornada_numero
    ) VALUES (
      v_jornada.liga_id,
      v_jugador.jugador_id,
      'recordatorio_jornada',
      'auto:recordatorio:' || v_jornada.liga_id::text || ':' || v_jornada.id::text || ':' || v_jugador.jugador_id::text,
      CASE WHEN v_elegible = 'ok' THEN 'pendiente' ELSE 'omitido' END,
      CASE WHEN v_elegible = 'ok' THEN NULL ELSE left(v_elegible, 80) END,
      left('Recordatorio — ' || v_liga_nombre || ' | Jornada ' || v_jornada.numero::text, 180),
      v_cuerpo,
      'automatico',
      CASE WHEN v_elegible = 'ok' THEN v_cuando ELSE NULL END,
      v_jornada.id,
      v_jornada.numero
    )
    ON CONFLICT (idempotency_key) DO UPDATE
      SET programado_para = EXCLUDED.programado_para,
          asunto = EXCLUDED.asunto,
          cuerpo_texto = EXCLUDED.cuerpo_texto,
          estado = EXCLUDED.estado,
          motivo = EXCLUDED.motivo,
          updated_at = now()
      WHERE public.liga_notificaciones_queue.estado IN ('pendiente', 'omitido')
        AND public.liga_notificaciones_queue.origen = 'automatico';
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.liga_notificaciones_sync_recordatorio(uuid) FROM PUBLIC, anon, authenticated;
