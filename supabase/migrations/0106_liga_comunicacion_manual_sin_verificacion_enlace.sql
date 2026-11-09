-- 0106: Comunicaciones manuales sin verificación por enlace.
--
-- NO APLICAR en Production sin autorización explícita + backup.
-- Compatible con 0100+0105 presentes y 0101–0104 ausentes o parciales.
--
-- Qué hace:
--   * Quita correo_verificado como requisito de encolar (manual).
--   * Pausa de bienvenida solo bloquea origen automático.
--   * Amplía tipos de cola para plantillas manuales.
--   * Añade asunto/cuerpo escapables en cola (texto plano).
--   * RPC encolar_comunicacion_manual_liga para el compositor.
--
-- Qué NO hace:
--   * No instala el sistema de verificación por enlace (0101).
--   * No activa Resend ni automatizaciones.
--   * No toca datos deportivos ni RLS base de 0100.
--   * No DROP de columnas/funciones históricas.

-- ---------------------------------------------------------------------------
-- 1) Columnas de payload para mensajes manuales
-- ---------------------------------------------------------------------------
ALTER TABLE public.liga_notificaciones_queue
  ADD COLUMN IF NOT EXISTS asunto text
    CHECK (asunto IS NULL OR char_length(asunto) <= 180),
  ADD COLUMN IF NOT EXISTS cuerpo_texto text
    CHECK (cuerpo_texto IS NULL OR char_length(cuerpo_texto) <= 8000),
  ADD COLUMN IF NOT EXISTS lote_id uuid;

COMMENT ON COLUMN public.liga_notificaciones_queue.asunto IS
  'Asunto del mensaje manual. Variables ya resueltas en cliente; worker escapa al renderizar.';
COMMENT ON COLUMN public.liga_notificaciones_queue.cuerpo_texto IS
  'Cuerpo en texto plano del mensaje manual. Sin HTML arbitrario.';
COMMENT ON COLUMN public.liga_notificaciones_queue.lote_id IS
  'Identificador de lote del compositor manual (idempotencia por envío).';

-- ---------------------------------------------------------------------------
-- 2) Ampliar tipos permitidos (compatible con CHECK previo de solo bienvenida)
--    En Production el nombre del CHECK inline de 0100 puede variar: se eliminan
--    todos los CHECK de la columna tipo antes de recrear el canónico.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'liga_notificaciones_queue'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%tipo%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.liga_notificaciones_queue DROP CONSTRAINT IF EXISTS %I',
      r.conname
    );
  END LOOP;

  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'liga_notificaciones_log'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%tipo%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.liga_notificaciones_log DROP CONSTRAINT IF EXISTS %I',
      r.conname
    );
  END LOOP;
END $$;

ALTER TABLE public.liga_notificaciones_queue
  ADD CONSTRAINT liga_notificaciones_queue_tipo_check
  CHECK (tipo IN (
    'bienvenida',
    'aviso_general',
    'jornada',
    'cambio_horario',
    'felicitacion',
    'personalizado'
  ));

ALTER TABLE public.liga_notificaciones_log
  ADD CONSTRAINT liga_notificaciones_log_tipo_check
  CHECK (tipo IN (
    'bienvenida',
    'aviso_general',
    'jornada',
    'cambio_horario',
    'felicitacion',
    'personalizado'
  ));

-- Índice único legacy solo para bienvenida; otros tipos usan idempotency_key + lote.
DROP INDEX IF EXISTS public.liga_notificaciones_queue_una_bienvenida;
CREATE UNIQUE INDEX liga_notificaciones_queue_una_bienvenida
  ON public.liga_notificaciones_queue (
    liga_id,
    COALESCE(inscripcion_id, '00000000-0000-0000-0000-000000000000'::uuid),
    liga_jugador_id,
    tipo
  )
  WHERE estado IN ('pendiente', 'procesando', 'enviado')
    AND tipo = 'bienvenida';

