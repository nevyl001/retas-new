-- 0102: El enlace simulado de verificación solo existe con un flag de servidor.
--
-- NO APLICAR en producción hasta autorización explícita.
-- modo_prueba de la liga ya no basta para devolver el token al panel.
-- En Production, app.liga_notificaciones_simulacion no debe existir o debe ser distinto de 'true'.
-- El cliente no puede activar ese flag con query params ni con el interruptor de la UI.

CREATE OR REPLACE FUNCTION public.liga_notificaciones_simulacion_activa()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    nullif(current_setting('app.liga_notificaciones_simulacion', true), ''),
    ''
  ) = 'true';
$$;

COMMENT ON FUNCTION public.liga_notificaciones_simulacion_activa() IS
  'true solo si el servidor fijó app.liga_notificaciones_simulacion=true. El organizador no puede activarlo.';

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
  v_outbox_estado text := CASE WHEN v_sim THEN 'simulado' ELSE 'omitido' END;
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

  INSERT INTO public.liga_notificaciones_verificacion_outbox (
    solicitud_id, liga_id, destinatario_enmascarado, estado
  ) VALUES (
    v_id,
    p_liga_id,
    public.liga_notificacion_enmascarar_correo(v_norm),
    v_outbox_estado
  );

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

  -- El token en claro no vuelve al cliente salvo simulación de servidor.
  -- modo_prueba de la liga no abre esta puerta.
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

  RETURN jsonb_build_object(
    'ok', true,
    'motivo', NULL,
    'simulado', false,
    'solicitud_id', v_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.liga_notificaciones_simulacion_activa()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.solicitar_verificacion_correo_liga(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.solicitar_verificacion_correo_liga(uuid, uuid)
  TO authenticated;
