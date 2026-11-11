-- Correctiva. El título premium del correo de resultados ya dice
-- "¡Tu jornada ha terminado, pero tu historia continúa!".
-- No lo repite en cuerpo_texto al programar la cola.
-- No toca ENVIOS_REALES, cron, secretos ni HTML del worker.

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
      'Hola ' || v_nombre || E',\n\n'
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
