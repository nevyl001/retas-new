-- 0111 — notificaciones automáticas de liga.
-- Preparada para revisión. No aplicar en el proyecto remoto hasta autorización.
-- No instala cron, no guarda secretos y no modifica resultados, puntos ni Riviera ID.
-- El cierre oficial sigue siendo liga_jornadas.estado = completed.

ALTER TABLE public.liga_notificaciones_config
  ADD COLUMN IF NOT EXISTS resultados_auto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resultados_espera_minutos integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS recordatorio_auto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recordatorio_horas integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS bienvenida_auto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bienvenida_auto_desde timestamptz,
  ADD COLUMN IF NOT EXISTS supervision_email text,
  ADD COLUMN IF NOT EXISTS supervision_email_verificado text,
  ADD COLUMN IF NOT EXISTS supervision_verificado_at timestamptz,
  ADD COLUMN IF NOT EXISTS supervision_activa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supervision_alcance text NOT NULL DEFAULT 'resultados',
  ADD COLUMN IF NOT EXISTS supervision_token_hash text,
  ADD COLUMN IF NOT EXISTS supervision_token_expira timestamptz,
  ADD COLUMN IF NOT EXISTS supervision_intentos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supervision_solicitudes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supervision_solicitud_ventana timestamptz,
  ADD COLUMN IF NOT EXISTS supervision_prueba_conteo integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supervision_prueba_ventana timestamptz;

ALTER TABLE public.liga_notificaciones_config
  DROP CONSTRAINT IF EXISTS liga_notificaciones_config_espera_check;
ALTER TABLE public.liga_notificaciones_config
  ADD CONSTRAINT liga_notificaciones_config_espera_check
  CHECK (resultados_espera_minutos IN (0, 5, 15));

ALTER TABLE public.liga_notificaciones_config
  DROP CONSTRAINT IF EXISTS liga_notificaciones_config_horas_check;
ALTER TABLE public.liga_notificaciones_config
  ADD CONSTRAINT liga_notificaciones_config_horas_check
  CHECK (recordatorio_horas IN (24, 12, 2));

ALTER TABLE public.liga_notificaciones_config
  DROP CONSTRAINT IF EXISTS liga_notificaciones_config_supervision_alcance_check;
ALTER TABLE public.liga_notificaciones_config
  ADD CONSTRAINT liga_notificaciones_config_supervision_alcance_check
  CHECK (supervision_alcance IN ('resultados', 'todas'));

ALTER TABLE public.liga_notificaciones_config
  DROP CONSTRAINT IF EXISTS liga_notificaciones_config_supervision_activa_check;
ALTER TABLE public.liga_notificaciones_config
  ADD CONSTRAINT liga_notificaciones_config_supervision_activa_check
  CHECK (
    supervision_activa = false
    OR (
      supervision_email IS NOT NULL
      AND supervision_email = supervision_email_verificado
      AND supervision_verificado_at IS NOT NULL
    )
  );

ALTER TABLE public.liga_notificaciones_queue
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS programado_para timestamptz,
  ADD COLUMN IF NOT EXISTS jornada_id uuid,
  ADD COLUMN IF NOT EXISTS jornada_numero integer;

ALTER TABLE public.liga_notificaciones_queue
  DROP CONSTRAINT IF EXISTS liga_notificaciones_queue_origen_check;
ALTER TABLE public.liga_notificaciones_queue
  ADD CONSTRAINT liga_notificaciones_queue_origen_check
  CHECK (origen IN ('manual', 'automatico'));

ALTER TABLE public.liga_inscripciones
  ADD COLUMN IF NOT EXISTS inscrito_at timestamptz;

ALTER TABLE public.liga_notificaciones_queue
  DROP CONSTRAINT IF EXISTS liga_notificaciones_queue_tipo_check;
ALTER TABLE public.liga_notificaciones_queue
  ADD CONSTRAINT liga_notificaciones_queue_tipo_check
  CHECK (tipo IN (
    'bienvenida', 'aviso_general', 'jornada', 'cambio_horario',
    'felicitacion', 'personalizado', 'resultados_jornada', 'recordatorio_jornada'
  ));

