-- 0104: Worker Resend + gate MANUAL en backend + cola de verificación pendiente.
--
-- NO APLICAR en producción hasta autorización explícita.
-- Depende de 0100–0103.
-- No envía correos por sí sola. El Edge Function procesar-liga-notificaciones
-- solo llama a Resend si LIGA_NOTIFICACIONES_ENVIOS_REALES=true.
-- No toca Torneo Express ni notificaciones_eventos_queue.
-- No altera resultados, jornadas ni perfiles deportivos.

-- ---------------------------------------------------------------------------
-- 1) Outbox de verificación: pendiente/enviado (además de simulado/omitido/error)
-- ---------------------------------------------------------------------------
ALTER TABLE public.liga_notificaciones_verificacion_outbox
  DROP CONSTRAINT IF EXISTS liga_notificaciones_verificacion_outbox_estado_check;

ALTER TABLE public.liga_notificaciones_verificacion_outbox
  ADD CONSTRAINT liga_notificaciones_verificacion_outbox_estado_check
  CHECK (estado IN ('simulado', 'omitido', 'pendiente', 'enviado', 'error'));

COMMENT ON TABLE public.liga_notificaciones_verificacion_outbox IS
  'Intentos de envío de verificación. pendiente/enviado los procesa el worker con Resend.';

-- Token temporal solo para el worker (service role). Nunca se concede a authenticated.
CREATE TABLE IF NOT EXISTS public.liga_notificaciones_verificacion_envio (
  solicitud_id uuid PRIMARY KEY
    REFERENCES public.liga_notificaciones_verificaciones(id) ON DELETE CASCADE,
  liga_id uuid NOT NULL REFERENCES public.ligas(id) ON DELETE CASCADE,
  email_normalizado text NOT NULL,
  token_claro text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT liga_notificaciones_verificacion_envio_email_norm CHECK (
    email_normalizado = lower(btrim(email_normalizado))
    AND position('@' in email_normalizado) > 1
  ),
  CONSTRAINT liga_notificaciones_verificacion_envio_token CHECK (
    token_claro ~ '^[a-f0-9]{48,128}$'
  )
);

ALTER TABLE public.liga_notificaciones_verificacion_envio ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.liga_notificaciones_verificacion_envio
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.liga_notificaciones_verificacion_envio IS
  'Staging efímero del token en claro para el worker. Sin GRANT a clientes.';

-- ---------------------------------------------------------------------------
-- 2) encolar_bienvenida_liga: origen explícito; automático exige modo DB
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
  v_modo text;
  v_pref public.liga_notificaciones_preferencias%ROWTYPE;
  v_correo text;
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
    coalesce(bienvenida_pausada, true),
    coalesce(modo_operacion, 'manual')
    INTO v_pausada, v_modo
  FROM public.liga_notificaciones_config
  WHERE liga_id = p_liga_id;

  IF v_origen = 'inscripcion_confirmada' AND coalesce(v_modo, 'manual') IS DISTINCT FROM 'automatico' THEN
    RETURN jsonb_build_object('ok', false, 'encolado', false, 'motivo', 'modo_manual');
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

  SELECT * INTO v_pref
  FROM public.liga_notificaciones_preferencias
  WHERE liga_id = p_liga_id AND liga_jugador_id = p_liga_jugador_id;

  IF NOT FOUND OR NOT v_pref.admin_habilitado THEN
    RETURN jsonb_build_object('ok', false, 'encolado', false, 'motivo', 'deshabilitado');
  END IF;
  IF v_pref.consentimiento_estado IS DISTINCT FROM 'autorizado'
     OR v_pref.consentimiento_registrado_at IS NULL
     OR v_pref.consentimiento_origen IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'encolado', false, 'motivo', 'sin_autorizacion');
  END IF;
  IF NOT v_pref.correo_verificado THEN
    RETURN jsonb_build_object('ok', false, 'encolado', false, 'motivo', 'correo_por_verificar');
  END IF;

  v_correo := public.liga_notificacion_evaluar_correo(p_liga_jugador_id);
  IF v_correo IS DISTINCT FROM 'ok' THEN
    RETURN jsonb_build_object('ok', false, 'encolado', false, 'motivo', v_correo);
  END IF;

  IF v_pausada IS NULL OR v_pausada THEN
    RETURN jsonb_build_object('ok', false, 'encolado', false, 'motivo', 'liga_pausada');
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

