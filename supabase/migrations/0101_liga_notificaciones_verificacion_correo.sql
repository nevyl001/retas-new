-- 0101: Verificación de correo de liga por enlace.
--
-- NO APLICAR en producción hasta autorización explícita.
-- Depende de 0100 (tablas liga_notificaciones_* y liga_notificacion_evaluar_correo).
-- No llama a Resend. No toca Torneo Express. No altera resultados ni jornadas.
-- La verificación acredita posesión del correo; no es consentimiento ni habilitación.

ALTER TABLE public.liga_notificaciones_preferencias
  ADD COLUMN IF NOT EXISTS correo_verificacion_origen text
    CHECK (
      correo_verificacion_origen IS NULL
      OR correo_verificacion_origen = 'enlace_de_confirmacion'
    ),
  ADD COLUMN IF NOT EXISTS correo_verificado_email text;

COMMENT ON COLUMN public.liga_notificaciones_preferencias.correo_verificacion_origen IS
  'Solo enlace_de_confirmacion acredita la verificación. Un interruptor del administrador no.';
COMMENT ON COLUMN public.liga_notificaciones_preferencias.correo_verificado_email IS
  'Correo normalizado acreditado. Si el jugador cambia de dirección, la verificación deja de valer.';

ALTER TABLE public.liga_notificaciones_log
  DROP CONSTRAINT IF EXISTS liga_notificaciones_log_tipo_check;
ALTER TABLE public.liga_notificaciones_log
  ADD CONSTRAINT liga_notificaciones_log_tipo_check
  CHECK (tipo IN ('bienvenida', 'verificacion'));

CREATE TABLE public.liga_notificaciones_verificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id uuid NOT NULL REFERENCES public.ligas(id) ON DELETE CASCADE,
  liga_jugador_id uuid NOT NULL REFERENCES public.liga_jugadores(id) ON DELETE CASCADE,
  email_normalizado text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'confirmado', 'vencido', 'invalidado', 'cancelado')),
  expires_at timestamptz NOT NULL,
  confirmed_at timestamptz,
  invalidated_at timestamptz,
  solicitado_por uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT liga_notificaciones_verificaciones_email_norm CHECK (
    email_normalizado = lower(btrim(email_normalizado))
    AND position('@' in email_normalizado) > 1
  )
);

CREATE INDEX liga_notificaciones_verificaciones_jugador
  ON public.liga_notificaciones_verificaciones (liga_id, liga_jugador_id, created_at DESC);

CREATE INDEX liga_notificaciones_verificaciones_pendientes
  ON public.liga_notificaciones_verificaciones (liga_jugador_id, estado)
  WHERE estado = 'pendiente';

