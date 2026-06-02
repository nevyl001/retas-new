-- Email bienvenida_torneo al inscribir pareja (antes de asignacion_grupo).
-- Ejecutar en Supabase SQL Editor si la BD ya tiene notificaciones-solo-momentos-clave.sql.

ALTER TABLE public.notificaciones_eventos_queue
  DROP CONSTRAINT IF EXISTS notificaciones_eventos_queue_event_type_check;

ALTER TABLE public.notificaciones_eventos_queue
  ADD CONSTRAINT notificaciones_eventos_queue_event_type_check
  CHECK (event_type IN (
    'inscripcion_torneo',
    'bienvenida_torneo',
    'asignacion_grupo',
    'clasifico_eliminatoria_batch',
    'partido_programado',
    'resultado_partido'
  ));

ALTER TABLE public.notificaciones_log
  DROP CONSTRAINT IF EXISTS notificaciones_log_tipo_check;

ALTER TABLE public.notificaciones_log
  ADD CONSTRAINT notificaciones_log_tipo_check CHECK (tipo IN (
    'inscripcion_torneo',
    'bienvenida_torneo',
    'asignacion_grupo',
    'clasifico_eliminatoria',
    'no_clasifico',
    'resultado_partido',
    'clasifico_final',
    'no_llego_final',
    'recordatorio_partido',
    'proximo_partido',
    'partido_programado'
  ));

CREATE OR REPLACE FUNCTION public.trg_notif_inscripcion_grupo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_torneo_id uuid;
  v_grupo_nombre text;
  v_payload jsonb;
BEGIN
  SELECT g.torneo_id, g.nombre
  INTO v_torneo_id, v_grupo_nombre
  FROM public.torneo_express_grupos g
  WHERE g.id = NEW.grupo_id;

  IF v_torneo_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'grupo_id', NEW.grupo_id,
    'grupo_nombre', v_grupo_nombre
  );

  PERFORM public.enqueue_notif_event(
    v_torneo_id,
    'bienvenida_torneo',
    TG_TABLE_NAME,
    NEW.id,
    NEW.pareja_id,
    v_payload
  );

  PERFORM public.enqueue_notif_event(
    v_torneo_id,
    'asignacion_grupo',
    TG_TABLE_NAME,
    NEW.id,
    NEW.pareja_id,
    v_payload
  );

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
