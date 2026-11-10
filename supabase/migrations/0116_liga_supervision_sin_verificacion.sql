-- Correctiva. No reaplicar 0111 ni 0114.
-- El administrador autenticado guarda el correo de supervisión.
-- Las copias y la prueba usan esa dirección. No hace falta un enlace.
-- Se conservan columnas, cupo de tres pruebas por hora, cupo de tres
-- cambios de dirección por hora, permisos y el historial.
-- No toca la cola, las jornadas, los resultados ni el ranking.

UPDATE public.liga_notificaciones_config
   SET supervision_activa = false
 WHERE supervision_activa = true
   AND supervision_email IS NULL;

ALTER TABLE public.liga_notificaciones_config
  DROP CONSTRAINT IF EXISTS liga_notificaciones_config_supervision_activa_check;

ALTER TABLE public.liga_notificaciones_config
  ADD CONSTRAINT liga_notificaciones_config_supervision_activa_check
  CHECK (supervision_activa = false OR supervision_email IS NOT NULL);

CREATE OR REPLACE FUNCTION public.liga_notificaciones_proteger_supervision()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_anterior text := NULLIF(lower(btrim(coalesce(OLD.supervision_email, ''))), '');
  v_nuevo text := NULLIF(lower(btrim(coalesce(NEW.supervision_email, ''))), '');
BEGIN
  IF current_user IN ('authenticated', 'anon', 'authenticator') THEN
    NEW.supervision_email := v_nuevo;
    IF v_nuevo IS NOT NULL AND (
      char_length(v_nuevo) > 180
      OR v_nuevo LIKE '%@padel.local'
      OR v_nuevo !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
    ) THEN
      RAISE EXCEPTION 'correo_invalido' USING ERRCODE = '22023';
    END IF;
    IF NEW.supervision_activa IS TRUE AND v_nuevo IS NULL THEN
      NEW.supervision_activa := false;
    END IF;
    IF v_nuevo IS DISTINCT FROM v_anterior THEN
      IF OLD.supervision_solicitud_ventana IS NOT NULL
         AND OLD.supervision_solicitud_ventana > now() - interval '1 hour'
         AND OLD.supervision_solicitudes >= 3 THEN
        RAISE EXCEPTION 'limite_alcanzado' USING ERRCODE = 'P0001';
      END IF;
      NEW.supervision_email_verificado := NULL;
      NEW.supervision_verificado_at := NULL;
      NEW.supervision_token_hash := NULL;
      NEW.supervision_token_expira := NULL;
      NEW.supervision_intentos := 0;
      NEW.supervision_solicitudes := CASE
        WHEN OLD.supervision_solicitud_ventana IS NULL
          OR OLD.supervision_solicitud_ventana <= now() - interval '1 hour' THEN 1
        ELSE COALESCE(OLD.supervision_solicitudes, 0) + 1
      END;
      NEW.supervision_solicitud_ventana := CASE
        WHEN OLD.supervision_solicitud_ventana IS NULL
          OR OLD.supervision_solicitud_ventana <= now() - interval '1 hour' THEN now()
        ELSE OLD.supervision_solicitud_ventana
      END;
      NEW.supervision_prueba_conteo := OLD.supervision_prueba_conteo;
      NEW.supervision_prueba_ventana := OLD.supervision_prueba_ventana;
    ELSE
      NEW.supervision_email_verificado := OLD.supervision_email_verificado;
      NEW.supervision_verificado_at := OLD.supervision_verificado_at;
      NEW.supervision_token_hash := OLD.supervision_token_hash;
      NEW.supervision_token_expira := OLD.supervision_token_expira;
      NEW.supervision_intentos := OLD.supervision_intentos;
      NEW.supervision_solicitudes := OLD.supervision_solicitudes;
      NEW.supervision_solicitud_ventana := OLD.supervision_solicitud_ventana;
      NEW.supervision_prueba_conteo := OLD.supervision_prueba_conteo;
      NEW.supervision_prueba_ventana := OLD.supervision_prueba_ventana;
    END IF;
  END IF;
  RETURN NEW;
END;
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
  v_email text := NULLIF(lower(btrim(coalesce(p_email, ''))), '');
  v_alcance text := CASE WHEN p_alcance = 'todas' THEN 'todas' ELSE 'resultados' END;
  v_activa boolean := COALESCE(p_activa, false) AND v_email IS NOT NULL;
  v_anterior text;
  v_conteo integer;
  v_ventana timestamptz;