-- ---------------------------------------------------------------------------
-- 3) Elegibilidad compartida (sin correo_verificado)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.liga_notificacion_elegible_manual(
  p_liga_id uuid,
  p_liga_jugador_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pref public.liga_notificaciones_preferencias%ROWTYPE;
  v_correo text;
BEGIN
  SELECT * INTO v_pref
  FROM public.liga_notificaciones_preferencias
  WHERE liga_id = p_liga_id AND liga_jugador_id = p_liga_jugador_id;

  IF NOT FOUND OR NOT v_pref.admin_habilitado THEN
    RETURN 'deshabilitado';
  END IF;
  IF v_pref.consentimiento_estado IS DISTINCT FROM 'autorizado'
     OR v_pref.consentimiento_registrado_at IS NULL
     OR v_pref.consentimiento_origen IS NULL
     OR lower(btrim(v_pref.consentimiento_origen)) IN (
       'inscripcion', 'confirmacion_inscripcion', 'tiene_correo', 'email'
     ) THEN
    RETURN 'sin_autorizacion';
  END IF;

  -- Contacto canónico (0105 si está; 0100 si no). NO exige correo_verificado.
  v_correo := public.liga_notificacion_evaluar_correo(p_liga_jugador_id);
  IF v_correo IS DISTINCT FROM 'ok' THEN
    RETURN v_correo;
  END IF;

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.liga_notificacion_elegible_manual(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liga_notificacion_elegible_manual(uuid, uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) encolar_bienvenida_liga (3 args): sin verificación por enlace
--    Si 0104 no está, esta firma se crea aquí.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.encolar_bienvenida_liga(
  p_liga_id uuid,
  p_liga_jugador_id uuid,
  p_origen text DEFAULT 'accion_admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_org uuid;
  v_inscripcion uuid;
  v_en_equipo boolean := false;
  v_pausada boolean;
  v_modo text := 'manual';
  v_elegible text;
  v_key text;
  v_existing public.liga_notificaciones_queue%ROWTYPE;
  v_origen text := lower(btrim(coalesce(p_origen, 'accion_admin')));
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'encolado', false, 'motivo', 'anon');
  END IF;

  IF v_origen NOT IN ('accion_admin', 'inscripcion_confirmada') THEN
    RETURN jsonb_build_object('ok', false, 'encolado', false, 'motivo', 'origen_no_permitido');
  END IF;

  SELECT organizador_id INTO v_org FROM public.ligas WHERE id = p_liga_id;
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'encolado', false, 'motivo', 'liga_no_encontrada');
  END IF;
  IF v_org IS DISTINCT FROM v_caller AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'encolado', false, 'motivo', 'sin_permiso');
  END IF;

  SELECT
    coalesce(c.bienvenida_pausada, true),
    coalesce(to_jsonb(c)->>'modo_operacion', 'manual')
    INTO v_pausada, v_modo
  FROM public.liga_notificaciones_config c
  WHERE c.liga_id = p_liga_id;

  -- Automático permanece apagado salvo modo_operacion=automatico.
  IF v_origen = 'inscripcion_confirmada'
     AND coalesce(v_modo, 'manual') IS DISTINCT FROM 'automatico' THEN
    RETURN jsonb_build_object('ok', false, 'encolado', false, 'motivo', 'modo_manual');
  END IF;

  -- La pausa solo bloquea automatismos; el envío manual confirmado sigue.
  IF v_origen = 'inscripcion_confirmada' AND (v_pausada IS NULL OR v_pausada) THEN
    RETURN jsonb_build_object('ok', false, 'encolado', false, 'motivo', 'liga_pausada');
  END IF;

  SELECT id INTO v_inscripcion
  FROM public.liga_inscripciones
  WHERE liga_id = p_liga_id AND jugador_id = p_liga_jugador_id
  LIMIT 1;

  IF v_inscripcion IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.liga_equipos e
      WHERE e.liga_id = p_liga_id
        AND (e.jugador1_id = p_liga_jugador_id OR e.jugador2_id = p_liga_jugador_id)
    ) INTO v_en_equipo;
  END IF;

  IF v_inscripcion IS NULL AND NOT v_en_equipo THEN
    RETURN jsonb_build_object('ok', false, 'encolado', false, 'motivo', 'ya_no_inscrito');
  END IF;

  v_elegible := public.liga_notificacion_elegible_manual(p_liga_id, p_liga_jugador_id);
  IF v_elegible IS DISTINCT FROM 'ok' THEN
    RETURN jsonb_build_object('ok', false, 'encolado', false, 'motivo', v_elegible);
  END IF;

  v_key := 'bienvenida:' || p_liga_id::text || ':'
    || COALESCE(v_inscripcion::text, 'sin-inscripcion') || ':'
    || p_liga_jugador_id::text;

  SELECT * INTO v_existing
  FROM public.liga_notificaciones_queue
  WHERE idempotency_key = v_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.estado = 'enviado' THEN
      RETURN jsonb_build_object('ok', true, 'encolado', false, 'motivo', 'ya_enviado');
    END IF;
    IF v_existing.estado IN ('pendiente', 'procesando') THEN
      RETURN jsonb_build_object('ok', true, 'encolado', false, 'motivo', 'ya_encolado');
    END IF;
    UPDATE public.liga_notificaciones_queue
      SET estado = 'pendiente',
          attempts = 0,
          motivo = NULL,
          updated_at = now(),
          processed_at = NULL
      WHERE id = v_existing.id;
    RETURN jsonb_build_object('ok', true, 'encolado', true, 'motivo', NULL);
  END IF;

  BEGIN
    INSERT INTO public.liga_notificaciones_queue (
      liga_id, liga_jugador_id, inscripcion_id, tipo, idempotency_key, estado
    ) VALUES (
      p_liga_id, p_liga_jugador_id, v_inscripcion, 'bienvenida', v_key, 'pendiente'
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true, 'encolado', false, 'motivo', 'ya_encolado');
  END;

  RETURN jsonb_build_object('ok', true, 'encolado', true, 'motivo', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.encolar_bienvenida_liga(uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.encolar_bienvenida_liga(uuid, uuid, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.encolar_bienvenida_liga(
  p_liga_id uuid,
  p_liga_jugador_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.encolar_bienvenida_liga(p_liga_id, p_liga_jugador_id, 'accion_admin');
$$;

REVOKE ALL ON FUNCTION public.encolar_bienvenida_liga(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.encolar_bienvenida_liga(uuid, uuid)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Compositor: encolar comunicación manual con plantilla/asunto/cuerpo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.encolar_comunicacion_manual_liga(
  p_liga_id uuid,
  p_liga_jugador_id uuid,
  p_tipo text,
  p_asunto text,
  p_cuerpo text,
  p_lote_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_master boolean := COALESCE(public.is_master_admin(), false);
  v_org uuid;
  v_inscripcion uuid;
  v_en_equipo boolean := false;
  v_elegible text;
  v_tipo text := lower(btrim(coalesce(p_tipo, '')));
  v_asunto text := left(btrim(coalesce(p_asunto, '')), 180);
  v_cuerpo text := left(btrim(coalesce(p_cuerpo, '')), 8000);
  v_key text;
  v_existing public.liga_notificaciones_queue%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'encolado', false, 'motivo', 'anon');
  END IF;

  IF v_tipo NOT IN (
    'bienvenida', 'aviso_general', 'jornada',
    'cambio_horario', 'felicitacion', 'personalizado'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'encolado', false, 'motivo', 'tipo_no_soportado');
  END IF;

  IF p_lote_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'encolado', false, 'motivo', 'lote_requerido');
  END IF;

  IF v_asunto = '' OR v_cuerpo = '' THEN
    RETURN jsonb_build_object('ok', false, 'encolado', false, 'motivo', 'mensaje_incompleto');
  END IF;

  SELECT organizador_id INTO v_org FROM public.ligas WHERE id = p_liga_id;
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'encolado', false, 'motivo', 'liga_no_encontrada');
  END IF;
  IF v_org IS DISTINCT FROM v_caller AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'encolado', false, 'motivo', 'sin_permiso');
  END IF;

  SELECT id INTO v_inscripcion
  FROM public.liga_inscripciones
  WHERE liga_id = p_liga_id AND jugador_id = p_liga_jugador_id
  LIMIT 1;

  IF v_inscripcion IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.liga_equipos e
      WHERE e.liga_id = p_liga_id
        AND (e.jugador1_id = p_liga_jugador_id OR e.jugador2_id = p_liga_jugador_id)
    ) INTO v_en_equipo;
  END IF;

  IF v_inscripcion IS NULL AND NOT v_en_equipo THEN
    RETURN jsonb_build_object('ok', false, 'encolado', false, 'motivo', 'ya_no_inscrito');
  END IF;

  v_elegible := public.liga_notificacion_elegible_manual(p_liga_id, p_liga_jugador_id);
  IF v_elegible IS DISTINCT FROM 'ok' THEN
    RETURN jsonb_build_object('ok', false, 'encolado', false, 'motivo', v_elegible);
  END IF;

  v_key := 'manual:' || v_tipo || ':' || p_liga_id::text || ':'
    || p_lote_id::text || ':' || p_liga_jugador_id::text;

  SELECT * INTO v_existing
  FROM public.liga_notificaciones_queue
  WHERE idempotency_key = v_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.estado = 'enviado' THEN
      RETURN jsonb_build_object('ok', true, 'encolado', false, 'motivo', 'ya_enviado');
    END IF;
    IF v_existing.estado IN ('pendiente', 'procesando') THEN
      RETURN jsonb_build_object('ok', true, 'encolado', false, 'motivo', 'ya_encolado');
    END IF;
    UPDATE public.liga_notificaciones_queue
      SET estado = 'pendiente',
          attempts = 0,
          motivo = NULL,
          asunto = v_asunto,
          cuerpo_texto = v_cuerpo,
          lote_id = p_lote_id,
          updated_at = now(),
          processed_at = NULL
      WHERE id = v_existing.id;
    RETURN jsonb_build_object('ok', true, 'encolado', true, 'motivo', NULL);
  END IF;

  BEGIN
    INSERT INTO public.liga_notificaciones_queue (
      liga_id, liga_jugador_id, inscripcion_id, tipo,
      idempotency_key, estado, asunto, cuerpo_texto, lote_id
    ) VALUES (
      p_liga_id, p_liga_jugador_id, v_inscripcion, v_tipo,
      v_key, 'pendiente', v_asunto, v_cuerpo, p_lote_id
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true, 'encolado', false, 'motivo', 'ya_encolado');
  END;

  RETURN jsonb_build_object('ok', true, 'encolado', true, 'motivo', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.encolar_comunicacion_manual_liga(uuid, uuid, text, text, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.encolar_comunicacion_manual_liga(uuid, uuid, text, text, text, uuid)
  TO authenticated;
