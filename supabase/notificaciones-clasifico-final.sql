-- Añade tipo clasifico_final al log de notificaciones
ALTER TABLE public.notificaciones_log
  DROP CONSTRAINT IF EXISTS notificaciones_log_tipo_check;

ALTER TABLE public.notificaciones_log
  ADD CONSTRAINT notificaciones_log_tipo_check CHECK (tipo IN (
    'inscripcion_torneo',
    'asignacion_grupo',
    'clasifico_eliminatoria',
    'no_clasifico',
    'resultado_partido',
    'clasifico_final',
    'recordatorio_partido',
    'proximo_partido',
    'partido_programado'
  ));