CREATE TABLE public.liga_notificaciones_verificacion_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id uuid NOT NULL REFERENCES public.liga_notificaciones_verificaciones(id) ON DELETE CASCADE,
  liga_id uuid NOT NULL REFERENCES public.ligas(id) ON DELETE CASCADE,
  destinatario_enmascarado text NOT NULL,
  estado text NOT NULL DEFAULT 'simulado'
    CHECK (estado IN ('simulado', 'omitido', 'error')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX liga_notificaciones_verificacion_outbox_liga
  ON public.liga_notificaciones_verificacion_outbox (liga_id, created_at DESC);

COMMENT ON TABLE public.liga_notificaciones_verificaciones IS
  'Solicitudes de verificación. Guarda el hash del token, nunca el token en claro.';
COMMENT ON TABLE public.liga_notificaciones_verificacion_outbox IS
  'Registro de intentos de envío de verificación. En esta fase solo simula; no llama a Resend.';

CREATE OR REPLACE FUNCTION public.liga_notificaciones_preferencias_guardar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();

  IF NEW.consentimiento_estado = 'autorizado' THEN
    IF NEW.consentimiento_origen IS NULL
       OR btrim(NEW.consentimiento_origen) = ''
       OR lower(btrim(NEW.consentimiento_origen)) IN (
         'inscripcion', 'confirmacion_inscripcion', 'tiene_correo', 'email'
       ) THEN
      RAISE EXCEPTION 'consentimiento_sin_evidencia'
        USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'INSERT' THEN
      NEW.consentimiento_registrado_at := now();
      NEW.consentimiento_registrado_por := auth.uid();
    ELSIF OLD.consentimiento_estado IS DISTINCT FROM 'autorizado'
       OR OLD.consentimiento_origen IS DISTINCT FROM NEW.consentimiento_origen THEN
      NEW.consentimiento_registrado_at := now();
      NEW.consentimiento_registrado_por := auth.uid();
    END IF;
  END IF;

  -- Solo la RPC de confirmación (con liga.confirmando_correo=true) puede acreditar.
  IF NEW.correo_verificado THEN
    IF COALESCE(NEW.correo_verificacion_origen, '') IS DISTINCT FROM 'enlace_de_confirmacion'
       OR NEW.correo_verificado_email IS NULL
       OR btrim(NEW.correo_verificado_email) = '' THEN
      RAISE EXCEPTION 'correo_sin_verificacion'
        USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'INSERT'
       OR NOT COALESCE(OLD.correo_verificado, false)
       OR OLD.correo_verificacion_origen IS DISTINCT FROM NEW.correo_verificacion_origen
       OR OLD.correo_verificado_email IS DISTINCT FROM NEW.correo_verificado_email THEN
      IF current_setting('liga.confirmando_correo', true) IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'correo_sin_verificacion'
          USING ERRCODE = '23514';
      END IF;
      NEW.correo_verificado_at := now();
      NEW.correo_verificado_email := lower(btrim(NEW.correo_verificado_email));
    END IF;
  ELSE
    NEW.correo_verificado_at := NULL;
    NEW.correo_verificacion_origen := NULL;
    NEW.correo_verificado_email := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.liga_notificacion_hash_token(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT encode(extensions.digest(lower(btrim(p_token))::bytea, 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.liga_notificacion_enmascarar_correo(p_email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_norm text := lower(btrim(coalesce(p_email, '')));
  v_at integer;
BEGIN
  v_at := position('@' in v_norm);
  IF v_at <= 1 OR v_at = char_length(v_norm) THEN
    RETURN NULL;
  END IF;
  RETURN substr(v_norm, 1, 1) || '***' || substr(v_norm, v_at);
END;
$$;

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
  v_modo_prueba boolean := true;
  v_recientes integer;
  v_ultima timestamptz;
  v_token text;
  v_hash text;
  v_id uuid;
  v_expires timestamptz := now() + interval '24 hours';
  v_base text := coalesce(nullif(current_setting('app.public_url', true), ''), 'https://appriviera.rivieraopen.com');
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

  -- Sin fila de config, modo_prueba queda true (simulación).
  SELECT COALESCE(
    (SELECT modo_prueba FROM public.liga_notificaciones_config WHERE liga_id = p_liga_id),
    true
  ) INTO v_modo_prueba;

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
    'simulado'
  );

  INSERT INTO public.liga_notificaciones_log (
    liga_id, liga_jugador_id, tipo, estado, attempts, motivo
  ) VALUES (
    p_liga_id, p_liga_jugador_id, 'verificacion', 'omitido', 0, 'verificacion_solicitada'
  );

  IF v_modo_prueba THEN
    RETURN jsonb_build_object(
      'ok', true,
      'motivo', NULL,
      'simulado', true,
      'solicitud_id', v_id,
      'enlace_simulado', rtrim(v_base, '/') || '/public/verificar-correo?t=' || v_token
    );
  END IF;

  -- Sin modo de prueba: el enlace no vuelve al cliente. El envío real queda pendiente.
  RETURN jsonb_build_object(
    'ok', true,
    'motivo', NULL,
    'simulado', true,
    'solicitud_id', v_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.inspeccionar_verificacion_correo_liga(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token text := lower(btrim(coalesce(p_token, '')));
  v_hash text;
  v_row public.liga_notificaciones_verificaciones%ROWTYPE;
BEGIN
  -- No consume el token. No revela liga, jugador ni correo.
  IF v_token !~ '^[a-f0-9]{48,128}$' THEN
    RETURN jsonb_build_object('ok', true, 'estado', 'invalido');
  END IF;

  v_hash := public.liga_notificacion_hash_token(v_token);
  SELECT * INTO v_row
  FROM public.liga_notificaciones_verificaciones
  WHERE token_hash = v_hash;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'estado', 'invalido');
  END IF;

  IF v_row.estado = 'pendiente' AND v_row.expires_at <= now() THEN
    UPDATE public.liga_notificaciones_verificaciones
      SET estado = 'vencido', invalidated_at = coalesce(invalidated_at, now())
      WHERE id = v_row.id AND estado = 'pendiente';
    RETURN jsonb_build_object('ok', true, 'estado', 'vencido');
  END IF;

  IF v_row.estado = 'confirmado' THEN
    RETURN jsonb_build_object('ok', true, 'estado', 'utilizado');
  END IF;

  RETURN jsonb_build_object('ok', true, 'estado', v_row.estado);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirmar_verificacion_correo_liga(
  p_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token text := lower(btrim(coalesce(p_token, '')));
  v_hash text;
  v_row public.liga_notificaciones_verificaciones%ROWTYPE;
  v_email text;
  v_norm text;
  v_eval text;
BEGIN
  IF v_token !~ '^[a-f0-9]{48,128}$' THEN
    RETURN jsonb_build_object('ok', false, 'estado', 'invalido');
  END IF;

  v_hash := public.liga_notificacion_hash_token(v_token);

  SELECT * INTO v_row
  FROM public.liga_notificaciones_verificaciones
  WHERE token_hash = v_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'estado', 'invalido');
  END IF;

  IF v_row.estado = 'confirmado' THEN
    RETURN jsonb_build_object('ok', false, 'estado', 'utilizado');
  END IF;

  IF v_row.estado IN ('invalidado', 'cancelado') THEN
    RETURN jsonb_build_object('ok', false, 'estado', v_row.estado);
  END IF;

  IF v_row.estado = 'vencido' OR v_row.expires_at <= now() THEN
    UPDATE public.liga_notificaciones_verificaciones
      SET estado = 'vencido', invalidated_at = coalesce(invalidated_at, now())
      WHERE id = v_row.id AND estado = 'pendiente';
    RETURN jsonb_build_object('ok', false, 'estado', 'vencido');
  END IF;

  v_eval := public.liga_notificacion_evaluar_correo(v_row.liga_jugador_id);
  IF v_eval = 'correo_ambiguo' THEN
    UPDATE public.liga_notificaciones_verificaciones
      SET estado = 'invalidado', invalidated_at = now()
      WHERE id = v_row.id;
    RETURN jsonb_build_object('ok', false, 'estado', 'invalidado');
  END IF;

  SELECT NULLIF(btrim(email), '') INTO v_email
  FROM public.liga_jugadores WHERE id = v_row.liga_jugador_id;
  IF v_email IS NULL THEN
    SELECT NULLIF(btrim(rj.email), '')
      INTO v_email
    FROM public.riviera_jugadores rj
    WHERE rj.legacy_liga_jugador_id = v_row.liga_jugador_id
      AND rj.estado IS DISTINCT FROM 'archivado'
    ORDER BY rj.created_at
    LIMIT 1;
  END IF;
  v_norm := lower(btrim(coalesce(v_email, '')));

  IF v_norm IS DISTINCT FROM v_row.email_normalizado THEN
    UPDATE public.liga_notificaciones_verificaciones
      SET estado = 'invalidado', invalidated_at = now()
      WHERE id = v_row.id;
    RETURN jsonb_build_object('ok', false, 'estado', 'correo_cambio');
  END IF;

  PERFORM set_config('liga.confirmando_correo', 'true', true);

  INSERT INTO public.liga_notificaciones_preferencias (
    liga_id, liga_jugador_id, admin_habilitado,
    consentimiento_estado, correo_verificado,
    correo_verificacion_origen, correo_verificado_email
  ) VALUES (
    v_row.liga_id, v_row.liga_jugador_id, false,
    'sin_autorizacion', true,
    'enlace_de_confirmacion', v_norm
  )
  ON CONFLICT (liga_id, liga_jugador_id) DO UPDATE
    SET correo_verificado = true,
        correo_verificacion_origen = 'enlace_de_confirmacion',
        correo_verificado_email = EXCLUDED.correo_verificado_email,
        updated_at = now();
  -- El UPDATE anterior no toca admin_habilitado ni el consentimiento.

  UPDATE public.liga_notificaciones_verificaciones
    SET estado = 'confirmado',
        confirmed_at = now()
    WHERE id = v_row.id;

  UPDATE public.liga_notificaciones_verificaciones
    SET estado = 'invalidado',
        invalidated_at = now()
    WHERE liga_id = v_row.liga_id
      AND liga_jugador_id = v_row.liga_jugador_id
      AND id IS DISTINCT FROM v_row.id
      AND estado = 'pendiente';

  INSERT INTO public.liga_notificaciones_log (
    liga_id, liga_jugador_id, tipo, estado, attempts, motivo
  ) VALUES (
    v_row.liga_id, v_row.liga_jugador_id, 'verificacion', 'omitido', 0, 'correo_verificado'
  );

  -- No habilita notificaciones, no encola bienvenida, no quita la pausa.
  RETURN jsonb_build_object('ok', true, 'estado', 'confirmado');
END;
$$;

ALTER TABLE public.liga_notificaciones_verificaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liga_notificaciones_verificacion_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY liga_notificaciones_verificaciones_lectura
  ON public.liga_notificaciones_verificaciones
  FOR SELECT
  TO authenticated
  USING (
    public.is_master_admin()
    OR EXISTS (
      SELECT 1 FROM public.ligas l
      WHERE l.id = liga_id AND l.organizador_id = auth.uid()
    )
  );

CREATE POLICY liga_notificaciones_verificacion_outbox_lectura
  ON public.liga_notificaciones_verificacion_outbox
  FOR SELECT
  TO authenticated
  USING (
    public.is_master_admin()
    OR EXISTS (
      SELECT 1 FROM public.ligas l
      WHERE l.id = liga_id AND l.organizador_id = auth.uid()
    )
  );

REVOKE ALL ON TABLE public.liga_notificaciones_verificaciones FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.liga_notificaciones_verificacion_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.liga_notificaciones_verificaciones TO authenticated;
GRANT SELECT ON TABLE public.liga_notificaciones_verificacion_outbox TO authenticated;

REVOKE ALL ON FUNCTION public.liga_notificacion_hash_token(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.liga_notificacion_enmascarar_correo(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.solicitar_verificacion_correo_liga(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inspeccionar_verificacion_correo_liga(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirmar_verificacion_correo_liga(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.solicitar_verificacion_correo_liga(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inspeccionar_verificacion_correo_liga(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_verificacion_correo_liga(text) TO anon, authenticated;
