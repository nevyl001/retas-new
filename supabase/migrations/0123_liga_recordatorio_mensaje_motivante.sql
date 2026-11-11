-- Recordatorios: sin párrafo duplicado de fecha/horario; mensaje motivante
-- determinista por jugador+liga+jornada (misma semilla FNV-1a que TypeScript).
-- No toca ENVIOS_REALES, cron, secretos ni diseño HTML.

CREATE OR REPLACE FUNCTION public.liga_fnv1a_u32(p_text text)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  h bigint := 2166136261; -- 0x811c9dc5
  i integer;
  c integer;
BEGIN
  FOR i IN 1 .. char_length(p_text) LOOP
    c := ascii(substr(p_text, i, 1));
    h := ((h # c) & 4294967295);
    h := ((h * 16777619) & 4294967295); -- 0x01000193, 32-bit como Math.imul
  END LOOP;
  RETURN h;
END;
$$;

REVOKE ALL ON FUNCTION public.liga_fnv1a_u32(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.liga_fnv1a_u32(text) TO service_role;

CREATE OR REPLACE FUNCTION public.liga_mensaje_motivante_recordatorio(
  p_jugador_id text,
  p_liga_id text,
  p_jornada_numero integer,
  p_jornada_id text DEFAULT ''
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_msgs text[] := ARRAY[
    'Una nueva jornada, una nueva oportunidad para demostrar tu juego. Entra con confianza, pelea cada punto y disfruta la competencia en la cancha.',
    'Cada partido es una oportunidad para mejorar. Confía en tu juego, apoya a tu pareja y deja que el esfuerzo hable en la cancha.',
    'Los grandes partidos se construyen punto a punto. Mantén la concentración, lee cada jugada con calma y disfruta cada intercambio.',
    'Tu mejor versión se construye jugando. Hoy tienes una nueva oportunidad de demostrarlo con actitud firme, foco y juego limpio.',
    'La diferencia está en los detalles: actitud, concentración y ganas de competir. Llega listo, comunica bien y disfruta la cancha.',
    'Cada punto cuenta, pero también cada experiencia. Juega con inteligencia, compite con pasión y sigue creciendo partido tras partido en la cancha.',
    'Llega con la mente clara y las piernas listas. Hoy se trata de competir limpio, comunicar bien y disfrutar el pádel.',
    'La constancia se nota en cada partido. Confía en tu preparación, disputa cada punto con intención y mantén el ritmo.',
    'No hace falta forzar el resultado: juega con calma, lee la cancha y mantén tu nivel de principio a fin del partido.',
    'El pádel premia a quien insiste. Mantén la actitud, comunica con tu pareja, pelea los balls difíciles y disfruta el duelo.',
    'Hoy vuelve la competencia. Enfócate en tu primer saque, en el siguiente volley y en cada decisión dentro de la cancha.',
    'Entrena la cabeza tanto como el brazo. Concentración, paciencia y juego limpio te llevan lejos en cada jornada bien disputada.',
    'Una jornada más para medir tu progreso. Compite con respeto, exige tu nivel y sal de la cancha mejor que llegaste.',
    'Cuando llega el momento, lo importante es estar presente. Respira, confía en tu juego y disfruta cada rally con atención.',
    'La superación se construye partido a partido. Hoy es otra chance de demostrar tu compromiso y tu lectura de juego.',
    'Juega con carácter sin perder la cabeza. El control emocional también forma parte del buen pádel competitivo de alto nivel.',
    'Confía en tu pareja y en tu lectura de juego. Juntos suman más en cada punto disputado y en cada transición.',
    'El ritmo lo marcas tú. Empieza sólido, mantén la intensidad en los momentos clave y cierra el partido con inteligencia.',
    'Hoy no se trata de impresionar: se trata de competir bien, punto a punto, con orden y hasta el final del cruce.',
    'La cancha espera tu mejor actitud. Disfruta el cruce, pelea los balls difíciles y sigue creciendo con cada partido jugado.',
    'Cada jornada deja una lección. Entra con ganas de aprender, de competir al máximo y de disfrutar el juego limpio.',
    'El buen pádel combina precisión y garra. Busca ese equilibrio hoy en cada intercambio y en cada decisión importante en la cancha.',
    'Mantén la energía alta y el ego bajo. El juego limpio también es una forma clara de ganar respeto en la cancha.',
    'Si el punto se complica, vuelve a lo básico: buena posición, comunicación clara y una decisión firme en la cancha.',
    'Hoy tienes espacio para mejorar un detalle. Elige uno, concéntrate en él y compite con intención de principio a fin.',
    'La rivalidad sana empuja hacia arriba. Respeta al rival, exige tu mejor versión y disfruta cada cruce con buena cabeza.',
    'No subestimes un partido corto ni te apures en uno largo. Juega el punto que tienes delante con cabeza fría.',
    'La constancia vence a la prisa. Llega enfocado, mantén el plan de juego y cierra cada set con claridad total.',
    'Tu progreso se nota cuando compites con propósito. Hoy es otro paso firme en tu camino dentro de la liga.',
    'Disfruta el sonido de la pelota y el reto de cada jugada. Estás aquí para competir limpio y seguir creciendo.',
    'Actitud firme y manos suaves. Ese equilibrio define partidos difíciles, jornadas largas y duelos bien jugados durante toda la competencia.',
    'Que la presión no te robe el gusto por jugar. Compite en serio, respira entre puntos y disfruta el pádel de verdad.'
  ];
  v_n integer := array_length(v_msgs, 1);
  v_seed text;
  v_seed_prev text;
  v_idx integer;
  v_idx_prev integer;
  v_num integer := GREATEST(0, COALESCE(p_jornada_numero, 0));
BEGIN
  IF v_n IS NULL OR v_n < 1 THEN
    RETURN 'Cada partido cuenta. Compite con actitud y disfruta la cancha.';
  END IF;
  v_seed := lower(btrim(COALESCE(p_jugador_id, ''))) || '|' ||
            lower(btrim(COALESCE(p_liga_id, ''))) || '|' ||
            v_num::text || '|' ||
            lower(btrim(COALESCE(p_jornada_id, '')));
  v_idx := (public.liga_fnv1a_u32(v_seed) % v_n)::integer;
  IF v_n = 1 THEN
    RETURN v_msgs[1];
  END IF;
  v_seed_prev := lower(btrim(COALESCE(p_jugador_id, ''))) || '|' ||
                 lower(btrim(COALESCE(p_liga_id, ''))) || '|' ||
                 GREATEST(0, v_num - 1)::text || '|' ||
                 lower(btrim(COALESCE(p_jornada_id, '')));
  v_idx_prev := (public.liga_fnv1a_u32(v_seed_prev) % v_n)::integer;
  IF v_idx = v_idx_prev THEN
    v_idx := (v_idx + 1) % v_n;
  END IF;
  RETURN v_msgs[v_idx + 1]; -- arrays 1-based
END;
$$;

REVOKE ALL ON FUNCTION public.liga_mensaje_motivante_recordatorio(text, text, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.liga_mensaje_motivante_recordatorio(text, text, integer, text)
  TO service_role;

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
  v_mensaje text;
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

    v_mensaje := public.liga_mensaje_motivante_recordatorio(
      v_jugador.jugador_id::text,
      v_jornada.liga_id::text,
      v_jornada.numero,
      v_jornada.id::text
    );
    v_cuerpo :=
      'Hola {{nombre}},' || E'\n\n'
      || v_mensaje || E'\n\n'
      || 'Fecha: ' || v_fecha || E'\n'
      || 'Horario: ' || v_hora_txt || ' hrs' || E'\n'
      || 'Sede: {{club}}' || E'\n\n'
      || 'RESULTADOS_URL:' || v_ruta;

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
