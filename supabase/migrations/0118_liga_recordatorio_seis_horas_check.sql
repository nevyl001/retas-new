-- Correctiva. 0117 añadió el CHECK nuevo con 6 horas, pero dejó vivo el
-- CHECK legacy liga_notificaciones_config_horas_check (solo 24/12/2).
-- Guardar "6 horas antes" fallaba por ese constraint antiguo.
-- No toca la cola. No instala cron. No envía correos.

ALTER TABLE public.liga_notificaciones_config
  DROP CONSTRAINT IF EXISTS liga_notificaciones_config_horas_check;

ALTER TABLE public.liga_notificaciones_config
  DROP CONSTRAINT IF EXISTS liga_notificaciones_config_recordatorio_horas_check;

ALTER TABLE public.liga_notificaciones_config
  ADD CONSTRAINT liga_notificaciones_config_recordatorio_horas_check
  CHECK (recordatorio_horas IN (24, 12, 6, 2));
