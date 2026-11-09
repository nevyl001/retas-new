-- =============================================================================
-- CONCILIACIÓN MÍNIMA 0100 — SOLO preferencias_guardar (PROPUESTA)
-- =============================================================================
-- Única DIFF real del fingerprint (tras corregir falsos FALTA por firmas PG16).
--
-- REVOKE/GRANT solos NO arreglan el cuerpo de la función.
-- Este script hace CREATE OR REPLACE con las reglas de 0100:
--   * consentimiento_sin_evidencia
--   * correo_sin_verificacion
--   * SECURITY INVOKER + search_path = public, pg_temp
--
-- NO DROP. NO DELETE. NO toca tablas. NO registra baseline.
-- NO aplicar sin autorización explícita + backup.
-- =============================================================================

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

  -- Un interruptor del administrador no acredita titularidad del correo.
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

-- Lectura de control (opcional, tras apply autorizado):
-- SELECT prosecdef,
--        array_to_string(proconfig, ',') AS config,
--        (prosrc ILIKE '%correo_sin_verificacion%') AS has_correo_rule,
--        (prosrc ILIKE '%consentimiento_sin_evidencia%') AS has_consent_rule
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname = 'liga_notificaciones_preferencias_guardar';