BEGIN
  IF v_actor IS NULL OR NOT public.liga_notificaciones_actor_puede(p_liga_id, v_actor) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
  END IF;
  IF v_email IS NOT NULL AND (
    char_length(v_email) > 180
    OR v_email LIKE '%@padel.local'
    OR v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'correo_invalido');
  END IF;

  SELECT NULLIF(lower(btrim(coalesce(supervision_email, ''))), ''),
         supervision_solicitudes,
         supervision_solicitud_ventana
    INTO v_anterior, v_conteo, v_ventana
  FROM public.liga_notificaciones_config
  WHERE liga_id = p_liga_id
  FOR UPDATE;

  IF v_email IS DISTINCT FROM v_anterior
     AND v_ventana IS NOT NULL
     AND v_ventana > now() - interval '1 hour'
     AND COALESCE(v_conteo, 0) >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'limite_alcanzado');
  END IF;

  INSERT INTO public.liga_notificaciones_config (
    liga_id, supervision_email, supervision_activa, supervision_alcance,
    supervision_solicitudes, supervision_solicitud_ventana, updated_at
  ) VALUES (
    p_liga_id,
    v_email,
    v_activa,
    v_alcance,
    CASE WHEN v_email IS NULL THEN 0 ELSE 1 END,
    CASE WHEN v_email IS NULL THEN NULL ELSE now() END,
    now()
  )
  ON CONFLICT (liga_id) DO UPDATE
    SET supervision_email = EXCLUDED.supervision_email,
        supervision_activa = EXCLUDED.supervision_activa,
        supervision_alcance = EXCLUDED.supervision_alcance,
        supervision_email_verificado = CASE
          WHEN public.liga_notificaciones_config.supervision_email
               IS DISTINCT FROM EXCLUDED.supervision_email THEN NULL
          ELSE public.liga_notificaciones_config.supervision_email_verificado
        END,
        supervision_verificado_at = CASE
          WHEN public.liga_notificaciones_config.supervision_email
               IS DISTINCT FROM EXCLUDED.supervision_email THEN NULL
          ELSE public.liga_notificaciones_config.supervision_verificado_at
        END,
        supervision_token_hash = CASE
          WHEN public.liga_notificaciones_config.supervision_email
               IS DISTINCT FROM EXCLUDED.supervision_email THEN NULL
          ELSE public.liga_notificaciones_config.supervision_token_hash
        END,
        supervision_token_expira = CASE
          WHEN public.liga_notificaciones_config.supervision_email
               IS DISTINCT FROM EXCLUDED.supervision_email THEN NULL
          ELSE public.liga_notificaciones_config.supervision_token_expira
        END,
        supervision_intentos = CASE
          WHEN public.liga_notificaciones_config.supervision_email
               IS DISTINCT FROM EXCLUDED.supervision_email THEN 0
          ELSE public.liga_notificaciones_config.supervision_intentos
        END,
        supervision_solicitudes = CASE
          WHEN public.liga_notificaciones_config.supervision_email
               IS NOT DISTINCT FROM EXCLUDED.supervision_email
            THEN public.liga_notificaciones_config.supervision_solicitudes
          WHEN public.liga_notificaciones_config.supervision_solicitud_ventana IS NULL
            OR public.liga_notificaciones_config.supervision_solicitud_ventana
               <= now() - interval '1 hour' THEN 1
          ELSE COALESCE(public.liga_notificaciones_config.supervision_solicitudes, 0) + 1
        END,
        supervision_solicitud_ventana = CASE
          WHEN public.liga_notificaciones_config.supervision_email
               IS NOT DISTINCT FROM EXCLUDED.supervision_email
            THEN public.liga_notificaciones_config.supervision_solicitud_ventana
          WHEN public.liga_notificaciones_config.supervision_solicitud_ventana IS NULL
            OR public.liga_notificaciones_config.supervision_solicitud_ventana
               <= now() - interval '1 hour' THEN now()
          ELSE public.liga_notificaciones_config.supervision_solicitud_ventana
        END,
        updated_at = now();

  RETURN jsonb_build_object('ok', true, 'motivo', NULL);
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
     AND char_length(supervision_email) <= 180
     AND supervision_email NOT LIKE '%@padel.local'
     AND supervision_email ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
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
        AND char_length(supervision_email) <= 180
        AND supervision_email NOT LIKE '%@padel.local'
        AND supervision_email ~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
        AND supervision_prueba_ventana > now() - interval '1 hour'
        AND supervision_prueba_conteo >= 3
    ) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'limite_alcanzado');
    END IF;
    RETURN jsonb_build_object('ok', false, 'motivo', 'correo_invalido');
  END IF;
  RETURN jsonb_build_object('ok', true, 'motivo', NULL, 'email', v_email);
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
BEGIN
  RETURN jsonb_build_object('ok', false, 'motivo', 'verificacion_retirada');
END;
$$;

CREATE OR REPLACE FUNCTION public.confirmar_verificacion_supervision_liga(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN jsonb_build_object('ok', false, 'motivo', 'invalido');
END;
$$;

CREATE OR REPLACE FUNCTION public.inspeccionar_verificacion_supervision_liga(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN jsonb_build_object('ok', false, 'motivo', 'invalido');
END;
$$;

REVOKE ALL ON FUNCTION public.liga_notificaciones_proteger_supervision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.liga_notificaciones_guardar_supervision(uuid, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.liga_notificaciones_guardar_supervision(uuid, text, boolean, text) TO authenticated;
REVOKE ALL ON FUNCTION public.liga_notificaciones_reservar_prueba_supervision(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.liga_notificaciones_reservar_prueba_supervision(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.liga_notificaciones_emitir_verificacion_supervision(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.liga_notificaciones_emitir_verificacion_supervision(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.confirmar_verificacion_supervision_liga(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirmar_verificacion_supervision_liga(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.inspeccionar_verificacion_supervision_liga(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inspeccionar_verificacion_supervision_liga(text) TO anon, authenticated;
