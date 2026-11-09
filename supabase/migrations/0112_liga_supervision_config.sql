-- Correo de supervisión por liga. No envía correos ni instala cron.
-- La copia real sigue exigiendo verificación en el procesador.

ALTER TABLE public.liga_notificaciones_config
  ADD COLUMN IF NOT EXISTS supervision_email text,
  ADD COLUMN IF NOT EXISTS supervision_email_verificado text,
  ADD COLUMN IF NOT EXISTS supervision_verificado_at timestamptz,
  ADD COLUMN IF NOT EXISTS supervision_activa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supervision_alcance text NOT NULL DEFAULT 'resultados';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'liga_notificaciones_config'
      AND con.conname = 'liga_notificaciones_config_supervision_alcance_check'
  ) THEN
    ALTER TABLE public.liga_notificaciones_config
      ADD CONSTRAINT liga_notificaciones_config_supervision_alcance_check
      CHECK (supervision_alcance IN ('resultados', 'todas'));
  END IF;
END $$;