ALTER TABLE public.liga_notificaciones_log
  DROP CONSTRAINT IF EXISTS liga_notificaciones_log_tipo_check;
ALTER TABLE public.liga_notificaciones_log
  ADD CONSTRAINT liga_notificaciones_log_tipo_check
  CHECK (tipo IN (
    'bienvenida', 'aviso_general', 'jornada', 'cambio_horario',
    'felicitacion', 'personalizado', 'resultados_jornada', 'recordatorio_jornada',
    'supervision', 'prueba'
  ));

ALTER TABLE public.liga_notificaciones_log
  ALTER COLUMN liga_jugador_id DROP NOT NULL;

ALTER TABLE public.liga_notificaciones_log
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS origen text,
  ADD COLUMN IF NOT EXISTS jornada_id uuid,
  ADD COLUMN IF NOT EXISTS jornada_numero integer,
  ADD COLUMN IF NOT EXISTS procesados integer,
  ADD COLUMN IF NOT EXISTS aceptados integer,
  ADD COLUMN IF NOT EXISTS errores integer,
  ADD COLUMN IF NOT EXISTS reintentos integer;

CREATE UNIQUE INDEX IF NOT EXISTS liga_notificaciones_log_idempotencia
  ON public.liga_notificaciones_log (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS liga_notificaciones_queue_auto_una
  ON public.liga_notificaciones_queue (
    liga_id,
    COALESCE(jornada_id, '00000000-0000-0000-0000-000000000000'::uuid),
    liga_jugador_id,
    tipo
  )
  WHERE origen = 'automatico';

CREATE INDEX IF NOT EXISTS liga_notificaciones_queue_programadas
  ON public.liga_notificaciones_queue (programado_para)
  WHERE estado = 'pendiente' AND origen = 'automatico';

CREATE OR REPLACE FUNCTION public.liga_notificaciones_marcar_alta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.inscrito_at IS NULL THEN
    NEW.inscrito_at := now();
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

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
    SELECT nombre INTO v_nombre
    FROM public.liga_jugadores
    WHERE id = v_jugador.jugador_id;
    v_nombre := COALESCE(NULLIF(btrim(v_nombre), ''), 'jugador');
    v_elegible := public.liga_notificacion_elegible_manual(v_jornada.liga_id, v_jugador.jugador_id);
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
      CASE WHEN v_elegible = 'ok' THEN 'pendiente' ELSE 'omitido' END,
      CASE WHEN v_elegible = 'ok' THEN NULL ELSE left(v_elegible, 80) END,
      v_asunto,
      v_cuerpo,
      'automatico',
      CASE WHEN v_elegible = 'ok' THEN now() + make_interval(mins => v_espera) ELSE NULL END,
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
  v_inicio timestamptz;
  v_cuando timestamptz;
  v_liga_nombre text;
  v_jugador record;
  v_elegible text;
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
  IF v_horas NOT IN (24, 12, 2) THEN
    v_horas := 24;
  END IF;

  SELECT hora_inicio INTO v_hora
  FROM public.liga_partidos
  WHERE jornada_id = v_jornada.id
    AND COALESCE(ronda, 1) = 1
    AND hora_inicio IS NOT NULL
  ORDER BY hora_inicio
  LIMIT 1;

  v_inicio := (v_jornada.fecha + COALESCE(v_hora, '00:00'::time)) AT TIME ZONE 'America/Mexico_City';
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
      'Hola {{nombre}},' || E'\n\n'
        || 'La Jornada ' || v_jornada.numero::text || ' de ' || v_liga_nombre
        || ' es el ' || to_char(v_jornada.fecha, 'DD/MM/YYYY') || '.' || E'\n\n'
        || 'Fecha: ' || to_char(v_jornada.fecha, 'DD/MM/YYYY') || E'\n'
        || 'Sede: {{club}}' || E'\n\n'
        || 'RESULTADOS_URL:/public/liga/' || v_jornada.liga_id::text
        || '/jornada/' || v_jornada.numero::text,
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

CREATE OR REPLACE FUNCTION public.liga_notificaciones_programar_bienvenida(
  p_liga_id uuid,
  p_jugador_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_desde timestamptz;
  v_activa boolean;
  v_inscripcion uuid;
  v_alta timestamptz;
  v_elegible text;
BEGIN
  SELECT bienvenida_auto, bienvenida_auto_desde
    INTO v_activa, v_desde
  FROM public.liga_notificaciones_config
  WHERE liga_id = p_liga_id;
  IF NOT COALESCE(v_activa, false) OR v_desde IS NULL THEN
    RETURN;
  END IF;

  SELECT id, inscrito_at
    INTO v_inscripcion, v_alta
  FROM public.liga_inscripciones
  WHERE liga_id = p_liga_id AND jugador_id = p_jugador_id
  ORDER BY inscrito_at DESC NULLS LAST
  LIMIT 1;
  IF v_inscripcion IS NULL OR v_alta IS NULL OR v_alta < v_desde THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.liga_notificaciones_queue
    WHERE liga_id = p_liga_id
      AND liga_jugador_id = p_jugador_id
      AND tipo = 'bienvenida'
      AND estado IN ('pendiente', 'procesando', 'enviado')
  ) THEN
    RETURN;
  END IF;

  v_elegible := public.liga_notificacion_elegible_manual(p_liga_id, p_jugador_id);
  IF v_elegible IS DISTINCT FROM 'ok' THEN
    RETURN;
  END IF;

  INSERT INTO public.liga_notificaciones_queue (
    liga_id, liga_jugador_id, inscripcion_id, tipo, idempotency_key,
    estado, origen, programado_para
  ) VALUES (
    p_liga_id,
    p_jugador_id,
    v_inscripcion,
    'bienvenida',
    'auto:bienvenida:' || p_liga_id::text || ':' || v_inscripcion::text || ':' || p_jugador_id::text,
    'pendiente',
    'automatico',
    now()
  )
  ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.liga_notificaciones_trg_jornada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.estado = 'completed' AND OLD.estado IS DISTINCT FROM 'completed' THEN
    PERFORM public.liga_notificaciones_programar_resultados(NEW.id);
  END IF;
  PERFORM public.liga_notificaciones_sync_recordatorio(NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.liga_notificaciones_trg_hora()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.jornada_id IS NOT NULL THEN
    PERFORM public.liga_notificaciones_sync_recordatorio(NEW.jornada_id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.liga_notificaciones_trg_borrar_jornada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.liga_notificaciones_queue
     SET estado = 'omitido', motivo = 'cancelado', updated_at = now()
   WHERE jornada_id = OLD.id
     AND origen = 'automatico'
     AND estado = 'pendiente';
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.liga_notificaciones_trg_alta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.liga_notificaciones_programar_bienvenida(NEW.liga_id, NEW.jugador_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.liga_notificaciones_trg_preferencia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.consentimiento_estado IS DISTINCT FROM 'autorizado' OR NEW.admin_habilitado IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.consentimiento_estado = 'autorizado'
     AND OLD.admin_habilitado IS TRUE THEN
    RETURN NEW;
  END IF;
  PERFORM public.liga_notificaciones_programar_bienvenida(NEW.liga_id, NEW.liga_jugador_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.liga_notificaciones_trg_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.bienvenida_auto IS TRUE AND TG_OP = 'INSERT' THEN
    NEW.bienvenida_auto_desde := now();
  ELSIF NEW.bienvenida_auto IS TRUE
        AND TG_OP = 'UPDATE'
        AND OLD.bienvenida_auto IS DISTINCT FROM true THEN
    NEW.bienvenida_auto_desde := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.liga_notificaciones_trg_config_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jornada uuid;
BEGIN
  IF NEW.recordatorio_auto IS TRUE AND (
    TG_OP = 'INSERT'
    OR (
      TG_OP = 'UPDATE' AND (
        OLD.recordatorio_auto IS DISTINCT FROM true
        OR OLD.recordatorio_horas IS DISTINCT FROM NEW.recordatorio_horas
      )
    )
  ) THEN
    FOR v_jornada IN
      SELECT id FROM public.liga_jornadas
      WHERE liga_id = NEW.liga_id
        AND estado IS DISTINCT FROM 'completed'
        AND fecha IS NOT NULL
        AND fecha >= CURRENT_DATE
    LOOP
      PERFORM public.liga_notificaciones_sync_recordatorio(v_jornada);
    END LOOP;
  ELSIF NEW.recordatorio_auto IS DISTINCT FROM true THEN
    UPDATE public.liga_notificaciones_queue
       SET estado = 'omitido', motivo = 'automatizacion_apagada', updated_at = now()
     WHERE liga_id = NEW.liga_id
       AND tipo = 'recordatorio_jornada'
       AND origen = 'automatico'
       AND estado = 'pendiente';
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS liga_notificaciones_alta_inscripcion ON public.liga_inscripciones;
CREATE TRIGGER liga_notificaciones_alta_inscripcion
  BEFORE INSERT ON public.liga_inscripciones
  FOR EACH ROW
  EXECUTE FUNCTION public.liga_notificaciones_marcar_alta();

DROP TRIGGER IF EXISTS liga_notificaciones_bienvenida_inscripcion ON public.liga_inscripciones;
CREATE TRIGGER liga_notificaciones_bienvenida_inscripcion
  AFTER INSERT ON public.liga_inscripciones
  FOR EACH ROW
  EXECUTE FUNCTION public.liga_notificaciones_trg_alta();

CREATE OR REPLACE FUNCTION public.liga_notificaciones_trg_jornada_nueva()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.liga_notificaciones_sync_recordatorio(NEW.id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS liga_notificaciones_jornada_nueva ON public.liga_jornadas;
CREATE TRIGGER liga_notificaciones_jornada_nueva
  AFTER INSERT ON public.liga_jornadas
  FOR EACH ROW
  EXECUTE FUNCTION public.liga_notificaciones_trg_jornada_nueva();

DROP TRIGGER IF EXISTS liga_notificaciones_jornada_auto ON public.liga_jornadas;
CREATE TRIGGER liga_notificaciones_jornada_auto
  AFTER UPDATE OF estado, fecha ON public.liga_jornadas
  FOR EACH ROW
  EXECUTE FUNCTION public.liga_notificaciones_trg_jornada();

DROP TRIGGER IF EXISTS liga_notificaciones_jornada_borrada ON public.liga_jornadas;
CREATE TRIGGER liga_notificaciones_jornada_borrada
  BEFORE DELETE ON public.liga_jornadas
  FOR EACH ROW
  EXECUTE FUNCTION public.liga_notificaciones_trg_borrar_jornada();

DROP TRIGGER IF EXISTS liga_notificaciones_hora_partido ON public.liga_partidos;
CREATE TRIGGER liga_notificaciones_hora_partido
  AFTER UPDATE OF hora_inicio ON public.liga_partidos
  FOR EACH ROW
  WHEN (OLD.hora_inicio IS DISTINCT FROM NEW.hora_inicio)
  EXECUTE FUNCTION public.liga_notificaciones_trg_hora();

DROP TRIGGER IF EXISTS liga_notificaciones_bienvenida_preferencia ON public.liga_notificaciones_preferencias;
CREATE TRIGGER liga_notificaciones_bienvenida_preferencia
  AFTER INSERT OR UPDATE OF consentimiento_estado, admin_habilitado
  ON public.liga_notificaciones_preferencias
  FOR EACH ROW
  EXECUTE FUNCTION public.liga_notificaciones_trg_preferencia();

DROP TRIGGER IF EXISTS liga_notificaciones_config_auto ON public.liga_notificaciones_config;
CREATE TRIGGER liga_notificaciones_config_auto
  BEFORE INSERT OR UPDATE ON public.liga_notificaciones_config
  FOR EACH ROW
  EXECUTE FUNCTION public.liga_notificaciones_trg_config();

DROP TRIGGER IF EXISTS liga_notificaciones_config_recordatorio ON public.liga_notificaciones_config;
CREATE TRIGGER liga_notificaciones_config_recordatorio
  AFTER INSERT OR UPDATE OF recordatorio_auto, recordatorio_horas
  ON public.liga_notificaciones_config
  FOR EACH ROW
  EXECUTE FUNCTION public.liga_notificaciones_trg_config_after();

REVOKE ALL ON FUNCTION public.liga_notificaciones_marcar_alta() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.liga_notificaciones_programar_resultados(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.liga_notificaciones_sync_recordatorio(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.liga_notificaciones_programar_bienvenida(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.liga_notificaciones_trg_jornada() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.liga_notificaciones_trg_jornada_nueva() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.liga_notificaciones_trg_hora() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.liga_notificaciones_trg_borrar_jornada() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.liga_notificaciones_trg_alta() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.liga_notificaciones_trg_preferencia() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.liga_notificaciones_trg_config() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.liga_notificaciones_trg_config_after() FROM PUBLIC, anon, authenticated;

-- El cron NO se instala aquí. Cuando se autorice Production, un job externo
-- debe llamar la edge function procesar-liga-notificaciones con
-- {"programadas": true} y el header x-liga-notificaciones-secret.
-- Solo entonces, y con LIGA_NOTIFICACIONES_ENVIOS_REALES = true,
-- se procesan filas automáticas ya vencidas. Este archivo no lo enciende.

CREATE OR REPLACE FUNCTION public.liga_notificacion_hash_token(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT encode(extensions.digest(lower(btrim(p_token))::bytea, 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.liga_notificaciones_actor_puede(
  p_liga_id uuid,
  p_actor uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_actor IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.ligas
      WHERE id = p_liga_id AND organizador_id = p_actor
    )
    OR EXISTS (
      SELECT 1 FROM public.admin_users WHERE user_id = p_actor
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.liga_notificaciones_guardar_supervision(
  p_liga_id uuid,
  p_email text,
  p_activa boolean,
  p_alcance text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_alcance text := CASE WHEN p_alcance = 'todas' THEN 'todas' ELSE 'resultados' END;
  v_verificado text;
  v_activa boolean := COALESCE(p_activa, false);
BEGIN
  IF v_actor IS NULL OR NOT public.liga_notificaciones_actor_puede(p_liga_id, v_actor) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
  END IF;
  IF v_email = ''
     OR char_length(v_email) > 180
     OR v_email LIKE '%@padel.local'
     OR v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'correo_invalido');
  END IF;

  SELECT supervision_email_verificado INTO v_verificado
  FROM public.liga_notificaciones_config
  WHERE liga_id = p_liga_id;

  IF v_verificado IS DISTINCT FROM v_email THEN
    v_verificado := NULL;
    v_activa := false;
  END IF;
  IF v_activa AND v_verificado IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'correo_sin_verificacion');
  END IF;

  INSERT INTO public.liga_notificaciones_config (
    liga_id, supervision_email, supervision_email_verificado, supervision_verificado_at,
    supervision_activa, supervision_alcance, supervision_token_hash, supervision_token_expira,
    supervision_intentos, updated_at
  ) VALUES (
    p_liga_id, v_email, v_verificado,
    CASE WHEN v_verificado IS NULL THEN NULL ELSE now() END,
    v_activa, v_alcance, NULL, NULL, 0, now()
  )
  ON CONFLICT (liga_id) DO UPDATE
    SET supervision_email = EXCLUDED.supervision_email,
        supervision_email_verificado = CASE
          WHEN public.liga_notificaciones_config.supervision_email_verificado
               IS NOT DISTINCT FROM EXCLUDED.supervision_email
          THEN public.liga_notificaciones_config.supervision_email_verificado
          ELSE NULL
        END,
        supervision_verificado_at = CASE
          WHEN public.liga_notificaciones_config.supervision_email_verificado
               IS NOT DISTINCT FROM EXCLUDED.supervision_email
          THEN public.liga_notificaciones_config.supervision_verificado_at
          ELSE NULL
        END,
        supervision_activa = CASE
          WHEN public.liga_notificaciones_config.supervision_email_verificado
               IS NOT DISTINCT FROM EXCLUDED.supervision_email
          THEN EXCLUDED.supervision_activa
          ELSE false
        END,
        supervision_alcance = EXCLUDED.supervision_alcance,
        supervision_token_hash = CASE
          WHEN public.liga_notificaciones_config.supervision_email
               IS DISTINCT FROM EXCLUDED.supervision_email
          THEN NULL
          ELSE public.liga_notificaciones_config.supervision_token_hash
        END,
        supervision_token_expira = CASE
          WHEN public.liga_notificaciones_config.supervision_email
               IS DISTINCT FROM EXCLUDED.supervision_email
          THEN NULL
          ELSE public.liga_notificaciones_config.supervision_token_expira
        END,
        updated_at = now();

  RETURN jsonb_build_object('ok', true, 'motivo', NULL, 'verificado', v_verificado IS NOT NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.liga_notificaciones_emitir_verificacion_supervision(
  p_liga_id uuid,
  p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text;
  v_conteo integer;
  v_ventana timestamptz;
  v_token text;
  v_hash text;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
  END IF;
  IF NOT public.liga_notificaciones_actor_puede(p_liga_id, p_actor) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
  END IF;

  SELECT supervision_email, supervision_solicitudes, supervision_solicitud_ventana
    INTO v_email, v_conteo, v_ventana
  FROM public.liga_notificaciones_config
  WHERE liga_id = p_liga_id
  FOR UPDATE;

  IF v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'correo_invalido');
  END IF;
  IF v_ventana IS NOT NULL AND v_ventana > now() - interval '1 hour' AND v_conteo >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'limite_alcanzado');
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := public.liga_notificacion_hash_token(v_token);
  UPDATE public.liga_notificaciones_config
     SET supervision_token_hash = v_hash,
         supervision_token_expira = now() + interval '30 minutes',
         supervision_intentos = 0,
         supervision_solicitudes = CASE
           WHEN v_ventana IS NULL OR v_ventana <= now() - interval '1 hour' THEN 1
           ELSE v_conteo + 1
         END,
         supervision_solicitud_ventana = CASE
           WHEN v_ventana IS NULL OR v_ventana <= now() - interval '1 hour' THEN now()
           ELSE v_ventana
         END
   WHERE liga_id = p_liga_id;

  RETURN jsonb_build_object('ok', true, 'motivo', NULL, 'token', v_token, 'email', v_email);
END;
$$;

CREATE OR REPLACE FUNCTION public.liga_notificaciones_anular_verificacion_supervision(
  p_liga_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RETURN;
  END IF;
  UPDATE public.liga_notificaciones_config
     SET supervision_token_hash = NULL,
         supervision_token_expira = NULL
   WHERE liga_id = p_liga_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirmar_verificacion_supervision_liga(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hash text := public.liga_notificacion_hash_token(coalesce(p_token, ''));
  v_liga uuid;
  v_expira timestamptz;
  v_intentos integer;
BEGIN
  IF v_hash IS NULL OR char_length(btrim(coalesce(p_token, ''))) < 48 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'invalido');
  END IF;
  SELECT liga_id, supervision_token_expira, supervision_intentos
    INTO v_liga, v_expira, v_intentos
  FROM public.liga_notificaciones_config
  WHERE supervision_token_hash = v_hash
  FOR UPDATE;
  IF v_liga IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'invalido');
  END IF;
  IF v_expira IS NULL OR v_expira < now() THEN
    UPDATE public.liga_notificaciones_config
       SET supervision_token_hash = NULL, supervision_token_expira = NULL
     WHERE liga_id = v_liga;
    RETURN jsonb_build_object('ok', false, 'motivo', 'vencido');
  END IF;
  IF v_intentos >= 5 THEN
    UPDATE public.liga_notificaciones_config
       SET supervision_token_hash = NULL, supervision_token_expira = NULL
     WHERE liga_id = v_liga;
    RETURN jsonb_build_object('ok', false, 'motivo', 'limite_alcanzado');
  END IF;
  UPDATE public.liga_notificaciones_config
     SET supervision_email_verificado = supervision_email,
         supervision_verificado_at = now(),
         supervision_token_hash = NULL,
         supervision_token_expira = NULL,
         supervision_intentos = 0
   WHERE liga_id = v_liga;
  RETURN jsonb_build_object('ok', true, 'motivo', 'confirmado');
END;
$$;

CREATE OR REPLACE FUNCTION public.inspeccionar_verificacion_supervision_liga(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hash text := public.liga_notificacion_hash_token(coalesce(p_token, ''));
  v_expira timestamptz;
BEGIN
  IF char_length(btrim(coalesce(p_token, ''))) < 48 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'invalido');
  END IF;
  SELECT supervision_token_expira INTO v_expira
  FROM public.liga_notificaciones_config
  WHERE supervision_token_hash = v_hash;
  IF v_expira IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'invalido');
  END IF;
  IF v_expira < now() THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'vencido');
  END IF;
  RETURN jsonb_build_object('ok', true, 'motivo', 'pendiente');
END;
$$;

CREATE OR REPLACE FUNCTION public.liga_notificaciones_reservar_prueba_supervision(
  p_liga_id uuid,
  p_actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text;
BEGIN
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
  END IF;
  IF NOT public.liga_notificaciones_actor_puede(p_liga_id, p_actor) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
  END IF;

  UPDATE public.liga_notificaciones_config
     SET supervision_prueba_conteo = CASE
           WHEN supervision_prueba_ventana IS NULL
                OR supervision_prueba_ventana <= now() - interval '1 hour' THEN 1
           ELSE supervision_prueba_conteo + 1
         END,
         supervision_prueba_ventana = CASE
           WHEN supervision_prueba_ventana IS NULL
                OR supervision_prueba_ventana <= now() - interval '1 hour' THEN now()
           ELSE supervision_prueba_ventana
         END
   WHERE liga_id = p_liga_id
     AND supervision_email IS NOT NULL
     AND supervision_email = supervision_email_verificado
     AND supervision_verificado_at IS NOT NULL
     AND (
       supervision_prueba_ventana IS NULL
       OR supervision_prueba_ventana <= now() - interval '1 hour'
       OR supervision_prueba_conteo < 3
     )
  RETURNING supervision_email INTO v_email;

  IF v_email IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.liga_notificaciones_config
      WHERE liga_id = p_liga_id
        AND supervision_email IS NOT NULL
        AND supervision_email = supervision_email_verificado
        AND supervision_verificado_at IS NOT NULL
    ) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'limite_alcanzado');
    END IF;
    RETURN jsonb_build_object('ok', false, 'motivo', 'correo_sin_verificacion');
  END IF;
  RETURN jsonb_build_object('ok', true, 'motivo', NULL, 'email', v_email);
END;
$$;

REVOKE ALL ON FUNCTION public.liga_notificaciones_actor_puede(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.liga_notificaciones_emitir_verificacion_supervision(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.liga_notificaciones_anular_verificacion_supervision(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.liga_notificaciones_reservar_prueba_supervision(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.liga_notificaciones_guardar_supervision(uuid, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_verificacion_supervision_liga(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inspeccionar_verificacion_supervision_liga(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.liga_notificaciones_emitir_verificacion_supervision(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.liga_notificaciones_anular_verificacion_supervision(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.liga_notificaciones_reservar_prueba_supervision(uuid, uuid) TO service_role;
