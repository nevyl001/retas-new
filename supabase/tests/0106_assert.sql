-- Assert 0106: comunicaciones manuales sin verificación por enlace.
-- Ejecutar en el proyecto tras aplicar 0106 (lectura; no modifica datos).

DO $$
BEGIN
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
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'liga_notificaciones_queue'
      AND column_name = 'cuerpo_texto'
  ) THEN
    RAISE EXCEPTION 'FAIL 0106: falta columna cuerpo_texto';
  END IF;
  RAISE NOTICE 'OK 0106: funciones y columnas de comunicación manual presentes';
END $$;

-- El cuerpo de elegibilidad no debe exigir correo_verificado.
SELECT
  CASE
    WHEN prosrc ILIKE '%correo_verificado%'
      AND prosrc ILIKE '%correo_por_verificar%'
    THEN 'WARN 0106: elegible_manual aún menciona correo_verificado'
    ELSE 'OK 0106: elegible_manual sin gate de verificación por enlace'
  END AS check_elegible
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'liga_notificacion_elegible_manual';
