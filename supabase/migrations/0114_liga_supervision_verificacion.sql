-- NO APLICAR. Medido en Production el 2026-11-10: las funciones y columnas
-- de verificación ya existen y no están en schema_migrations. Este archivo
-- aborta antes de reemplazarlas. La protección de columnas ya vive como 0115.
-- No registra schema_migrations. No usa supabase db push.
--
-- No reemplaza liga_notificaciones_sync_recordatorio.
-- No modifica la cola, jornadas, partidos, resultados, ranking ni autorizaciones.
-- No marca ningún correo como verificado: eso solo ocurre cuando el dueño
-- abre el enlace y llama a confirmar_verificacion_supervision_liga.
-- No añade el CHECK de supervision_activa: la fila actual está activa sin
-- verificación y ese CHECK abortaría la migración.

DO $$
BEGIN
  IF to_regprocedure('public.confirmar_verificacion_supervision_liga(text)') IS NOT NULL
     OR to_regprocedure('public.liga_notificaciones_emitir_verificacion_supervision(uuid, uuid)') IS NOT NULL
  THEN
    RAISE EXCEPTION '0114 ya esta materializada. No reaplicar: reemplazaria funciones vivas.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'liga_notificaciones_config'
      AND c.contype IN ('p', 'u')
      AND pg_get_constraintdef(c.oid) ILIKE '%liga_id%'
  ) THEN
    RAISE EXCEPTION 'liga_notificaciones_config.liga_id no es unico';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'extensions'
      AND p.proname = 'digest'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'extensions'
      AND p.proname = 'gen_random_bytes'
  ) THEN
    RAISE EXCEPTION 'pgcrypto en extensions no esta disponible';
  END IF;
END $$;

ALTER TABLE public.liga_notificaciones_config
  ADD COLUMN IF NOT EXISTS supervision_token_hash text,
  ADD COLUMN IF NOT EXISTS supervision_token_expira timestamptz,
  ADD COLUMN IF NOT EXISTS supervision_intentos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supervision_solicitudes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supervision_solicitud_ventana timestamptz,
  ADD COLUMN IF NOT EXISTS supervision_prueba_conteo integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supervision_prueba_ventana timestamptz;

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

REVOKE ALL ON FUNCTION public.liga_notificaciones_guardar_supervision(uuid, text, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirmar_verificacion_supervision_liga(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inspeccionar_verificacion_supervision_liga(text) FROM PUBLIC;
