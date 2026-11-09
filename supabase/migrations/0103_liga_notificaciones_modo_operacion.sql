-- 0103: Modo de operación MANUAL (default) vs AUTOMÁTICO (opt-in).
--
-- NO APLICAR en producción hasta autorización explícita.
-- Depende de 0100 (liga_notificaciones_config).
-- No envía correos. No toca Torneo Express. No altera resultados ni jornadas.
-- No sobrescribe 0100: solo ADD COLUMN IF NOT EXISTS.
--
-- Producto:
--   * manual     — predeterminado. Envíos solo con selección + preview + confirmación.
--   * automatico — persistible, pero el worker/auto-encolado permanece apagado
--                  hasta una activación expresa de producto (no este SQL).
-- Cambio de modo NO encola ni reenvía histórico.

ALTER TABLE public.liga_notificaciones_config
  ADD COLUMN IF NOT EXISTS modo_operacion text NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'liga_notificaciones_config'
      AND con.conname = 'liga_notificaciones_config_modo_operacion_check'
  ) THEN
    ALTER TABLE public.liga_notificaciones_config
      ADD CONSTRAINT liga_notificaciones_config_modo_operacion_check
      CHECK (modo_operacion IN ('manual', 'automatico'));
  END IF;
END $$;

COMMENT ON COLUMN public.liga_notificaciones_config.modo_operacion IS
  'manual (default): el organizador confirma cada envío. automatico: opt-in; no dispara histórico ni envíos reales hasta activación expresa del producto.';
