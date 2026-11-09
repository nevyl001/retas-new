-- 0100: Centro de notificaciones de liga — solo bienvenida.
--
-- NO APLICAR en producción hasta autorización explícita.
-- No envía correos. No toca Torneo Express ni la cola notificaciones_eventos_queue.
-- No hay trigger sobre liga_inscripciones: inscribir a alguien no escribe aquí
-- salvo que el cliente llame a encolar_bienvenida_liga y el jugador ya cumpla
-- autorización, consentimiento, correo verificado y liga sin pausa.
-- Todos nacen sin fila de preferencia, que equivale a deshabilitado.

CREATE TABLE public.liga_notificaciones_config (
  liga_id uuid PRIMARY KEY REFERENCES public.ligas(id) ON DELETE CASCADE,
  bienvenida_pausada boolean NOT NULL DEFAULT true,
  modo_prueba boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.liga_notificaciones_preferencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id uuid NOT NULL REFERENCES public.ligas(id) ON DELETE CASCADE,
  liga_jugador_id uuid NOT NULL REFERENCES public.liga_jugadores(id) ON DELETE CASCADE,
  riviera_jugador_id uuid,
  admin_habilitado boolean NOT NULL DEFAULT false,
  consentimiento_estado text NOT NULL DEFAULT 'sin_autorizacion'
    CHECK (consentimiento_estado IN ('sin_autorizacion', 'autorizado', 'revocado')),
  consentimiento_origen text,
  consentimiento_registrado_at timestamptz,
  consentimiento_registrado_por uuid,
  correo_verificado boolean NOT NULL DEFAULT false,
  correo_verificado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (liga_id, liga_jugador_id),
  CONSTRAINT liga_notificaciones_consentimiento_evidencia CHECK (
    consentimiento_estado <> 'autorizado'
    OR (
      consentimiento_origen IS NOT NULL
      AND btrim(consentimiento_origen) <> ''
      AND lower(btrim(consentimiento_origen)) NOT IN (
        'inscripcion', 'confirmacion_inscripcion', 'tiene_correo', 'email'
      )
      AND consentimiento_registrado_at IS NOT NULL
      AND consentimiento_registrado_por IS NOT NULL
    )
  )
);

