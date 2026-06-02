-- Emails solo en momentos clave:
--   1) Bienvenida al inscribir pareja (sin grupo)
--   2) Pareja asignada a grupo (inscripción con grupo)
--   3) Fin fase grupos → clasificó / no clasificó a eliminatoria
--   4) Ronda final creada → llegó a la final / no llegó a la final
-- NO se envían por cada resultado de partido ni por partido programado.
-- Ejecutar en Supabase SQL Editor.

-- Quitar triggers de resultado y programación
DROP TRIGGER IF EXISTS trg_notif_resultado_partido_au ON public.torneo_express_partidos;
DROP TRIGGER IF EXISTS trg_notif_resultado_partido_ai ON public.torneo_express_partidos;
DROP TRIGGER IF EXISTS trg_notif_resultado_elim_au ON public.torneo_express_eliminatoria_partidos;
DROP TRIGGER IF EXISTS trg_notif_resultado_elim_ai ON public.torneo_express_eliminatoria_partidos;
DROP TRIGGER IF EXISTS trg_notif_partido_programado_au ON public.torneo_express_eliminatoria_partidos;
DROP TRIGGER IF EXISTS trg_notif_partido_programado_ai ON public.torneo_express_eliminatoria_partidos;

-- Solo un aviso al insertar pareja en grupo (ya tiene grupo asignado)
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

-- Tipo no_llego_final en log
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
