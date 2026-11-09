-- Assert 0106: comunicaciones manuales sin verificación por enlace.
-- Ejecutar SOLO después de aplicar 0106. Solo lectura (salvo RAISE).

DO $$
DECLARE
  v_src text;
BEGIN
  IF to_regclass('public.liga_notificaciones_preferencias') IS NULL
     OR to_regclass('public.liga_notificaciones_queue') IS NULL
     OR to_regclass('public.liga_notificaciones_config') IS NULL THEN
    RAISE EXCEPTION 'FAIL 0106: faltan tablas 0100 base';
  END IF;

  IF to_regprocedure('public.liga_notificacion_evaluar_correo(uuid)') IS NULL THEN
    RAISE EXCEPTION 'FAIL 0106: falta liga_notificacion_evaluar_correo (0100/0105)';
  END IF;

  IF to_regprocedure('public.liga_notificacion_elegible_manual(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'FAIL 0106: falta liga_notificacion_elegible_manual';
  END IF;

  IF to_regprocedure(
    'public.encolar_comunicacion_manual_liga(uuid,uuid,text,text,text,uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION 'FAIL 0106: falta encolar_comunicacion_manual_liga';
  END IF;

  IF to_regprocedure('public.encolar_bienvenida_liga(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'FAIL 0106: falta encolar_bienvenida_liga(uuid,uuid)';
  END IF;

  IF (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'liga_notificaciones_queue'
      AND column_name IN ('asunto', 'cuerpo_texto', 'lote_id')
  ) <> 3 THEN
    RAISE EXCEPTION 'FAIL 0106: faltan columnas asunto/cuerpo_texto/lote_id';
  END IF;

  SELECT p.prosrc INTO v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'liga_notificacion_elegible_manual'
  LIMIT 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'FAIL 0106: sin cuerpo de elegible_manual';
  END IF;
  -- No debe existir el motivo/gate de verificación por enlace.
  IF v_src ILIKE '%correo_por_verificar%' THEN
    RAISE EXCEPTION 'FAIL 0106: elegible_manual aún exige verificación por enlace';
  END IF;

  IF v_src NOT ILIKE '%admin_habilitado%' THEN
    RAISE EXCEPTION 'FAIL 0106: elegible_manual no exige selección administrativa';
  END IF;
  IF v_src NOT ILIKE '%autorizado%' OR v_src NOT ILIKE '%consentimiento%' THEN
    RAISE EXCEPTION 'FAIL 0106: elegible_manual no exige consentimiento documentado';
  END IF;
  IF v_src NOT ILIKE '%liga_notificacion_evaluar_correo%' THEN
    RAISE EXCEPTION 'FAIL 0106: elegible_manual no valida correo canónico';
  END IF;

  -- Grants: authenticated puede ejecutar; anon no.
  IF has_function_privilege(
    'anon',
    'public.encolar_comunicacion_manual_liga(uuid,uuid,text,text,text,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FAIL 0106: anon no debe EXECUTE encolar_comunicacion_manual_liga';
  END IF;
  IF NOT has_function_privilege(
    'authenticated',
    'public.encolar_comunicacion_manual_liga(uuid,uuid,text,text,text,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FAIL 0106: authenticated sin EXECUTE encolar_comunicacion_manual_liga';
  END IF;

  RAISE NOTICE 'OK 0106: funciones, columnas, elegibilidad manual y grants correctos';
END $$;

SELECT
  to_regprocedure('public.liga_notificacion_elegible_manual(uuid,uuid)') IS NOT NULL
    AS elegible_manual,
  to_regprocedure(
    'public.encolar_comunicacion_manual_liga(uuid,uuid,text,text,text,uuid)'
  ) IS NOT NULL AS encolar_manual,
  to_regprocedure('public.encolar_bienvenida_liga(uuid,uuid)') IS NOT NULL
    AS encolar_bienvenida,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'liga_notificaciones_queue'
      AND column_name = 'cuerpo_texto'
  ) AS cola_cuerpo,
  'OK 0106: sin envíos automáticos en esta migración (solo encola; Resend aparte)'
    AS envios;