REVOKE ALL ON FUNCTION public.encolar_bienvenida_liga(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.encolar_bienvenida_liga(uuid, uuid, text) TO authenticated;

-- Compatibilidad: firma de 2 argumentos redirige a origen accion_admin.
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

REVOKE ALL ON FUNCTION public.encolar_bienvenida_liga(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.encolar_bienvenida_liga(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) solicitar_verificacion: staging del token cuando no hay simulación
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.solicitar_verificacion_correo_liga(
  p_liga_id uuid,
  p_liga_jugador_id uuid
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
  v_pref public.liga_notificaciones_preferencias%ROWTYPE;
  v_correo_eval text;
  v_email text;
  v_norm text;
  v_recientes integer;
  v_ultima timestamptz;
  v_token text;
  v_hash text;
  v_id uuid;
  v_expires timestamptz := now() + interval '24 hours';
  v_base text := coalesce(
    nullif(current_setting('app.public_url', true), ''),
    'https://appriviera.rivieraopen.com'
  );
  v_sim boolean := public.liga_notificaciones_simulacion_activa();
  v_outbox_estado text := CASE
    WHEN v_sim THEN 'simulado'
    ELSE 'pendiente'
  END;
  v_idem text;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'anon');
  END IF;

  SELECT organizador_id INTO v_org FROM public.ligas WHERE id = p_liga_id;
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'liga_no_encontrada');
  END IF;
  IF v_org IS DISTINCT FROM v_caller AND NOT v_is_master THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sin_permiso');
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
    RETURN jsonb_build_object('ok', false, 'motivo', 'ya_no_inscrito');
  END IF;

  SELECT * INTO v_pref
  FROM public.liga_notificaciones_preferencias
  WHERE liga_id = p_liga_id AND liga_jugador_id = p_liga_jugador_id;

  IF NOT FOUND OR NOT v_pref.admin_habilitado THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'deshabilitado');
  END IF;

  v_correo_eval := public.liga_notificacion_evaluar_correo(p_liga_jugador_id);
  IF v_correo_eval IS DISTINCT FROM 'ok' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', v_correo_eval);
  END IF;

  SELECT NULLIF(btrim(email), '') INTO v_email
  FROM public.liga_jugadores WHERE id = p_liga_jugador_id;
  IF v_email IS NULL THEN
    SELECT NULLIF(btrim(rj.email), '')
      INTO v_email
    FROM public.riviera_jugadores rj
    WHERE rj.legacy_liga_jugador_id = p_liga_jugador_id
      AND rj.estado IS DISTINCT FROM 'archivado'
    ORDER BY rj.created_at
    LIMIT 1;
  END IF;
  v_norm := lower(btrim(v_email));

  IF v_pref.correo_verificado
     AND v_pref.correo_verificacion_origen = 'enlace_de_confirmacion'
     AND v_pref.correo_verificado_email IS NOT DISTINCT FROM v_norm THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ya_verificado');
  END IF;

  SELECT count(*)::integer, max(created_at)
    INTO v_recientes, v_ultima
  FROM public.liga_notificaciones_verificaciones
  WHERE liga_id = p_liga_id
    AND liga_jugador_id = p_liga_jugador_id
    AND created_at > now() - interval '24 hours';

  IF v_ultima IS NOT NULL AND v_ultima > now() - interval '15 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'demasiado_pronto');
  END IF;
  IF v_recientes >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'limite_alcanzado');
  END IF;

  UPDATE public.liga_notificaciones_verificaciones
    SET estado = 'invalidado',
        invalidated_at = now()
    WHERE liga_id = p_liga_id
      AND liga_jugador_id = p_liga_jugador_id
      AND estado = 'pendiente';

  DELETE FROM public.liga_notificaciones_verificacion_envio e
  USING public.liga_notificaciones_verificaciones v
  WHERE e.solicitud_id = v.id
    AND v.liga_id = p_liga_id
    AND v.liga_jugador_id = p_liga_jugador_id;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := public.liga_notificacion_hash_token(v_token);

  INSERT INTO public.liga_notificaciones_verificaciones (
    liga_id, liga_jugador_id, email_normalizado, token_hash,
    estado, expires_at, solicitado_por
  ) VALUES (
    p_liga_id, p_liga_jugador_id, v_norm, v_hash,
    'pendiente', v_expires, v_caller
  )
  RETURNING id INTO v_id;

  v_idem := 'verificacion:' || p_liga_id::text || ':' || v_id::text;

  INSERT INTO public.liga_notificaciones_verificacion_outbox (
    solicitud_id, liga_id, destinatario_enmascarado, estado
  ) VALUES (
    v_id,
    p_liga_id,
    public.liga_notificacion_enmascarar_correo(v_norm),
    v_outbox_estado
  );

  IF NOT v_sim THEN
    INSERT INTO public.liga_notificaciones_verificacion_envio (
      solicitud_id, liga_id, email_normalizado, token_claro, idempotency_key
    ) VALUES (
      v_id, p_liga_id, v_norm, v_token, v_idem
    );
  END IF;

  INSERT INTO public.liga_notificaciones_log (
    liga_id, liga_jugador_id, tipo, estado, attempts, motivo
  ) VALUES (
    p_liga_id,
    p_liga_jugador_id,
    'verificacion',
    'omitido',
    0,
    CASE WHEN v_sim THEN 'verificacion_simulada' ELSE 'verificacion_solicitada' END
  );

  IF v_sim THEN
    RETURN jsonb_build_object(
      'ok', true,
      'motivo', NULL,
      'simulado', true,
      'solicitud_id', v_id,
      'enlace_simulado',
        rtrim(v_base, '/') || '/public/verificar-correo?t=' || v_token
    );
  END IF;

  -- Production / sin GUC: sin enlace al cliente. El worker entrega el correo.
  RETURN jsonb_build_object(
    'ok', true,
    'motivo', NULL,
    'simulado', false,
    'solicitud_id', v_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.solicitar_verificacion_correo_liga(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.solicitar_verificacion_correo_liga(uuid, uuid) TO authenticated;
