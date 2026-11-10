-- Correctiva. Filtra elegibilidad ANTES de insertar en cola (resultados/recordatorio).
-- No borra filas antiguas. No toca ENVIOS_REALES, cron, secretos ni plantillas HTML.
-- No reaplicar 0111/0117. Conserva firma, SECURITY DEFINER y search_path.

CREATE OR REPLACE FUNCTION public.liga_notificacion_motivo_es_elegibilidad(p_motivo text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(btrim(COALESCE(p_motivo, ''))) IN (
    'deshabilitado',
    'sin_autorizacion',
    'sin_correo',
    'correo_invalido',
    'correo_ambiguo'
  );
$$;

REVOKE ALL ON FUNCTION public.liga_notificacion_motivo_es_elegibilidad(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.liga_notificacion_motivo_es_elegibilidad(text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.liga_notificaciones_programar_resultados(p_jornada_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jornada public.liga_jornadas%ROWTYPE;
  v_liga_nombre text;
  v_espera integer;
  v_activa boolean;
  v_ruta text;
  v_fecha text;
  v_jugador record;
  v_elegible text;
  v_nombre text;
  v_cuerpo text;
  v_asunto text;
BEGIN
  SELECT * INTO v_jornada FROM public.liga_jornadas WHERE id = p_jornada_id;
  IF NOT FOUND OR v_jornada.estado IS DISTINCT FROM 'completed' THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.liga_partidos WHERE jornada_id = v_jornada.id
  ) OR EXISTS (
    SELECT 1 FROM public.liga_partidos
    WHERE jornada_id = v_jornada.id AND estado IS DISTINCT FROM 'completed'
  ) THEN
    RETURN;
  END IF;

  SELECT COALESCE(resultados_auto, false),
         COALESCE(resultados_espera_minutos, 5)
    INTO v_activa, v_espera
  FROM public.liga_notificaciones_config
  WHERE liga_id = v_jornada.liga_id;
  IF NOT COALESCE(v_activa, false) THEN
    RETURN;
  END IF;
  IF v_espera NOT IN (0, 5, 15) THEN
    v_espera := 5;
  END IF;
  IF v_jornada.numero IS NULL OR v_jornada.numero < 1 THEN
    RETURN;
  END IF;

  SELECT nombre INTO v_liga_nombre FROM public.ligas WHERE id = v_jornada.liga_id;
  v_liga_nombre := COALESCE(NULLIF(btrim(v_liga_nombre), ''), 'tu liga');
  v_fecha := COALESCE(to_char(v_jornada.fecha, 'DD/MM/YYYY'), 'Por definir');
  v_ruta := '/public/liga/' || v_jornada.liga_id::text || '/jornada/' || v_jornada.numero::text;
  v_asunto := left('Resultados oficiales — ' || v_liga_nombre || ' | Jornada ' || v_jornada.numero::text, 180);

  FOR v_jugador IN
    SELECT DISTINCT i.jugador_id
    FROM public.liga_inscripciones i
    WHERE i.liga_id = v_jornada.liga_id
  LOOP
    v_elegible := public.liga_notificacion_elegible_manual(v_jornada.liga_id, v_jugador.jugador_id);
    IF v_elegible IS DISTINCT FROM 'ok' THEN
      CONTINUE;
    END IF;

    SELECT nombre INTO v_nombre
    FROM public.liga_jugadores
    WHERE id = v_jugador.jugador_id;
    v_nombre := COALESCE(NULLIF(btrim(v_nombre), ''), 'jugador');
    v_cuerpo :=
      E'¡Tu jornada ha terminado, pero tu historia continúa!\n\n'
      || 'Hola ' || v_nombre || E',\n\n'
      || 'Una jornada más de ' || v_liga_nombre || E' ha llegado a su fin.\n\n'
      || E'Cada game ganado, cada punto disputado y cada partido jugado forman parte de tu crecimiento deportivo.\n\n'
      || 'Los resultados oficiales de la Jornada ' || v_jornada.numero::text || E' ya están disponibles.\n\n'
      || 'Fecha: ' || v_fecha || E'\n'
      || E'Sede: {{club}}\n\n'
      || 'RESULTADOS_URL:' || v_ruta;

    INSERT INTO public.liga_notificaciones_queue (
      liga_id, liga_jugador_id, tipo, idempotency_key, estado, motivo,
      asunto, cuerpo_texto, origen, programado_para, jornada_id, jornada_numero
    ) VALUES (
      v_jornada.liga_id,
      v_jugador.jugador_id,
      'resultados_jornada',
      'auto:resultados:' || v_jornada.liga_id::text || ':' || v_jornada.id::text || ':' || v_jugador.jugador_id::text,
      'pendiente',
      NULL,
      v_asunto,
      v_cuerpo,
      'automatico',
      now() + make_interval(mins => v_espera),
      v_jornada.id,
      v_jornada.numero
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;
END;
$$;

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
  v_clave text;
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
    v_clave :=
      'auto:recordatorio:'
      || v_jornada.liga_id::text || ':'
      || v_jornada.id::text || ':'
      || v_jugador.jugador_id::text;
    v_elegible := public.liga_notificacion_elegible_manual(v_jornada.liga_id, v_jugador.jugador_id);

    IF v_elegible IS DISTINCT FROM 'ok' THEN
      -- Solo afecta pendientes aún no procesados. No crea filas nuevas de exclusión.
      UPDATE public.liga_notificaciones_queue
         SET estado = 'omitido',
             motivo = left(v_elegible, 80),
             programado_para = NULL,
             updated_at = now()
       WHERE idempotency_key = v_clave
         AND origen = 'automatico'
         AND estado = 'pendiente';
      CONTINUE;
    END IF;

    INSERT INTO public.liga_notificaciones_queue (
      liga_id, liga_jugador_id, tipo, idempotency_key, estado, motivo,
      asunto, cuerpo_texto, origen, programado_para, jornada_id, jornada_numero
    ) VALUES (
      v_jornada.liga_id,
      v_jugador.jugador_id,
      'recordatorio_jornada',
      v_clave,
      'pendiente',
      NULL,
      left('Recordatorio — ' || v_liga_nombre || ' | Jornada ' || v_jornada.numero::text, 180),
      v_cuerpo,
      'automatico',
      v_cuando,
      v_jornada.id,
      v_jornada.numero
    )
    ON CONFLICT (idempotency_key) DO UPDATE
      SET programado_para = EXCLUDED.programado_para,
          asunto = EXCLUDED.asunto,
          cuerpo_texto = EXCLUDED.cuerpo_texto,
          estado = 'pendiente',
          motivo = NULL,
          updated_at = now()
      WHERE public.liga_notificaciones_queue.origen = 'automatico'
        AND (
          public.liga_notificaciones_queue.estado = 'pendiente'
          OR (
            public.liga_notificaciones_queue.estado = 'omitido'
            AND public.liga_notificacion_motivo_es_elegibilidad(
              public.liga_notificaciones_queue.motivo
            )
          )
        );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.liga_notificaciones_trg_preferencia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jornada uuid;
  v_motivo text;
BEGIN
  IF NEW.consentimiento_estado IS DISTINCT FROM 'autorizado'
     OR NEW.admin_habilitado IS DISTINCT FROM true THEN
    v_motivo := CASE
      WHEN NEW.admin_habilitado IS DISTINCT FROM true THEN 'deshabilitado'
      ELSE 'sin_autorizacion'
    END;
    UPDATE public.liga_notificaciones_queue
       SET estado = 'omitido',
           motivo = v_motivo,
           programado_para = NULL,
           updated_at = now()
     WHERE liga_id = NEW.liga_id
       AND liga_jugador_id = NEW.liga_jugador_id
       AND origen = 'automatico'
       AND estado = 'pendiente';
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.consentimiento_estado = 'autorizado'
     AND OLD.admin_habilitado IS TRUE THEN
    RETURN NEW;
  END IF;

  PERFORM public.liga_notificaciones_programar_bienvenida(NEW.liga_id, NEW.liga_jugador_id);

  FOR v_jornada IN
    SELECT id FROM public.liga_jornadas
    WHERE liga_id = NEW.liga_id
      AND estado IS DISTINCT FROM 'completed'
      AND fecha IS NOT NULL
      AND fecha >= CURRENT_DATE
  LOOP
    PERFORM public.liga_notificaciones_sync_recordatorio(v_jornada);
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.liga_notificaciones_programar_resultados(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.liga_notificaciones_sync_recordatorio(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.liga_notificaciones_trg_preferencia()
  FROM PUBLIC, anon, authenticated;