CREATE TABLE public.liga_notificaciones_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id uuid NOT NULL REFERENCES public.ligas(id) ON DELETE CASCADE,
  liga_jugador_id uuid NOT NULL,
  inscripcion_id uuid,
  tipo text NOT NULL DEFAULT 'bienvenida' CHECK (tipo = 'bienvenida'),
  idempotency_key text NOT NULL UNIQUE,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'procesando', 'enviado', 'error', 'omitido', 'pausado')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 3),
  motivo text CHECK (motivo IS NULL OR char_length(motivo) <= 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE UNIQUE INDEX liga_notificaciones_queue_una_bienvenida
  ON public.liga_notificaciones_queue (
    liga_id,
    COALESCE(inscripcion_id, '00000000-0000-0000-0000-000000000000'::uuid),
    liga_jugador_id,
    tipo
  )
  WHERE estado IN ('pendiente', 'procesando', 'enviado');

CREATE INDEX liga_notificaciones_queue_pendientes
  ON public.liga_notificaciones_queue (liga_id, estado);

CREATE TABLE public.liga_notificaciones_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id uuid NOT NULL REFERENCES public.ligas(id) ON DELETE CASCADE,
  liga_jugador_id uuid NOT NULL,
  queue_id uuid,
  tipo text NOT NULL CHECK (tipo = 'bienvenida'),
  estado text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  motivo text CHECK (motivo IS NULL OR char_length(motivo) <= 80),
  proveedor_estado text CHECK (proveedor_estado IS NULL OR proveedor_estado IN ('aceptado', 'entregado')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX liga_notificaciones_log_liga
  ON public.liga_notificaciones_log (liga_id, created_at DESC);

COMMENT ON TABLE public.liga_notificaciones_queue IS
  'Cola de bienvenida de liga. No guarda el correo. Independiente de Torneo Express.';
COMMENT ON TABLE public.liga_notificaciones_log IS
  'Historial de bienvenida. proveedor_estado distingue aceptación de Resend y entrega confirmada. No guarda el correo.';

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

    -- Conserva la fecha documentada por el organizador (consentimiento previo).
    IF TG_OP = 'INSERT' THEN
      IF NEW.consentimiento_registrado_at IS NULL THEN
        NEW.consentimiento_registrado_at := now();
      END IF;
      NEW.consentimiento_registrado_por := auth.uid();
    ELSIF OLD.consentimiento_estado IS DISTINCT FROM 'autorizado'
       OR OLD.consentimiento_origen IS DISTINCT FROM NEW.consentimiento_origen THEN
      IF NEW.consentimiento_registrado_at IS NULL THEN
        NEW.consentimiento_registrado_at := now();
      END IF;
      NEW.consentimiento_registrado_por := auth.uid();
    END IF;
  END IF;

  -- No hay un mecanismo que acredite la titularidad del correo.
  -- Un interruptor del administrador no convierte un correo registrado en verificado.
  -- Una fila que ya estuviera verificada puede cambiar otras columnas.
  IF TG_OP = 'INSERT' AND NEW.correo_verificado THEN
    RAISE EXCEPTION 'correo_sin_verificacion'
      USING ERRCODE = '23514';
  ELSIF TG_OP = 'UPDATE'
     AND NEW.correo_verificado
     AND NOT COALESCE(OLD.correo_verificado, false) THEN
    RAISE EXCEPTION 'correo_sin_verificacion'
      USING ERRCODE = '23514';
  END IF;

  IF NOT NEW.correo_verificado THEN
    NEW.correo_verificado_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER liga_notificaciones_preferencias_guardar
  BEFORE INSERT OR UPDATE ON public.liga_notificaciones_preferencias
  FOR EACH ROW
  EXECUTE FUNCTION public.liga_notificaciones_preferencias_guardar();

CREATE OR REPLACE FUNCTION public.liga_notificacion_evaluar_correo(p_liga_jugador_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text;
  v_org uuid;
  v_norm text;
  v_dup integer;
BEGIN
  SELECT NULLIF(btrim(email), ''), organizador_id
    INTO v_email, v_org
  FROM public.liga_jugadores
  WHERE id = p_liga_jugador_id;

  IF v_email IS NULL THEN
    SELECT NULLIF(btrim(rj.email), '')
      INTO v_email
    FROM public.riviera_jugadores rj
    WHERE rj.legacy_liga_jugador_id = p_liga_jugador_id
      AND rj.estado IS DISTINCT FROM 'archivado'
    ORDER BY rj.created_at
    LIMIT 1;
  END IF;

  IF v_email IS NULL THEN
    RETURN 'sin_correo';
  END IF;

  v_norm := lower(v_email);
  IF v_norm !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR v_norm LIKE '%@padel.local' THEN
    RETURN 'correo_invalido';
  END IF;

  SELECT count(*)::integer INTO v_dup
  FROM public.riviera_jugadores rj
  WHERE rj.estado IS DISTINCT FROM 'archivado'
    AND lower(btrim(coalesce(rj.email, ''))) = v_norm;

  IF v_dup > 1 THEN
    RETURN 'correo_ambiguo';
  END IF;

  SELECT count(*)::integer INTO v_dup
  FROM public.liga_jugadores lj
  WHERE lj.organizador_id IS NOT DISTINCT FROM v_org
    AND lower(btrim(coalesce(lj.email, ''))) = v_norm;

  IF v_dup > 1 THEN
    RETURN 'correo_ambiguo';
  END IF;

  RETURN 'ok';
END;
$$;

CREATE OR REPLACE FUNCTION public.encolar_bienvenida_liga(
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
  v_pausada boolean;
  v_pref public.liga_notificaciones_preferencias%ROWTYPE;
  v_correo text;
  v_key text;
  v_existing public.liga_notificaciones_queue%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'encolado', false, 'motivo', 'anon');
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

  SELECT bienvenida_pausada INTO v_pausada
  FROM public.liga_notificaciones_config
  WHERE liga_id = p_liga_id;
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

CREATE OR REPLACE FUNCTION public.pausar_bienvenida_pendiente_liga(
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
  v_count integer := 0;
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

  UPDATE public.liga_notificaciones_queue
    SET estado = 'pausado',
        motivo = 'deshabilitado',
        updated_at = now()
    WHERE liga_id = p_liga_id
      AND liga_jugador_id = p_liga_jugador_id
      AND tipo = 'bienvenida'
      AND estado = 'pendiente';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'pausadas', v_count);
END;
$$;

ALTER TABLE public.liga_notificaciones_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liga_notificaciones_preferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liga_notificaciones_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liga_notificaciones_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY liga_notificaciones_config_admin
  ON public.liga_notificaciones_config
  FOR ALL
  TO authenticated
  USING (
    public.is_master_admin()
    OR EXISTS (
      SELECT 1 FROM public.ligas l
      WHERE l.id = liga_id AND l.organizador_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_master_admin()
    OR EXISTS (
      SELECT 1 FROM public.ligas l
      WHERE l.id = liga_id AND l.organizador_id = auth.uid()
    )
  );

CREATE POLICY liga_notificaciones_preferencias_admin
  ON public.liga_notificaciones_preferencias
  FOR ALL
  TO authenticated
  USING (
    public.is_master_admin()
    OR EXISTS (
      SELECT 1 FROM public.ligas l
      WHERE l.id = liga_id AND l.organizador_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_master_admin()
    OR EXISTS (
      SELECT 1 FROM public.ligas l
      WHERE l.id = liga_id AND l.organizador_id = auth.uid()
    )
  );

CREATE POLICY liga_notificaciones_queue_lectura
  ON public.liga_notificaciones_queue
  FOR SELECT
  TO authenticated
  USING (
    public.is_master_admin()
    OR EXISTS (
      SELECT 1 FROM public.ligas l
      WHERE l.id = liga_id AND l.organizador_id = auth.uid()
    )
  );

CREATE POLICY liga_notificaciones_log_lectura
  ON public.liga_notificaciones_log
  FOR SELECT
  TO authenticated
  USING (
    public.is_master_admin()
    OR EXISTS (
      SELECT 1 FROM public.ligas l
      WHERE l.id = liga_id AND l.organizador_id = auth.uid()
    )
  );

REVOKE ALL ON TABLE public.liga_notificaciones_config FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.liga_notificaciones_preferencias FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.liga_notificaciones_queue FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.liga_notificaciones_log FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.liga_notificaciones_config TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.liga_notificaciones_preferencias TO authenticated;
GRANT SELECT ON TABLE public.liga_notificaciones_queue TO authenticated;
GRANT SELECT ON TABLE public.liga_notificaciones_log TO authenticated;

REVOKE ALL ON FUNCTION public.liga_notificacion_evaluar_correo(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.encolar_bienvenida_liga(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pausar_bienvenida_pendiente_liga(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.encolar_bienvenida_liga(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pausar_bienvenida_pendiente_liga(uuid, uuid) TO authenticated;
